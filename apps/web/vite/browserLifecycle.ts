// @effect-diagnostics nodeBuiltinImport:off - opt-in Node-side CI observation only.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import type { Browser, CDPSession, Page } from "playwright";
import type { PlaywrightBrowserProvider, playwright } from "vite-plus/test/browser-playwright";
import { createFrameActivity, recordFrameActivity } from "./frameActivity";
import { observeBrowserServerLifecycle } from "./serverLifecycle";

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

function networkProcessSnapshot(value: unknown): { pids: Set<number>; count: number } | undefined {
  if (value === null || typeof value !== "object" || !("processInfo" in value)) return;
  const records: unknown = value.processInfo;
  if (!Array.isArray(records) || records.length > 256) return;
  const pids = new Set<number>();
  const seen = new Set<number>();
  for (const record of records as unknown[]) {
    if (record === null || typeof record !== "object" || !("id" in record) || !("type" in record))
      return;
    const pid = numeric(record.id);
    if (
      pid === null ||
      pid <= 0 ||
      seen.has(pid) ||
      typeof record.type !== "string" ||
      record.type.length > 256
    )
      return;
    seen.add(pid);
    if (record.type === "network.mojom.NetworkService") pids.add(pid);
  }
  return { pids, count: records.length };
}

// Preserve the stock factory, prewarm, options, server, launch flags and return values.
export function observeBrowserLifecycle(provider: ReturnType<typeof playwright>) {
  const directory = process.env.T3CODE_BROWSER_LIFECYCLE_DIR;
  if (!directory) return provider;
  return {
    ...provider,
    providerFactory(project: Parameters<typeof provider.providerFactory>[0]) {
      const instance = provider.providerFactory(project) as PlaywrightBrowserProvider;
      try {
        // The public browser project owns the real HTTP server; root Vite config can be middleware-only.
        if (project.browser?.vite) observeBrowserServerLifecycle(project.browser.vite);
      } catch {
        /* Diagnostic registration must not change provider creation. */
      }
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
      const browserIds = new WeakMap<Browser, number>();
      const processSamplers = new WeakMap<
        Browser,
        { error: () => void; stop: (reason: string) => void }
      >();
      const processErrorSeen = new WeakSet<Browser>();
      const stopProcessSamplers: Array<() => void> = [];
      let nextBrowser = 0;
      let processRequests = 0;
      const browserId = (browser: Browser) => {
        let id = browserIds.get(browser);
        if (id === undefined) {
          id = ++nextBrowser;
          browserIds.set(browser, id);
        }
        return id;
      };
      const observeProcesses = (browser: Browser, cdp: CDPSession) => {
        const id = browserId(browser);
        let stopped = false;
        let inFlight = false;
        let followup = false;
        let sequence = 0;
        let previous: Set<number> | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const stop = (reason: string) => {
          if (stopped) return;
          stopped = true;
          clearTimeout(timer);
          timer = undefined;
          emit("process-sampling-stopped", {
            browser: id,
            reason,
            pending: inFlight,
            samples: sequence,
          });
          previous = undefined;
          processSamplers.delete(browser);
        };
        const sample = async (reason: string) => {
          if (!active || stopped || inFlight) return;
          if (processRequests >= 512) {
            stop("budget");
            return;
          }
          processRequests++;
          inFlight = true;
          const sampleId = ++sequence;
          const requested = Date.now();
          emit("process-sample-requested", {
            browser: id,
            sample: sampleId,
            requested_ms: requested,
            reason,
          });
          try {
            const response: unknown = await cdp.send("SystemInfo.getProcessInfo");
            if (!active || stopped) return;
            const snapshot = networkProcessSnapshot(response);
            emit("process-sample-completed", {
              browser: id,
              sample: sampleId,
              requested_ms: requested,
              result: snapshot ? "complete" : "invalid",
              process_count: snapshot?.count ?? null,
              network_count: snapshot?.pids.size ?? null,
            });
            if (snapshot) {
              for (const pid of snapshot.pids) {
                if (!previous?.has(pid))
                  emit("network-service-observed", { browser: id, sample: sampleId, pid });
              }
              if (previous) {
                for (const pid of previous) {
                  if (!snapshot.pids.has(pid))
                    emit("network-service-missing", { browser: id, sample: sampleId, pid });
                }
              }
              previous = snapshot.pids;
            }
          } catch {
            if (active && !stopped)
              emit("process-sample-completed", {
                browser: id,
                sample: sampleId,
                requested_ms: requested,
                result: "unavailable",
              });
          } finally {
            inFlight = false;
            if (active && !stopped) {
              if (followup) {
                followup = false;
                void sample("socket-error");
              } else if (processRequests >= 512) {
                stop("budget");
              } else {
                timer = setTimeout(() => {
                  timer = undefined;
                  void sample("periodic");
                }, 5000);
                timer.unref();
              }
            }
          }
        };
        const error = () => {
          if (!active || stopped) return;
          if (inFlight) followup = true;
          else {
            clearTimeout(timer);
            timer = undefined;
            void sample("socket-error");
          }
        };
        processSamplers.set(browser, { error, stop });
        stopProcessSamplers.push(() => stop("provider-close"));
        void sample("initial");
        if (processErrorSeen.has(browser)) error();
      };
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
        let isDisconnected = false;
        const disconnected = () => {
          isDisconnected = true;
          emit("browser-disconnected", { teardown });
          processSamplers.get(browser)?.stop("browser-disconnected");
        };
        browser.on("disconnected", disconnected);
        disposers.push(() => browser.off("disconnected", disconnected));
        const cdp = await browser.newBrowserCDPSession();
        if (!track(cdp)) return;
        if (!isDisconnected) {
          try {
            observeProcesses(browser, cdp);
          } catch {
            emit("process-observation-unavailable", { browser: browserId(browser) });
          }
        }
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

      const observePage = async (page: Page, browser: Browser | null) => {
        if (!active || pages.has(page)) return;
        pages.add(page);
        const id = ++nextPage;
        emit("page-observed", { page: id, browser: browser ? browserId(browser) : null });
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
          {
            id: number;
            category: string;
            code: number | null;
            handshake: number | null;
            activity: ReturnType<typeof createFrameActivity>;
          }
        >();
        let nextSocket = 0;
        const socket = (request: string) => {
          let value = sockets.get(request);
          if (!value && sockets.size < 2048) {
            value = {
              id: ++nextSocket,
              category: "unknown",
              code: null,
              handshake: null,
              activity: createFrameActivity(),
            };
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
            if (response.opcode !== 8) {
              if (
                response.opcode !== 1 &&
                response.opcode !== 2 &&
                response.opcode !== 9 &&
                response.opcode !== 10
              )
                return;
              const value = socket(requestId);
              if (value)
                recordFrameActivity(value.activity, direction, response.opcode, Date.now());
              return;
            }
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
              ...value.activity,
              teardown,
            });
          if (active && browser && !processErrorSeen.has(browser)) {
            processErrorSeen.add(browser);
            processSamplers.get(browser)?.error();
          }
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
              ...value.activity,
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
          void observePage(page, browser).catch(() => emit("page-observation-unavailable"));
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
          for (const stop of stopProcessSamplers) {
            try {
              stop();
            } catch {
              /* Sampling never owns the browser lifetime. */
            }
          }
          stopProcessSamplers.length = 0;
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
