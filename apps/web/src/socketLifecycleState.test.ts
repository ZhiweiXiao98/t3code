import { expect, it } from "vite-plus/test";
import { sampleSocketLifecycleState } from "../vite/socketLifecycleState";

it("samples public open, closing, closed and disconnected states at each call", () => {
  let pageClosed = false;
  let contextClosed = false;
  let connected = true;
  const page = { isClosed: () => pageClosed, context: () => ({ isClosed: () => contextClosed }) };
  const browser = { isConnected: () => connected };
  expect(sampleSocketLifecycleState(page, browser)).toEqual({
    page_closed: false,
    context_closed: false,
    browser_connected: true,
  });
  contextClosed = true;
  expect(sampleSocketLifecycleState(page, browser)).toEqual({
    page_closed: false,
    context_closed: true,
    browser_connected: true,
  });
  pageClosed = true;
  connected = false;
  expect(sampleSocketLifecycleState(page, browser)).toEqual({
    page_closed: true,
    context_closed: true,
    browser_connected: false,
  });
});

it("reports absent or malformed states as null without coercion", () => {
  const page = { isClosed: () => "PRIVATE_VALUE", context: () => ({ isClosed: () => 1 }) };
  expect(sampleSocketLifecycleState(page, null)).toEqual({
    page_closed: null,
    context_closed: null,
    browser_connected: null,
  });
  expect(
    sampleSocketLifecycleState(page, { isConnected: () => Promise.resolve(true) })
      .browser_connected,
  ).toBeNull();
});

it("isolates each throwing public accessor and preserves the other states", () => {
  const fail = (): never => {
    throw new Error("PRIVATE_ERROR");
  };
  expect(
    sampleSocketLifecycleState(
      { isClosed: fail, context: () => ({ isClosed: () => false }) },
      { isConnected: () => true },
    ),
  ).toEqual({ page_closed: null, context_closed: false, browser_connected: true });
  expect(
    sampleSocketLifecycleState(
      { isClosed: () => false, context: fail },
      { isConnected: () => true },
    ),
  ).toEqual({ page_closed: false, context_closed: null, browser_connected: true });
  expect(
    sampleSocketLifecycleState(
      { isClosed: () => false, context: () => ({ isClosed: fail }) },
      { isConnected: fail },
    ),
  ).toEqual({ page_closed: false, context_closed: null, browser_connected: null });
});

it("handles throwing method getters without inspecting error content", () => {
  const page = {
    get isClosed(): () => unknown {
      throw new Error("PRIVATE_GETTER");
    },
    context: () => ({ isClosed: () => false }),
  };
  expect(
    sampleSocketLifecycleState(page, {
      get isConnected(): () => unknown {
        throw new Error("PRIVATE_GETTER");
      },
    }),
  ).toEqual({ page_closed: null, context_closed: false, browser_connected: null });
});
