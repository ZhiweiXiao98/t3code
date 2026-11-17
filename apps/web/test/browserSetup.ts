import { beforeEach } from "vite-plus/test";
import { commands } from "vite-plus/test/browser";

import { observeMenuInteractions } from "./menuInteractionTrace";

import { initializeI18n } from "../src/i18n/initializeI18n";

declare module "vite-plus/test/browser" {
  interface BrowserCommands {
    /** Defined in vite.config.ts. Moves Playwright's mouse off the page. */
    resetPointer: () => Promise<void>;
  }
}

// Playwright's mouse outlives each test and each file, so whatever the next test mounts
// under its last position starts hovered. Registered here rather than in render() so tests
// that mount without it are covered too. Before each test, not after: a timed-out test keeps
// running and can move the mouse after its own afterEach.
beforeEach(async ({ task }) => {
  await commands.resetPointer();
  if (import.meta.env.VITE_T3_MENU_TRACE !== "1") return;
  // Returned teardown runs even for a timed-out test. Observe only; never alter focus.
  const menuObservation = observeMenuInteractions();
  return () => menuObservation.finish(task.result?.state, task.name);
});

// The app initializes GT at startup; components using its hooks need the same here.
initializeI18n(() => {});
