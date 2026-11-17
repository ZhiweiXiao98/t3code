/** Read-only, bounded evidence for real pointer/menu failures across browser tests. */
export function observeMenuInteractions() {
  const entries: object[] = [];
  let active = true;
  let dropped = 0;
  const menuSelector = '[role="menu"]';
  let lastMenuCount = document.querySelectorAll(menuSelector).length;
  const describe = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return { window: target === window };
    return {
      tag: target.tagName,
      role: target.getAttribute("role")?.slice(0, 24),
      row: Boolean(target.closest("[data-sidebar-row]")),
      menu: Boolean(target.closest(menuSelector)),
      popup: Boolean(target.closest('[data-slot="combobox-popup"]')),
    };
  };
  const record = (phase: string, event?: Event) => {
    if (!active) return;
    if (entries.length === 96) {
      entries.shift();
      dropped++;
    }
    entries.push({
      at: performance.now(),
      phase,
      type: event?.type,
      target: describe(event?.target ?? null),
      active: describe(document.activeElement),
      focused: document.hasFocus(),
      visibility: document.visibilityState,
      prevented: event?.defaultPrevented,
      button: event instanceof MouseEvent ? event.button : undefined,
      ctrl: event instanceof MouseEvent ? event.ctrlKey : undefined,
      meta: event instanceof MouseEvent ? event.metaKey : undefined,
      listboxes: document.querySelectorAll('[role="listbox"]').length,
      menus: document.querySelectorAll(menuSelector).length,
      menuItems: document.querySelectorAll('[role="menuitem"]').length,
      disabledItems: document.querySelectorAll(
        '[role="menuitem"]:is(:disabled, [aria-disabled="true"])',
      ).length,
    });
  };
  const capture = (event: Event) => {
    record("capture", event);
    if (["contextmenu", "focusin", "blur"].includes(event.type)) {
      queueMicrotask(() => record("microtask-after-event", event));
    }
  };
  const bubble = (event: Event) => record("bubble", event);
  const types = [
    "pointerdown",
    "pointerup",
    "pointercancel",
    "contextmenu",
    "click",
    "focusin",
    "focus",
    "blur",
  ];
  for (const type of types) {
    window.addEventListener(type, capture, true);
    window.addEventListener(type, bubble);
  }
  const recordMutations = (mutations: MutationRecord[]) => {
    // Inspect removed nodes too: a menu can be added and dismissed in one task.
    const menuNodes = (nodes: NodeList) =>
      [...nodes].filter(
        (node) =>
          node instanceof Element &&
          (node.matches(menuSelector) || node.querySelector(menuSelector)),
      ).length;
    const added = mutations.reduce((count, mutation) => count + menuNodes(mutation.addedNodes), 0);
    const removed = mutations.reduce(
      (count, mutation) => count + menuNodes(mutation.removedNodes),
      0,
    );
    const count = document.querySelectorAll(menuSelector).length;
    if (added || removed || count !== lastMenuCount) {
      record(`mutation:add=${added},remove=${removed}`);
    }
    lastMenuCount = count;
  };
  const observer = new MutationObserver(recordMutations);
  observer.observe(document.body, { subtree: true, childList: true });
  record("coverage-start");
  return {
    finish(taskState: string | undefined, testName: string) {
      if (!active) return;
      recordMutations(observer.takeRecords());
      observer.disconnect();
      for (const type of types) {
        window.removeEventListener(type, capture, true);
        window.removeEventListener(type, bubble);
      }
      record("coverage-stop");
      // Teardown may precede final result assignment. Never gate evidence on it.
      console.info("[browser-menu-interaction-trace]", {
        utc: Date.now(),
        testName,
        taskState,
        dropped,
        entries,
      });
      active = false;
    },
  };
}
