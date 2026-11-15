// @effect-diagnostics nodeBuiltinImport:off - opt-in Node-side CI observation only.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import type { ViteDevServer } from "vite-plus";

type Fields = Record<string, number | boolean>;
const MAX_EVENTS = 2048;
const MAX_BYTES = 256 * 1024;
const MAX_SERVERS = 64;

function createObserver(directory: string) {
  const path = NodePath.join(directory, "browser-server-lifecycle.jsonl");
  let identity: { dev: number; ino: number };
  let initial: number | undefined;
  try {
    initial = NodeFS.openSync(path, "wx", 0o600);
    const stat = NodeFS.fstatSync(initial);
    identity = { dev: stat.dev, ino: stat.ino };
  } catch {
    return undefined;
  } finally {
    if (initial !== undefined) {
      try {
        NodeFS.closeSync(initial);
      } catch {
        /* Fail open. */
      }
    }
  }
  // Close the descriptor after each record. Middleware-only and later replacement Vite
  // servers can share the same bounded observer without keeping an idle descriptor open.
  const write = (line: string) => {
    const fd = NodeFS.openSync(
      path,
      NodeFS.constants.O_WRONLY |
        NodeFS.constants.O_APPEND |
        NodeFS.constants.O_NOFOLLOW |
        NodeFS.constants.O_NONBLOCK,
    );
    try {
      const stat = NodeFS.fstatSync(fd);
      if (stat.dev !== identity.dev || stat.ino !== identity.ino)
        throw new Error("Diagnostic file replaced");
      return NodeFS.writeSync(fd, line);
    } finally {
      NodeFS.closeSync(fd);
    }
  };
  let active = true;
  let bytes = 0;
  let events = 0;
  let nextServer = 0;
  const seen = new WeakSet<ViteDevServer>();
  const cleanups = new Set<() => void>();
  const stop = () => {
    if (!active) return;
    active = false;
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch {
        /* Observation never owns server lifetime. */
      }
    }
    cleanups.clear();
  };
  const emit = (event: string, fields: Fields = {}) => {
    if (!active) return;
    try {
      const line =
        JSON.stringify({ utc_ms: Date.now(), host_pid: process.pid, event, ...fields }) + "\n";
      if (events >= MAX_EVENTS || bytes + Buffer.byteLength(line) > MAX_BYTES - 512) {
        const marker =
          JSON.stringify({ event: "observation-budget-exhausted", events, bytes }) + "\n";
        write(marker);
        stop();
        return;
      }
      const written = write(line);
      if (written !== Buffer.byteLength(line)) {
        stop();
        return;
      }
      bytes += written;
      events++;
    } catch {
      stop();
    }
  };
  return (server: ViteDevServer) => {
    if (!active || seen.has(server)) return;
    seen.add(server);
    if (nextServer >= MAX_SERVERS) {
      emit("server-coverage-exhausted");
      stop();
      return;
    }
    const id = ++nextServer;
    const http = server.httpServer;
    if (!http) {
      emit("http-server-unavailable", { server: id });
      return;
    }
    let attached = true;
    const originalClose = server.close;
    // Do not make this async or chain the returned promise: preserve exact return/throw semantics.
    const close: typeof server.close = function (this: ViteDevServer, ...args) {
      emit("server-close-requested", { server: id });
      return Reflect.apply(originalClose, this, args);
    };
    const cleanup = () => {
      if (!attached) return;
      attached = false;
      try {
        http.off("close", closed);
      } catch {
        /* Fail open. */
      }
      try {
        if (server.close === close) server.close = originalClose;
      } catch {
        /* Fail open. */
      }
      cleanups.delete(cleanup);
    };
    const closed = () => {
      try {
        emit("http-server-closed", { server: id, listening: http.listening === true });
      } catch {
        emit("server-observation-unavailable", { server: id });
      } finally {
        cleanup();
      }
    };
    cleanups.add(cleanup);
    try {
      http.on("close", closed);
      server.close = close;
      emit("server-observed", { server: id, listening: http.listening === true });
    } catch {
      cleanup();
      emit("server-observation-unavailable", { server: id });
    }
  };
}

// Independent of warm browser provider reuse. No upgrade, socket, error, or data listeners.
const observers = new Map<string, ReturnType<typeof createObserver>>();
export function observeBrowserServerLifecycle(server: ViteDevServer): void {
  const directory = process.env.T3CODE_BROWSER_LIFECYCLE_DIR;
  if (!directory) return;
  try {
    if (!observers.has(directory)) {
      if (observers.size >= 32) return;
      observers.set(directory, createObserver(directory));
    }
    observers.get(directory)?.(server);
  } catch {
    /* Optional diagnostics must not affect provider startup. */
  }
}
