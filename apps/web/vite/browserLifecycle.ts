// @effect-diagnostics nodeBuiltinImport:off - opt-in Node-side CI observation only.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import type { Browser, CDPSession, Page } from "playwright";
import type { PlaywrightBrowserProvider, playwright } from "vite-plus/test/browser-playwright";

type Fields = Record<string, number | boolean | null | string>;
type Emit = (event: string, fields?: Fields) => void;
const LIMIT = 2 * 1024 * 1024;

const writers = new Map<string, Emit>();
let nextProvider = 0;

function writer(directory: string): Emit | undefined {
  let fd: number;
  try {
    fd = NodeFS.openSync(NodePath.join(directory, "browser-lifecycle.jsonl"), "wx", 0o600);
  } catch {
    console.warn("Web lifecycle observation unavailable: output file.");
    return undefined;
  }
  let bytes = 0;
  let disabled = false;
  return (event, fields = {}) => {
    if (disabled) return;
    try {
      const line =
        JSON.stringify({ utc_ms: Date.now(), host_pid: process.pid, event, ...fields }) + "\n";
      if (bytes + Buffer.byteLength(line) > LIMIT) {
        disabled = true;
        NodeFS.closeSync(fd);
        console.warn("Web lifecycle observation stopped: byte budget reached.");
        return;
      }
      bytes += NodeFS.writeSync(fd, line);
    } catch {
      disabled = true;
      try {
        NodeFS.closeSync(fd);
      } catch {
        /* Observation cannot fail the test command. */
      }
      console.warn("Web lifecycle observation unavailable: write.");
    }
  };
}

function socketCategory(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.pathname === "/__vitest_browser_api__") {
      const kind = url.searchParams.get("type");
      if (kind === "tester" || kind === "orchestrator") return kind;
      return "vitest-other";
    }
    return "other";
  } catch {
    return "unknown";
  }
}

function closeCategory(code: number | null): string {
  if (code === null) return "unobserved";
  if (code === 1000) return "normal";
  if (code === 1001) return "going-away";
  if (code >= 3000 && code <= 4999) return "application";
  return "protocol-or-other";
}

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function socketErrorCategory(message: unknown): string {
  if (typeof message !== "string" || message.length > 256) return "unknown";
  if (message === "") return "empty";
  let code = message;
  for (const prefix of [
    "Error in connection establishment: ",
    "Error during WebSocket handshake: ",
  ]) {
    if (message.startsWith(prefix)) {
      code = message.slice(prefix.length);
      break;
    }
  }
  switch (code) {
    case "WebSocket opening handshake was canceled":
      return "handshake-canceled";
    case "WebSocket opening handshake timed out":
      return "handshake-timeout";
    case "Connection closed before receiving a handshake response":
      return "connection-closed-before-handshake";
    case "net::ERR_CONNECTION_RESET":
      return "connection-reset";
    case "net::ERR_CONNECTION_CLOSED":
      return "connection-closed";
    case "net::ERR_CONNECTION_ABORTED":
      return "connection-aborted";
    case "net::ERR_ABORTED":
      return "request-aborted";
    case "net::ERR_CONNECTION_REFUSED":
      return "connection-refused";
    case "net::ERR_NETWORK_CHANGED":
      return "network-changed";
    case "net::ERR_INTERNET_DISCONNECTED":
      return "network-disconnected";
    case "net::ERR_INSUFFICIENT_RESOURCES":
      return "insufficient-resources";
    case "net::ERR_TIMED_OUT":
    case "net::ERR_CONNECTION_TIMED_OUT":
      return "timeout";
    case "net::ERR_WS_PROTOCOL_ERROR":
    case "Invalid frame header":
      return "protocol-error";
    default:
      return "unknown";
  }
}

// Preserve the stock factory, prewarm, options, server, launch flags and return values.
export function observeBrowserLifecycle(provider: ReturnType<typeof playwright>) {
  const directory = process.env.T3CODE_BROWSER_LIFECYCLE_DIR;
  if (!directory) return provider;
  return {
    ...provider,
    providerFactory(project: Parameters<typeof provider.providerFactory>[0]) {
      const instance = provider.providerFactory(project) as PlaywrightBrowserProvider;
      const write = writers.get(directory) ?? writer(directory);
      if (!write) return instance;
      writers.set(directory, write);
      const providerId = ++nextProvider;
      let active = true;
      const disposers: Array<() => void> = [];
      const emit: Emit = (event, fields = {}) => {
        if (active) write(event, { provider: providerId, ...fields });
      };
      const detach = (cdp: CDPSession) => {
        try {
          void cdp.detach().catch(() => {});
        } catch {
          /* Cleanup must not change provider completion. */
        }
      };
      const track = (cdp: CDPSession) => {
        if (!active) {
          detach(cdp);
          return false;
        }
        disposers.push(() => detach(cdp));
        return true;
      };
      const openPage = instance.openPage.bind(instance);
      const close = instance.close.bind(instance);
      const browsers = new WeakSet<Browser>();
      const pages = new WeakSet<Page>();
      const targets = new Map<string, number>();
      let nextPage = 0;
      let nextTarget = 0;
      let teardown = false;
      const targetId = (raw: string) => {
        let id = targets.get(raw);
        if (id === undefined && targets.size < 4096) {
          id = ++nextTarget;
          targets.set(raw, id);
        }
        return id ?? null;
      };

      const observeBrowser = async (browser: Browser) => {
        if (!active || browsers.has(browser)) return;
        browsers.add(browser);
        const disconnected = () => emit("browser-disconnected", { teardown });
        browser.on("disconnected", disconnected);
        disposers.push(() => browser.off("disconnected", disconnected));
        const cdp = await browser.newBrowserCDPSession();
        if (!track(cdp)) return;
        cdp.on("Target.targetCrashed", ({ targetId: target, status, errorCode }) => {
          const category = ["crashed", "killed", "oom", "abnormal", "normal"].includes(status)
            ? status
            : "other";
          emit("target-crashed", {
            target: targetId(target),
            category,
            code: numeric(errorCode),
            teardown,
          });
        });
        cdp.on("Target.targetDestroyed", ({ targetId: target }) => {
          emit("target-destroyed", { target: targetId(target), teardown });
          targets.delete(target);
        });
        await cdp.send("Target.setDiscoverTargets", { discover: true });
      };

      const observePage = async (page: Page) => {
        if (!active || pages.has(page)) return;
        pages.add(page);
        const id = ++nextPage;
        emit("page-observed", { page: id });
        const closed = () => emit("page-closed", { page: id, teardown });
        const crashed = () => emit("page-crashed", { page: id, teardown });
        const navigated = (frame: ReturnType<Page["mainFrame"]>) =>
          emit("frame-navigated", {
            page: id,
            main: frame === page.mainFrame(),
            teardown,
          });
        const frameDetached = (frame: ReturnType<Page["mainFrame"]>) =>
          emit("frame-detached", {
            page: id,
            main: frame === page.mainFrame(),
            teardown,
          });
        page.on("close", closed);
        page.on("crash", crashed);
        page.on("framenavigated", navigated);
        page.on("framedetached", frameDetached);
        disposers.push(() => {
          page.off("close", closed);
          page.off("crash", crashed);
          page.off("framenavigated", navigated);
          page.off("framedetached", frameDetached);
        });
        const cdp: CDPSession = await page.context().newCDPSession(page);
        if (!track(cdp)) return;
        const { targetInfo } = await cdp.send("Target.getTargetInfo");
        if (!active) return;
        emit("page-target", { page: id, target: targetId(targetInfo.targetId) });
        const sockets = new Map<
          string,
          { id: number; category: string; code: number | null; handshake: number | null }
        >();
        let nextSocket = 0;
        const socket = (request: string) => {
          let value = sockets.get(request);
          if (!value && sockets.size < 2048) {
            value = { id: ++nextSocket, category: "unknown", code: null, handshake: null };
            sockets.set(request, value);
          }
          return value;
        };
        cdp.on("Network.webSocketCreated", ({ requestId, url }) => {
          const value = socket(requestId);
          if (value) value.category = socketCategory(url);
        });
        cdp.on("Network.webSocketHandshakeResponseReceived", ({ requestId, response }) => {
          const value = socket(requestId);
          const status = numeric(response.status);
          if (value)
            value.handshake = status !== null && status >= 100 && status <= 599 ? status : null;
        });
        const closeFrame =
          (direction: "sent" | "received") =>
          ({
            requestId,
            response,
          }: {
            requestId: string;
            response: { opcode: number; payloadData: string };
          }) => {
            if (response.opcode !== 8) return;
            const value = socket(requestId);
            if (!value) return;
            // CDP non-text payloads are base64. Decode only the two status bytes, never the reason.
            const prefix = Buffer.from(response.payloadData.slice(0, 4), "base64");
            const code = prefix.length >= 2 ? prefix.readUInt16BE(0) : null;
            value.code = code;
            emit("socket-close-frame", {
              page: id,
              socket: value.id,
              socket_kind: value.category,
              direction,
              code,
              category: closeCategory(code),
              teardown,
            });
          };
        cdp.on("Network.webSocketFrameReceived", closeFrame("received"));
        cdp.on("Network.webSocketFrameSent", closeFrame("sent"));
        cdp.on("Network.webSocketFrameError", ({ requestId, errorMessage }) => {
          const value = socket(requestId);
          if (value)
            emit("socket-error", {
              page: id,
              socket: value.id,
              socket_kind: value.category,
              category: socketErrorCategory(errorMessage),
              handshake_status: value.handshake,
              teardown,
            });
        });
        cdp.on("Network.webSocketClosed", ({ requestId }) => {
          const value = socket(requestId);
          if (value)
            emit("socket-closed", {
              page: id,
              socket: value.id,
              socket_kind: value.category,
              code: value.code,
              category: closeCategory(value.code),
              handshake_status: value.handshake,
              teardown,
            });
          sockets.delete(requestId);
        });
        await cdp.send("Network.enable");
        emit("page-observer-ready", { page: id });
      };

      instance.openPage = async (sessionId, url, options) => {
        const result = await openPage(sessionId, url, options);
        if (!active) return result;
        try {
          const page = instance.getPage(sessionId);
          const browser = page.context().browser();
          void observePage(page).catch(() => emit("page-observation-unavailable"));
          if (browser) {
            void observeBrowser(browser).catch(() => emit("browser-observation-unavailable"));
          }
        } catch {
          emit("observation-unavailable");
        }
        return result;
      };
      instance.close = (options) => {
        teardown = true;
        emit("provider-close-requested");
        try {
          return close(options);
        } finally {
          active = false;
          for (const dispose of disposers) {
            try {
              dispose();
            } catch {
              /* Observers never own the browser lifetime. */
            }
          }
          disposers.length = 0;
        }
      };
      return instance;
    },
  };
}
