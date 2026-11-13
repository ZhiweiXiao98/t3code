import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import { translateWebMessage } from "~/i18n/messages";

/** Called only with the stash restore operation's own partitioned result, never external errors. */
export function composerRestorationMessages(
  locale: ResolvedAppLocale,
  input: {
    readonly dropped: readonly string[];
    readonly unreadable: readonly string[];
    readonly unrestoredImages: readonly string[];
    readonly unrestoredFiles: readonly string[];
    readonly expired: readonly string[];
    readonly limit: number;
  },
): string[] {
  const messages: string[] = [];
  if (input.dropped.length)
    messages.push(
      translateWebMessage(locale, "audit15.stashSize", { names: input.dropped.join(", ") }),
    );
  if (input.unreadable.length)
    messages.push(
      translateWebMessage(locale, "audit15.stashUnreadable", {
        names: input.unreadable.join(", "),
      }),
    );
  for (const names of [input.unrestoredImages, input.unrestoredFiles]) {
    if (names.length)
      messages.push(
        translateWebMessage(locale, "audit15.stashLimit", {
          names: names.join(", "),
          count: input.limit,
        }),
      );
  }
  if (input.expired.length)
    messages.push(
      translateWebMessage(locale, "audit15.stashExpired", { names: input.expired.join(", ") }),
    );
  return messages;
}
