// Bounded CDP observations, not proof of WebSocket control-frame coverage.
const COUNT_LIMIT = 65_535;

export function createFrameActivity() {
  return {
    sent_data_count: 0,
    sent_data_last_utc_ms: null as number | null,
    received_data_count: 0,
    received_data_last_utc_ms: null as number | null,
    sent_ping_count: 0,
    sent_ping_last_utc_ms: null as number | null,
    received_ping_count: 0,
    received_ping_last_utc_ms: null as number | null,
    sent_pong_count: 0,
    sent_pong_last_utc_ms: null as number | null,
    received_pong_count: 0,
    received_pong_last_utc_ms: null as number | null,
  };
}

export function recordFrameActivity(
  activity: ReturnType<typeof createFrameActivity>,
  direction: "sent" | "received",
  opcode: number,
  utcMs: number,
): void {
  const kind =
    opcode === 1 || opcode === 2 ? "data" : opcode === 9 ? "ping" : opcode === 10 ? "pong" : null;
  if (kind === null) return;
  const count = `${direction}_${kind}_count` as const;
  const last = `${direction}_${kind}_last_utc_ms` as const;
  activity[count] = Math.min(COUNT_LIMIT, activity[count] + 1);
  activity[last] = Number.isSafeInteger(utcMs) && utcMs >= 0 ? utcMs : null;
}
