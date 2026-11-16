import { expect, it } from "vite-plus/test";
import {
  installSocketListeners,
  orchestratorObservationScripts,
  parseSocketRecord,
} from "../vite/orchestratorSocket";

class SocketFixture extends EventTarget {
  readyState = 1;
  get socket() {
    return this as unknown as WebSocket;
  }
}

it("observes the current OPEN socket without fabricating its earlier open event", () => {
  const socket = new SocketFixture();
  const records: unknown[] = [];
  const { stop } = installSocketListeners(socket.socket, (row) => records.push(row));
  expect(records).toEqual([
    expect.objectContaining({ event: "attached", sequence: 1, ready_state: 1, code: null }),
  ]);
  stop();
  stop();
  socket.dispatchEvent(new Event("error"));
  expect(records).toHaveLength(1);
});

it("emits close scalars only and leaves other listeners unchanged", () => {
  const socket = new SocketFixture();
  const records: unknown[] = [];
  let stockCalls = 0;
  socket.addEventListener("close", () => stockCalls++);
  installSocketListeners(socket.socket, (row) => records.push(row));
  socket.readyState = 3;
  const event = new Event("close");
  Object.assign(event, { code: 1006, wasClean: false, reason: "PRIVATE_REASON_AND_TOKEN" });
  socket.dispatchEvent(event);
  expect(stockCalls).toBe(1);
  expect(records).toHaveLength(2);
  expect(records[1]).toEqual({
    event: "close",
    sequence: 2,
    utc_ms: expect.any(Number),
    ready_state: 3,
    code: 1006,
    wasClean: false,
    reasonEmpty: false,
  });
  expect(JSON.stringify(records)).not.toContain("PRIVATE");
});

it("coalesces repeated events and stops observation after close", () => {
  const socket = new SocketFixture();
  const records: unknown[] = [];
  installSocketListeners(socket.socket, (row) => records.push(row));
  for (let i = 0; i < 1_000; i++) {
    socket.dispatchEvent(new Event("open"));
    socket.dispatchEvent(new Event("error"));
  }
  const close = new Event("close");
  Object.assign(close, { code: 1000, wasClean: true, reason: "" });
  socket.dispatchEvent(close);
  socket.dispatchEvent(new Event("error"));
  expect(records).toHaveLength(4);
});

it("records a closed-before-attachment state without inventing a close event", () => {
  const socket = new SocketFixture();
  socket.readyState = 3;
  const records: unknown[] = [];
  installSocketListeners(socket.socket, (row) => records.push(row));
  socket.dispatchEvent(new Event("close"));
  expect(records).toEqual([expect.objectContaining({ event: "attached", ready_state: 3 })]);
});

it("rejects non-scalar or unknown fields before artifact emission", () => {
  const valid = {
    event: "close",
    sequence: 2,
    utc_ms: 1,
    ready_state: 3,
    code: 1006,
    wasClean: false,
    reasonEmpty: true,
  };
  expect(parseSocketRecord(valid)).toEqual(valid);
  for (const invalid of [
    { ...valid, reason: "PRIVATE" },
    { ...valid, code: 5000 },
    { ...valid, event: "PRIVATE" },
    { ...valid, wasClean: "PRIVATE" },
    { ...valid, sequence: 17 },
    { ...valid, utc_ms: Number.POSITIVE_INFINITY },
  ])
    expect(parseSocketRecord(invalid)).toBeUndefined();
});

it("keeps the optional main-window script inert until its deferred installer is called", () => {
  expect(orchestratorObservationScripts(false)).toEqual([]);
  const scripts = orchestratorObservationScripts(true);
  expect(scripts).toHaveLength(1);
  expect(scripts[0]?.content).toContain('value: () => import("vite-plus/test/client")');
  expect(scripts[0]?.content).not.toContain("new WebSocket");
  expect(scripts[0]?.content).not.toContain("setTimeout");
  expect(scripts[0]?.content).not.toContain("setInterval");
});
