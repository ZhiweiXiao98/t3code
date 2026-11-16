import { expect, it } from "vite-plus/test";
import { createFrameActivity, recordFrameActivity } from "../vite/frameActivity";

it("records only numeric data/ping/pong metadata in each direction", () => {
  const activity = createFrameActivity();
  for (const direction of ["sent", "received"] as const) {
    for (const opcode of [1, 2, 9, 10]) recordFrameActivity(activity, direction, opcode, 1234);
    expect(activity[`${direction}_data_count`]).toBe(2);
    expect(activity[`${direction}_ping_count`]).toBe(1);
    expect(activity[`${direction}_pong_count`]).toBe(1);
    for (const kind of ["data", "ping", "pong"] as const) {
      expect(activity[`${direction}_${kind}_last_utc_ms`]).toBe(1234);
    }
  }
  expect(Object.keys(activity)).toHaveLength(12);
});

it("ignores other opcodes and keeps socket state independent", () => {
  const activity = createFrameActivity();
  for (const opcode of [0, 3, 8, -1, NaN, Infinity])
    recordFrameActivity(activity, "sent", opcode, 1);
  expect(activity).toEqual(createFrameActivity());
  recordFrameActivity(activity, "sent", 1, 1);
  expect(createFrameActivity().sent_data_count).toBe(0);
});

it("saturates counters and rejects invalid timestamps", () => {
  const activity = createFrameActivity();
  for (let i = 0; i < 65_540; i++) recordFrameActivity(activity, "sent", 1, i);
  expect(activity.sent_data_count).toBe(65_535);
  expect(activity.sent_data_last_utc_ms).toBe(65_539);
  for (const time of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    recordFrameActivity(activity, "sent", 1, time);
    expect(activity.sent_data_last_utc_ms).toBeNull();
  }
});
