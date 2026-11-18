const METHODS = new Set([
  "Browser.close",
  "Target.createBrowserContext",
  "Target.createTarget",
  "Target.attachToTarget",
  "Target.closeTarget",
  "Page.enable",
  "Runtime.enable",
  "Log.enable",
  "Emulation.setEmulatedMedia",
  "Page.addScriptToEvaluateOnNewDocument",
  "Fetch.enable",
  "Emulation.setDeviceMetricsOverride",
  "Page.navigate",
  "Runtime.evaluate",
  "Page.captureScreenshot",
  "Fetch.fulfillRequest",
  "Fetch.continueRequest",
  "Fetch.failRequest",
]);
type Phase =
  | "scratch"
  | "launch"
  | "setup"
  | "load"
  | "settle"
  | "measure"
  | "screenshot"
  | "cleanup";
type Event = { elapsedMs: number; event: string; method?: string; errorCode?: number };

export function createCaptureDiagnostics(enabled: boolean, now = Date.now) {
  const started = now();
  let phase: Phase = "scratch";
  let lastWorkPhase: Phase = "scratch";
  const events: Event[] = [];
  const pending = new Map<number, string>();
  let omitted = 0;
  const record = (event: Event) => {
    if (!enabled) return;
    if (events.length === 64) {
      events.shift();
      omitted++;
    }
    events.push(event);
  };
  return {
    phase(value: Phase) {
      phase = value;
      if (value !== "cleanup") lastWorkPhase = value;
      record({ elapsedMs: now() - started, event: value });
    },
    event(
      value:
        | "load-fired"
        | "fetch-fulfill"
        | "fetch-main-deny"
        | "fetch-subframe-allow"
        | "fetch-other-deny"
        | "disconnected",
    ) {
      record({ elapsedMs: now() - started, event: value });
    },
    sent(id: number, method: string) {
      if (!enabled || !METHODS.has(method)) return;
      if (pending.size < 32) pending.set(id, method);
      record({ elapsedMs: now() - started, event: "sent", method });
    },
    reply(id: number, failed: boolean, errorCode?: unknown) {
      const method = pending.get(id);
      pending.delete(id);
      if (method)
        record({
          elapsedMs: now() - started,
          event: failed ? "error" : "ack",
          method,
          ...(typeof errorCode === "number" && Number.isSafeInteger(errorCode)
            ? { errorCode }
            : {}),
        });
    },
    report() {
      return {
        marker: "t3-html-render-diagnostic",
        schemaVersion: 1,
        phase,
        lastWorkPhase,
        elapsedMs: now() - started,
        events: [...events],
        omitted,
        pending: [...pending.values()],
      };
    },
  };
}
