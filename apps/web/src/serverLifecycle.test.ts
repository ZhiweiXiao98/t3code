// @effect-diagnostics nodeBuiltinImport:off - synthetic Node-side diagnostic lifecycle fixtures.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeEvents from "node:events";
import type { ViteDevServer } from "vite-plus";
import type { playwright } from "vite-plus/test/browser-playwright";
import { observeBrowserLifecycle } from "../vite/browserLifecycle";
import { expect, it, vi } from "vite-plus/test";
import { observeBrowserServerLifecycle } from "../vite/serverLifecycle";

const faults = vi.hoisted(() => ({ open: false, write: false, partial: false, lastFlags: 0 }));
vi.mock(import("node:fs"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    openSync: ((...args: Parameters<typeof actual.openSync>) => {
      if (typeof args[1] === "number") faults.lastFlags = args[1];
      if (faults.open) throw new Error("PRIVATE_FILE_PATH");
      return actual.openSync(...args);
    }) as typeof actual.openSync,
    writeSync: ((...args: Parameters<typeof actual.writeSync>) => {
      if (faults.write) throw new Error("PRIVATE_WRITE_ERROR");
      if (faults.partial) return 0;
      return actual.writeSync(...args);
    }) as typeof actual.writeSync,
  };
});

function fixture(result: Promise<void> = Promise.resolve()) {
  faults.open = false;
  faults.write = false;
  faults.partial = false;
  const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "server-observer-"));
  const previous = process.env.T3CODE_BROWSER_LIFECYCLE_DIR;
  process.env.T3CODE_BROWSER_LIFECYCLE_DIR = directory;
  const http = Object.assign(new NodeEvents.EventEmitter(), { listening: true });
  const calls: Array<{ receiver: unknown; args: unknown[] }> = [];
  const original = function (this: unknown, ...args: unknown[]) {
    calls.push({ receiver: this, args });
    return result;
  };
  const server = { httpServer: http, close: original } as unknown as ViteDevServer;
  const attach = (target = server) => {
    observeBrowserServerLifecycle(target);
  };
  const text = () =>
    NodeFS.readFileSync(NodePath.join(directory, "browser-server-lifecycle.jsonl"), "utf8");
  const rows = () =>
    text()
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  return {
    directory,
    http,
    server,
    original,
    calls,
    attach,
    text,
    rows,
    [Symbol.dispose]() {
      faults.open = false;
      faults.write = false;
      faults.partial = false;
      http.emit("close");
      if (previous === undefined) delete process.env.T3CODE_BROWSER_LIFECYCLE_DIR;
      else process.env.T3CODE_BROWSER_LIFECYCLE_DIR = previous;
      NodeFS.rmSync(directory, { recursive: true, force: true });
    },
  };
}

it("is inert without the diagnostic directory", () => {
  using f = fixture();
  delete process.env.T3CODE_BROWSER_LIFECYCLE_DIR;
  f.attach();
  expect(f.server.close).toBe(f.original);
  expect(f.http.eventNames()).toEqual([]);
  expect(NodeFS.readdirSync(f.directory)).toEqual([]);
});

it("preserves close receiver, arguments and identical promise across warm attachments", async () => {
  const promise = Promise.resolve();
  using f = fixture(promise);
  const otherClose = vi.fn();
  const upgrade = vi.fn();
  f.http.on("close", otherClose);
  f.http.on("upgrade", upgrade);
  f.attach();
  const wrapped = f.server.close;
  f.attach();
  expect(f.server.close).toBe(wrapped);
  expect(f.http.listenerCount("close")).toBe(2);
  for (const event of ["error", "data", "readable", "end", "newListener"])
    expect(f.http.listenerCount(event)).toBe(0);
  expect(f.http.listeners("upgrade")).toEqual([upgrade]);
  const receiver = { private: "NEVER_RECORD_RECEIVER" };
  const argument = { private: "NEVER_RECORD_ARGUMENT" };
  expect(Reflect.apply(wrapped, receiver, [argument])).toBe(promise);
  expect(f.calls).toEqual([{ receiver, args: [argument] }]);
  expect(f.server.close()).toBe(promise);
  expect(f.calls).toHaveLength(2);
  await promise;
  f.http.listening = false;
  f.http.emit("close");
  expect(otherClose).toHaveBeenCalledTimes(1);
  expect(f.http.listeners("close")).toEqual([otherClose]);
  expect(f.http.listeners("upgrade")).toEqual([upgrade]);
  expect(f.server.close).toBe(f.original);
  expect(f.rows().map((row) => row.event)).toEqual([
    "server-observed",
    "server-close-requested",
    "server-close-requested",
    "http-server-closed",
  ]);
  expect(f.rows().at(-1)?.listening).toBe(false);
  expect(f.text()).not.toContain("NEVER_RECORD");
  const before = f.text();
  f.http.emit("close");
  expect(f.text()).toBe(before);
});

it("preserves rejected promises and synchronous throws without logging their contents", async () => {
  const error = new Error("PRIVATE_REJECTION");
  const promise = Promise.reject(error);
  const rejection = promise.catch((reason: unknown) => reason);
  using f = fixture(promise);
  f.attach();
  expect(f.server.close()).toBe(promise);
  expect(await rejection).toBe(error);
  using thrown = fixture();
  const original = vi.fn(() => {
    throw error;
  });
  thrown.server.close = original;
  thrown.attach();
  expect(() => thrown.server.close()).toThrow(error);
  expect(original).toHaveBeenCalledTimes(1);
  expect(f.text() + thrown.text()).not.toContain("PRIVATE_REJECTION");
});

it.each(["open", "write", "partial"] as const)("fails open on %s output failure", (kind) => {
  using f = fixture();
  if (kind === "open") faults.open = true;
  f.attach();
  if (kind !== "open") faults[kind] = true;
  const result = f.server.close();
  expect(result).toBeInstanceOf(Promise);
  expect(f.calls).toHaveLength(1);
  expect(f.server.close).toBe(f.original);
  expect(f.http.eventNames()).toEqual([]);
});

it("leaves readonly close methods and missing output directories untouched", () => {
  using f = fixture();
  Object.defineProperty(f.server, "close", { value: f.original, writable: false });
  f.attach();
  expect(f.server.close).toBe(f.original);
  expect(f.http.eventNames()).toEqual([]);
  expect(f.rows().at(-1)?.event).toBe("server-observation-unavailable");
  using missing = fixture();
  process.env.T3CODE_BROWSER_LIFECYCLE_DIR = NodePath.join(missing.directory, "absent");
  missing.attach();
  expect(missing.server.close).toBe(missing.original);
  expect(missing.http.eventNames()).toEqual([]);
});

it("does not replace a later owner's close wrapper and handles no HTTP server", () => {
  using f = fixture();
  f.attach();
  const replacement = vi.fn(() => Promise.resolve());
  f.server.close = replacement;
  f.http.emit("close");
  expect(f.server.close).toBe(replacement);
  expect(f.http.eventNames()).toEqual([]);
  using missing = fixture();
  missing.attach({ close: missing.original, httpServer: null } as unknown as ViteDevServer);
  expect(missing.rows().map((row) => row.event)).toEqual(["http-server-unavailable"]);
});

it("records only observed close events, without inventing earlier lifecycle or handling upgrades", () => {
  using f = fixture();
  f.http.emit("close");
  f.http.listening = false;
  f.attach();
  expect(f.rows().map((row) => row.event)).toEqual(["server-observed"]);
  expect(f.rows()[0]?.listening).toBe(false);
  expect(f.http.listenerCount("upgrade")).toBe(0);
  f.http.emit("upgrade", { url: "/__vitest_browser_api__?rpcId=PRIVATE_TOKEN" });
  expect(f.rows()).toHaveLength(1);
  f.http.emit("close");
  expect(f.rows().at(-1)?.event).toBe("http-server-closed");
});

it("bounds records and bytes, detaches only its listener, and continues original calls", () => {
  using f = fixture();
  const external = vi.fn();
  f.http.on("close", external);
  f.attach();
  const wrapped = f.server.close;
  for (let index = 0; index < 2200; index++) wrapped.call(f.server);
  expect(f.calls).toHaveLength(2200);
  expect(f.rows()).toHaveLength(2049);
  expect(f.rows().at(-1)?.event).toBe("observation-budget-exhausted");
  expect(Buffer.byteLength(f.text())).toBeLessThanOrEqual(256 * 1024);
  expect(f.http.listeners("close")).toEqual([external]);
  expect(f.server.close).toBe(f.original);
});

it("bounds tracked servers and removes existing observer listeners on exhaustion", () => {
  using f = fixture();
  const servers = Array.from({ length: 65 }, () => {
    const http = Object.assign(new NodeEvents.EventEmitter(), { listening: true });
    const close = vi.fn(() => Promise.resolve());
    return { http, close, server: { httpServer: http, close } as unknown as ViteDevServer };
  });
  for (const entry of servers) f.attach(entry.server);
  expect(f.rows().at(-1)?.event).toBe("server-coverage-exhausted");
  for (const entry of servers) {
    expect(entry.server.close).toBe(entry.close);
    expect(entry.http.eventNames()).toEqual([]);
  }
});

it("keeps same-directory coverage after middleware-only and closed servers", () => {
  using f = fixture();
  f.attach({ close: f.original, httpServer: null } as unknown as ViteDevServer);
  f.attach();
  f.server.close();
  f.http.emit("close");
  const nextHttp = Object.assign(new NodeEvents.EventEmitter(), { listening: true });
  const nextClose = vi.fn(() => Promise.resolve());
  const next = { httpServer: nextHttp, close: nextClose } as unknown as ViteDevServer;
  f.attach(next);
  next.close();
  nextHttp.emit("close");
  expect(f.rows().map((row) => row.event)).toEqual([
    "http-server-unavailable",
    "server-observed",
    "server-close-requested",
    "http-server-closed",
    "server-observed",
    "server-close-requested",
    "http-server-closed",
  ]);
  expect(
    f
      .rows()
      .filter((row) => row.event === "server-observed")
      .map((row) => row.server),
  ).toEqual([2, 3]);
  expect(next.close).toBe(nextClose);
  expect(nextHttp.eventNames()).toEqual([]);
});

it("stops safely before writing an oversized record", () => {
  using f = fixture();
  using _serialization = vi
    .spyOn(JSON, "stringify")
    .mockImplementationOnce(() => " ".repeat(256 * 1024));
  f.attach();
  expect(f.rows().map((row) => row.event)).toEqual(["observation-budget-exhausted"]);
  expect(Buffer.byteLength(f.text())).toBeLessThan(512);
  expect(f.server.close).toBe(f.original);
  expect(f.http.eventNames()).toEqual([]);
});

it("does not follow a replaced diagnostic path or overwrite an existing file", () => {
  using f = fixture();
  f.attach();
  const path = NodePath.join(f.directory, "browser-server-lifecycle.jsonl");
  const moved = NodePath.join(f.directory, "old.jsonl");
  NodeFS.renameSync(path, moved);
  NodeFS.writeFileSync(path, "unrelated file");
  expect(() => f.server.close()).not.toThrow();
  expect(NodeFS.readFileSync(path, "utf8")).toBe("unrelated file");
  expect(f.server.close).toBe(f.original);
  expect(f.http.eventNames()).toEqual([]);
  using occupied = fixture();
  const occupiedPath = NodePath.join(occupied.directory, "browser-server-lifecycle.jsonl");
  NodeFS.writeFileSync(occupiedPath, "existing file");
  occupied.attach();
  expect(occupied.server.close).toBe(occupied.original);
  expect(NodeFS.readFileSync(occupiedPath, "utf8")).toBe("existing file");
});

it("keeps close emission and cleanup fail-open when listening becomes unreadable", () => {
  using f = fixture();
  f.attach();
  Object.defineProperty(f.http, "listening", {
    get() {
      throw new Error("PRIVATE_LISTENING_ERROR");
    },
  });
  const external = vi.fn();
  f.http.on("close", external);
  expect(() => f.http.emit("close")).not.toThrow();
  expect(external).toHaveBeenCalledTimes(1);
  expect(f.server.close).toBe(f.original);
  expect(f.http.listeners("close")).toEqual([external]);
  expect(f.rows().at(-1)?.event).toBe("server-observation-unavailable");
  expect(f.text()).not.toContain("PRIVATE_LISTENING_ERROR");
});

it("reopens without FIFO blocking and emits only boolean listening values", () => {
  using f = fixture();
  Object.defineProperty(f.http, "listening", {
    value: "PRIVATE_MALFORMED_LISTENING",
    writable: true,
  });
  f.attach();
  expect(faults.lastFlags & NodeFS.constants.O_NONBLOCK).not.toBe(0);
  expect(faults.lastFlags & NodeFS.constants.O_NOFOLLOW).not.toBe(0);
  expect(f.rows()[0]?.listening).toBe(false);
  f.http.emit("close");
  expect(f.rows().at(-1)?.listening).toBe(false);
  expect(f.text()).not.toContain("PRIVATE_MALFORMED_LISTENING");
});

it("registers against the public browser project server, not the middleware root server", () => {
  using f = fixture();
  const decoy = { httpServer: null, close: vi.fn(() => Promise.resolve()) };
  const instance = { openPage: vi.fn(), close: vi.fn(() => Promise.resolve()) };
  const factory = vi.fn(() => instance);
  const provider = {
    name: "playwright",
    options: {},
    supportedBrowser: ["chromium"],
    prewarm: vi.fn(),
    serverFactory: vi.fn(),
    providerFactory: factory,
  } as unknown as ReturnType<typeof playwright>;
  const project = { vite: decoy, browser: { vite: f.server } } as unknown as Parameters<
    typeof provider.providerFactory
  >[0];
  const wrapped = observeBrowserLifecycle(provider);
  expect(wrapped.serverFactory).toBe(provider.serverFactory);
  expect(wrapped.prewarm).toBe(provider.prewarm);
  expect(wrapped.options).toBe(provider.options);
  expect(wrapped.providerFactory(project)).toBe(instance);
  expect(factory).toHaveBeenCalledExactlyOnceWith(project);
  expect(f.rows().map((row) => row.event)).toEqual(["server-observed"]);
  expect(f.http.listenerCount("close")).toBe(1);
  instance.close();
  // Provider shutdown must not remove the server observer before the HTTP server closes.
  expect(f.http.listenerCount("close")).toBe(1);
  f.server.close();
  f.http.emit("close");
  expect(f.rows().map((row) => row.event)).toEqual([
    "server-observed",
    "server-close-requested",
    "http-server-closed",
  ]);
  expect(decoy.close).not.toHaveBeenCalled();
});

it("keeps provider registration inert without opt-in and propagates original factory throws", () => {
  using f = fixture();
  const error = new Error("PRIVATE_FACTORY_FAILURE");
  const factory = vi.fn(() => {
    throw error;
  });
  const provider = { providerFactory: factory } as unknown as ReturnType<typeof playwright>;
  const project = { browser: { vite: f.server } } as unknown as Parameters<
    typeof provider.providerFactory
  >[0];
  delete process.env.T3CODE_BROWSER_LIFECYCLE_DIR;
  expect(observeBrowserLifecycle(provider)).toBe(provider);
  process.env.T3CODE_BROWSER_LIFECYCLE_DIR = f.directory;
  const wrapped = observeBrowserLifecycle(provider);
  expect(() => wrapped.providerFactory(project)).toThrow(error);
  expect(factory).toHaveBeenCalledExactlyOnceWith(project);
  expect(f.server.close).toBe(f.original);
  expect(NodeFS.readdirSync(f.directory)).toEqual([]);
});

it.each([undefined, {}])(
  "preserves provider creation with unavailable public browser server: %s",
  (browser) => {
    using f = fixture();
    const instance = { openPage: vi.fn(), close: vi.fn(() => Promise.resolve()) };
    const factory = vi.fn(() => instance);
    const provider = { providerFactory: factory } as unknown as ReturnType<typeof playwright>;
    const project = { browser } as unknown as Parameters<typeof provider.providerFactory>[0];
    const wrapped = observeBrowserLifecycle(provider);
    expect(wrapped.providerFactory(project)).toBe(instance);
    expect(factory).toHaveBeenCalledExactlyOnceWith(project);
    expect(factory.mock.contexts[0]).toBe(provider);
    expect(f.server.close).toBe(f.original);
    expect(NodeFS.existsSync(NodePath.join(f.directory, "browser-server-lifecycle.jsonl"))).toBe(
      false,
    );
    instance.close();
  },
);

it("attaches only once when the same provider factory is reused for the same browser server", () => {
  using f = fixture();
  const factory = vi.fn(() => ({ openPage: vi.fn(), close: vi.fn(() => Promise.resolve()) }));
  const provider = { providerFactory: factory } as unknown as ReturnType<typeof playwright>;
  const project = { browser: { vite: f.server } } as unknown as Parameters<
    typeof provider.providerFactory
  >[0];
  const wrapped = observeBrowserLifecycle(provider);
  const first = wrapped.providerFactory(project);
  const close = f.server.close;
  const second = wrapped.providerFactory(project);
  expect(first).not.toBe(second);
  expect(factory).toHaveBeenCalledTimes(2);
  expect(factory.mock.contexts).toEqual([provider, provider]);
  expect(f.server.close).toBe(close);
  expect(f.http.listenerCount("close")).toBe(1);
  expect(f.rows().map((row) => row.event)).toEqual(["server-observed"]);
  first.close();
  second.close();
  expect(f.http.listenerCount("close")).toBe(1);
});
