import { translateWebSource } from "../i18n/messages";
import { formatOwnedSnapShotSetupMessage } from "../i18n/snapShotSetupMessages";
import type {
  DesktopBridge,
  DesktopSnapShotState,
  DesktopSnapShotSetupAction,
  DesktopSnapShotSetupMessageDescriptor,
} from "@t3tools/contracts";
import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import * as Option from "effect/Option";
import { Atom, type AtomRegistry } from "effect/reactivity";

import { getDesktopSnapShotBridge } from "../lib/desktopSnapShot";

export type SnapShotSetupErrorTitle =
  | "Couldn't check capture setup"
  | "Couldn't open shortcut permissions"
  | "Couldn't complete capture setup"
  | "Couldn't save capture settings"
  | "Couldn't allow app text capture"
  | "Couldn't verify capture access"
  | "Couldn't close capture setup";

interface SnapShotSetupFailure {
  readonly message: string | null;
  readonly messageDescriptor?: DesktopSnapShotSetupMessageDescriptor | undefined;
}
export interface SnapShotSetupError extends SnapShotSetupFailure {
  readonly title: SnapShotSetupErrorTitle;
}

export function snapShotSetupError(
  title: SnapShotSetupErrorTitle,
  error: unknown,
): SnapShotSetupError {
  return { title, message: error instanceof Error ? error.message : null };
}

export function formatSnapShotSetupError(
  locale: ResolvedAppLocale,
  error: SnapShotSetupError,
): { title: string; message: string } {
  return {
    title: translateWebSource(locale, error.title),
    message:
      error.message === null
        ? translateWebSource(locale, "Try again.")
        : formatOwnedSnapShotSetupMessage(locale, error.message, error.messageDescriptor),
  };
}

/** Capability absence alone selects legacy IPC; an attempted new call is never retried. */
export async function runSnapShotSetup(
  bridge: Pick<DesktopBridge, "setupSnapShot" | "setupSnapShotOutcome">,
  action: DesktopSnapShotSetupAction,
): Promise<SnapShotSetupFailure | null> {
  if (!bridge.setupSnapShotOutcome) {
    await bridge.setupSnapShot(action);
    return null;
  }
  const outcome = await bridge.setupSnapShotOutcome(action);
  if (outcome._tag === "Success") return null;
  return {
    message: outcome.message,
    ...(outcome.messageDescriptor?.action === action
      ? { messageDescriptor: outcome.messageDescriptor }
      : {}),
  };
}

export interface DesktopSnapShotLoad {
  readonly state: DesktopSnapShotState | null;
  /** Why the last background read (load, focus, shortcut change) failed; a later success clears it. */
  readonly refreshError: SnapShotSetupError | null;
}

const EMPTY_LOAD: DesktopSnapShotLoad = { state: null, refreshError: null };

// Only the newest read lands, so a slow answer cannot regress the state. Dropping the atom bumps
// it too, so a read that was in flight when the page closed does not seed the next visit.
let stateRequestId = 0;

/**
 * The desktop capture state. Reading it starts a load, then re-reads on window focus (the user
 * may have changed OS permissions) and when the desktop reports a shortcut change.
 */
export const desktopSnapShotAtom = Atom.writable(
  (get): DesktopSnapShotLoad => {
    get.addFinalizer(() => {
      stateRequestId++;
    });
    const bridge = getDesktopSnapShotBridge();
    if (!bridge) return EMPTY_LOAD;
    const refresh = () =>
      void refreshDesktopSnapShotState(get.registry, (error) => {
        get.setSelf({
          ...Option.getOrElse(get.self<DesktopSnapShotLoad>(), () => EMPTY_LOAD),
          refreshError: snapShotSetupError("Couldn't check capture setup", error),
        });
      });
    window.addEventListener("focus", refresh);
    get.addFinalizer(() => window.removeEventListener("focus", refresh));
    get.addFinalizer(
      bridge.onSnapShotEvent((event) => {
        if (event.type === "shortcut-changed") refresh();
      }),
    );
    refresh();
    return EMPTY_LOAD;
  },
  (ctx, value: DesktopSnapShotLoad) => ctx.setSelf(value),
).pipe(Atom.withLabel("desktop:snap-shot:state"));

/**
 * Reads the capture state now and stores it. `onError` hears only a failure of the newest read;
 * the result is `undefined` whenever this read did not produce the current state.
 */
export async function refreshDesktopSnapShotState(
  registry: AtomRegistry.AtomRegistry,
  onError: (error: unknown) => void,
): Promise<DesktopSnapShotState | undefined> {
  const bridge = getDesktopSnapShotBridge();
  if (!bridge) return undefined;
  const requestId = ++stateRequestId;
  try {
    const next = await bridge.getSnapShotState();
    if (requestId === stateRequestId) {
      registry.set(desktopSnapShotAtom, { state: next, refreshError: null });
    }
    return next;
  } catch (error) {
    if (requestId === stateRequestId) onError(error);
    return undefined;
  }
}
