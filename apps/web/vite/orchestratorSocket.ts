import type { Page } from "playwright";

const INSTALL = "__t3codeInstallOrchestratorObservation";
const STOP = "__t3codeStopOrchestratorObservation";
const CANCELLED = "__t3codeOrchestratorObservationCancelled";
const BINDING = "__t3codeOrchestratorObservationRecord";
const MAX_RECORDS = 16;

type SocketRecord = {
  event: "attached" | "open" | "error" | "close";
  sequence: number;
  utc_ms: number;
  ready_state: number;
  code: number | null;
  wasClean: boolean | null;
  reasonEmpty: boolean | null;
};
type Emit = (event: string, fields?: Record<string, number | boolean | null | string>) => void;

// Serialized into the main-window script: keep this function self-contained.
export function installSocketListeners(
  socket: WebSocket,
  relay: (record: SocketRecord) => unknown,
) {
  let active = true;
  let sequence = 0;
  let observed = false;
  const seen = new Set<string>();
  const stop = () => {
    active = false;
    for (const [event, listener] of listeners) {
      try {
        socket.removeEventListener(event, listener);
      } catch {
        // Observation does not own the socket.
      }
    }
  };
  const record = (event: SocketRecord["event"], close?: CloseEvent) => {
    try {
      if (!active || seen.has(event) || sequence >= 16) return;
      seen.add(event);
      const ready = socket.readyState;
      if (!Number.isInteger(ready) || ready < 0 || ready > 3) return;
      const code = close?.code;
      const row: SocketRecord = {
        event,
        sequence: ++sequence,
        utc_ms: Date.now(),
        ready_state: ready,
        code:
          typeof code === "number" && Number.isInteger(code) && code >= 1000 && code <= 4999
            ? code
            : null,
        wasClean: close && typeof close.wasClean === "boolean" ? close.wasClean : null,
        reasonEmpty: close && typeof close.reason === "string" ? close.reason === "" : null,
      };
      void Promise.resolve(relay(row)).catch(() => {});
      return true;
    } catch {
      // A failed diagnostic callback must not affect Vitest's listeners.
    }
  };
  const listeners: Array<[string, EventListener]> = [
    ["open", () => record("open")],
    ["error", () => record("error")],
    [
      "close",
      (event) => {
        record("close", event as CloseEvent);
        stop();
      },
    ],
  ];
  try {
    for (const [event, listener] of listeners) socket.addEventListener(event, listener);
    observed = record("attached") === true;
    if (socket.readyState === 3) stop();
  } catch {
    stop();
  }
  return { stop, observed };
}

export function orchestratorObservationScripts(enabled: boolean) {
  if (!enabled) return [];
  return [
    {
      id: "t3code-orchestrator-observation.js",
      content: `try {
      const install = ${installSocketListeners.toString()};
      Object.defineProperty(globalThis, ${JSON.stringify(INSTALL)}, {
        configurable: true,
        value: () => import("vite-plus/test/client").then(({ client }) => {
          if (globalThis[${JSON.stringify(CANCELLED)}]) return "cancelled";
          if (globalThis[${JSON.stringify(STOP)}]) return "already-installed";
          const relay = globalThis[${JSON.stringify(BINDING)}];
          if (typeof relay !== "function") return "unavailable";
          const observation = install(client.ws, relay);
          globalThis[${JSON.stringify(STOP)}] = observation.stop;
          return observation.observed ? "observed" : "unavailable";
        })
      });
    } catch { /* Opt-in observation must be fail-open. */ }`,
    },
  ];
}

export function parseSocketRecord(value: unknown): SocketRecord | undefined {
  try {
    if (value === null || typeof value !== "object") return;
    const keys = Object.keys(value).sort().join(",");
    if (keys !== "code,event,ready_state,reasonEmpty,sequence,utc_ms,wasClean") return;
    const row = value as SocketRecord;
    if (!["attached", "open", "error", "close"].includes(row.event)) return;
    if (!Number.isSafeInteger(row.sequence) || row.sequence < 1 || row.sequence > MAX_RECORDS)
      return;
    if (!Number.isSafeInteger(row.utc_ms) || row.utc_ms < 0) return;
    if (!Number.isInteger(row.ready_state) || row.ready_state < 0 || row.ready_state > 3) return;
    if (row.event === "close") {
      if (row.code !== null && (!Number.isInteger(row.code) || row.code < 1000 || row.code > 4999))
        return;
      if (typeof row.wasClean !== "boolean" || typeof row.reasonEmpty !== "boolean") return;
    } else if (row.code !== null || row.wasClean !== null || row.reasonEmpty !== null) return;
    return {
      event: row.event,
      sequence: row.sequence,
      utc_ms: row.utc_ms,
      ready_state: row.ready_state,
      code: row.code,
      wasClean: row.wasClean,
      reasonEmpty: row.reasonEmpty,
    };
  } catch {
    return;
  }
}

export function observeOrchestratorSocket(page: Page, emit: Emit, alive: () => boolean) {
  let active = true;
  let count = 0;
  let cleanupRequested = false;
  let lastSequence = 0;
  const seen = new Set<string>();
  const cleanup = () => {
    active = false;
    if (cleanupRequested) return;
    cleanupRequested = true;
    try {
      void page
        .evaluate(
          ({ cancel, stop }) => {
            Reflect.set(globalThis, cancel, true);
            const dispose = Reflect.get(globalThis, stop);
            if (typeof dispose === "function") dispose();
          },
          { cancel: CANCELLED, stop: STOP },
        )
        .catch(() => {});
    } catch {
      // Cleanup never waits for, closes, or owns the page.
    }
  };
  const run = async () => {
    await page.exposeBinding(BINDING, (source, value: unknown) => {
      try {
        if (!active || !alive() || count >= MAX_RECORDS) return;
        if (source.page !== page || source.frame !== page.mainFrame()) return;
        const row = parseSocketRecord(value);
        if (!row || row.sequence <= lastSequence || seen.has(row.event)) return;
        lastSequence = row.sequence;
        seen.add(row.event);
        count++;
        emit(`orchestrator-socket-${row.event}`, {
          sequence: row.sequence,
          browser_utc_ms: row.utc_ms,
          ready_state: row.ready_state,
          code: row.code,
          wasClean: row.wasClean,
          reasonEmpty: row.reasonEmpty,
        });
      } catch {
        // The public binding carries diagnostic scalars only.
      }
    });
    if (!active || !alive()) return;
    const outcome = await page.evaluate(async (key) => {
      const install = Reflect.get(globalThis, key);
      return typeof install === "function" ? await install() : "unavailable";
    }, INSTALL);
    if (!active || !alive()) cleanup();
    else if (outcome !== "observed" && outcome !== "already-installed") {
      emit("orchestrator-socket-observation-unavailable");
    }
  };
  void run().catch(() => {
    try {
      if (active && alive()) emit("orchestrator-socket-observation-unavailable");
    } catch {
      // Do not leak exception text or fail the stock test path.
    }
  });
  return cleanup;
}
