import { useI18n } from "~/i18n/WebI18nContext";
import { translateWebSource } from "~/i18n/messages";
/** Bubble classes for a guest's message. A pending one has a dashed edge and no fill. */
export function guestBubbleClassName(pending: boolean): string {
  return pending ? "border border-dashed border-guest/50 bg-transparent" : "bg-guest-surface";
}

/** The guest's name above their message, where "Sent by T3 Code" sits for server messages. */
export function GuestMessageName({ name }: { readonly name: string }) {
  const { locale } = useI18n();
  return (
    <p className="me-1 text-2xs text-guest-foreground">
      {name}
      <span className="sr-only"> ({translateWebSource(locale, "Guest")})</span>
    </p>
  );
}
