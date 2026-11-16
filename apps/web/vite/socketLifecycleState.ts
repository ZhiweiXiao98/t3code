// Public client-side state at observation time, not proof of remote process health.
function booleanOrNull(read: () => unknown): boolean | null {
  try {
    const value = read();
    return typeof value === "boolean" ? value : null;
  } catch {
    return null;
  }
}

export function sampleSocketLifecycleState(
  page: { isClosed: () => unknown; context: () => { isClosed: () => unknown } },
  browser: { isConnected: () => unknown } | null,
) {
  return {
    page_closed: booleanOrNull(() => page.isClosed()),
    // Playwright includes context closing, before its close event is delivered.
    context_closed: booleanOrNull(() => page.context().isClosed()),
    browser_connected: booleanOrNull(() => browser?.isConnected()),
  };
}
