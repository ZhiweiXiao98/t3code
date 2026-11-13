// Separate keys survive state/shortcut object spreads without replacing one another's provenance.
const messageOwned = Symbol("snapShot.messageOwned");
const shortcutMessageOwned = Symbol("snapShot.shortcutMessageOwned");
const ownedErrors = new WeakSet<Error>();

type MessageProvenance = {
  readonly [messageOwned]?: boolean;
  readonly [shortcutMessageOwned]?: boolean;
};

export function snapShotMessage<T extends string | null>(message: T, owned = true) {
  return { message, [messageOwned]: message !== null && owned };
}

export function snapShotShortcutMessage<T extends string | null>(shortcutMessage: T, owned = true) {
  return { shortcutMessage, [shortcutMessageOwned]: shortcutMessage !== null && owned };
}

export function snapShotOwnedError(message: string): Error {
  const error = new Error(message);
  ownedErrors.add(error);
  return error;
}

export function snapShotMessageFromError(error: unknown, fallback: string) {
  return error instanceof Error
    ? snapShotMessage(error.message, ownedErrors.has(error))
    : snapShotMessage(fallback);
}

export function snapShotShortcutMessageFromError(error: unknown, fallback: string) {
  return error instanceof Error
    ? snapShotShortcutMessage(error.message, ownedErrors.has(error))
    : snapShotShortcutMessage(fallback);
}

export function isSnapShotMessageOwned(
  state: object,
  field: "message" | "shortcutMessage",
): boolean {
  const provenance = state as MessageProvenance;
  return (
    (field === "message" ? provenance[messageOwned] : provenance[shortcutMessageOwned]) === true
  );
}

/** Metadata is internal: explicitly remove it before the service returns either locale over IPC. */
export function stripSnapShotMessageProvenance<T extends object>(state: T): T {
  if (!(messageOwned in state) && !(shortcutMessageOwned in state)) return state;
  const clean = { ...state };
  Reflect.deleteProperty(clean, messageOwned);
  Reflect.deleteProperty(clean, shortcutMessageOwned);
  return clean;
}
