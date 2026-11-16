// @effect-diagnostics nodeBuiltinImport:off - synthetic Node-side diagnostic fixtures.
import * as NodeEvents from "node:events";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import type { playwright } from "vite-plus/test/browser-playwright";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { observeBrowserLifecycle } from "../vite/browserLifecycle";

afterEach(() => vi.unstubAllEnvs());

function fixture() {
  const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "socket-snapshot-"));
  vi.stubEnv("T3CODE_BROWSER_LIFECYCLE_DIR", directory);
  const state = { pageClosed: false, contextClosed: false };
  const result = Promise.resolve();
  const close = vi.fn(() => result);
  const cdps: Array<NodeEvents.EventEmitter & { detach: ReturnType<typeof vi.fn> }> = [];
  const instance = {
    openPage: vi.fn(async () => {}),
    close,
    getPage() {
      const cdp = Object.assign(new NodeEvents.EventEmitter(), {
        send: async () => ({ targetInfo: { targetId: "PRIVATE_TARGET" } }),
        detach: vi.fn(() => Promise.resolve()),
      });
      cdps.push(cdp);
      return Object.assign(new NodeEvents.EventEmitter(), {
        context: () => ({
          browser: () => null,
          newCDPSession: async () => cdp,
          isClosed: () => state.contextClosed,
        }),
        isClosed: () => state.pageClosed,
        mainFrame: () => null,
      });
    },
  };
  const provider = { providerFactory: () => instance } as unknown as ReturnType<typeof playwright>;
  const observed = observeBrowserLifecycle(provider).providerFactory(
    {} as Parameters<typeof provider.providerFactory>[0],
  );
  const text = () =>
    NodeFS.readFileSync(NodePath.join(directory, "browser-lifecycle.jsonl"), "utf8");
  const rows = () =>
    text()
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  return { observed, close, result, cdps, rows, text, state };
}

async function open(f: ReturnType<typeof fixture>) {
  await f.observed.openPage("PRIVATE_SESSION", "http://localhost/PRIVATE_URL", { parallel: false });
  for (let i = 0; i < 8; i++) await Promise.resolve();
  return f.cdps.at(-1)!;
}

it("flushes healthy observed traffic before cleanup without changing the original close promise", async () => {
  const f = fixture();
  const cdp = await open(f);
  cdp.emit("Network.webSocketCreated", {
    requestId: "PRIVATE_ID",
    url: "ws://localhost/__vitest_browser_api__?type=tester",
  });
  const response = {
    opcode: 1,
    get payloadData(): string {
      throw new Error("PRIVATE_PAYLOAD");
    },
  };
  cdp.emit("Network.webSocketFrameReceived", { requestId: "PRIVATE_ID", response });
  const options = { keepWarm: true };
  expect(f.observed.close(options)).toBe(f.result);
  expect(f.close).toHaveBeenCalledExactlyOnceWith(options);
  expect(cdp.detach).toHaveBeenCalledTimes(1);
  const snapshot = f.rows().find((row) => row.event === "socket-activity-snapshot");
  expect(snapshot).toMatchObject({
    reason: "normalteardown",
    socket_kind: "tester",
    received_data_count: 1,
  });
  expect(f.text()).not.toContain("PRIVATE_");
  const before = f.text();
  expect(f.observed.close(options)).toBe(f.result);
  expect(f.text()).toBe(before);
  expect(cdp.detach).toHaveBeenCalledTimes(1);
});

it("reports empty observations and preserves synchronous close throws with cleanup", async () => {
  const f = fixture();
  const cdp = await open(f);
  const error = new Error("original close failure");
  f.close.mockImplementation(() => {
    throw error;
  });
  expect(() => f.observed.close()).toThrow(error);
  expect(cdp.detach).toHaveBeenCalledTimes(1);
  expect(f.rows().find((row) => row.event === "socket-activity-coverage")).toMatchObject({
    tracked_sockets: 0,
    emitted_sockets: 0,
    omitted_sockets: 0,
  });
});

it("limits snapshots to sixteen sockets per page and prioritizes fixed Vitest categories", async () => {
  const f = fixture();
  const cdp = await open(f);
  for (let i = 0; i < 25; i++)
    cdp.emit("Network.webSocketCreated", {
      requestId: String(i),
      url: i === 24 ? "ws://localhost/__vitest_browser_api__?type=tester" : "ws://localhost/other",
    });
  f.observed.close();
  const snapshots = f.rows().filter((row) => row.event === "socket-activity-snapshot");
  expect(snapshots).toHaveLength(16);
  expect(snapshots[0]?.socket_kind).toBe("tester");
  expect(f.rows().find((row) => row.event === "socket-activity-coverage")).toMatchObject({
    tracked_sockets: 25,
    emitted_sockets: 16,
    omitted_sockets: 9,
  });
});

it("bounds retained page callbacks and reports omitted page coverage", async () => {
  const f = fixture();
  for (let i = 0; i < 65; i++) await open(f);
  f.observed.close();
  expect(f.rows().filter((row) => row.event === "socket-activity-coverage")).toHaveLength(64);
  expect(f.rows().find((row) => row.event === "socket-activity-pages")).toMatchObject({
    observed_pages: 65,
    snapshot_pages: 64,
    omitted_pages: 1,
  });
  for (const cdp of f.cdps) expect(cdp.detach).toHaveBeenCalledTimes(1);
});

it("samples lifecycle states freshly on error, closed and teardown snapshot records", async () => {
  const f = fixture();
  const cdp = await open(f);
  cdp.emit("Network.webSocketFrameError", { requestId: "first", errorMessage: "" });
  expect(f.rows().find((row) => row.event === "socket-error")).toMatchObject({
    page_closed: false,
    context_closed: false,
    browser_connected: null,
  });
  f.state.contextClosed = true;
  cdp.emit("Network.webSocketClosed", { requestId: "first" });
  expect(f.rows().find((row) => row.event === "socket-closed")).toMatchObject({
    page_closed: false,
    context_closed: true,
    browser_connected: null,
  });
  cdp.emit("Network.webSocketCreated", {
    requestId: "second",
    url: "ws://localhost/__vitest_browser_api__?type=tester",
  });
  f.state.pageClosed = true;
  expect(f.observed.close()).toBe(f.result);
  expect(f.rows().find((row) => row.event === "socket-activity-snapshot")).toMatchObject({
    page_closed: true,
    context_closed: true,
    browser_connected: null,
  });
});
