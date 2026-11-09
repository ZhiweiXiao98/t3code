import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import { splitWebTranslation, useI18n, type WebTranslate } from "~/i18n/WebI18nContext";
import { translateWebSource } from "~/i18n/messages";
import { T3CHAT_PLAN_TUNNEL_LIMITS, type RelayT3ChatLink } from "@t3tools/contracts/relay";
import { MessageSquareIcon } from "lucide-react";
import type { ReactNode } from "react";

import { useManagedTunnelUsage } from "../../cloud/managedRelayState";
import { T3CHAT_SUBSCRIPTION_URL, TunnelUsageMeter } from "../cloud/TunnelUsage";
import { Button } from "../ui/button";
import {
  ClerkUserProfilePage,
  ClerkUserProfileRefreshButton,
  ClerkUserProfileRow,
} from "./ClerkUserProfilePage";
import { useT3ChatLink } from "./useT3ChatLink";

function upgradeLink(locale: ResolvedAppLocale) {
  return (
    <a
      className="underline"
      href={T3CHAT_SUBSCRIPTION_URL}
      target="_blank"
      rel="noopener noreferrer"
    >
      {translateWebSource(locale, "Upgrade on T3 Chat")}
    </a>
  );
}

function planLabel(link: RelayT3ChatLink, locale: ResolvedAppLocale, t: WebTranslate): ReactNode {
  switch (link.plan) {
    case "premier":
      return t("t3Chat.plan.premier", { count: T3CHAT_PLAN_TUNNEL_LIMITS.premier });
    case "pro": {
      const [before, after] = splitWebTranslation(t, "t3Chat.plan.pro", "upgrade", {
        pro: T3CHAT_PLAN_TUNNEL_LIMITS.pro,
        premier: T3CHAT_PLAN_TUNNEL_LIMITS.premier,
      });
      return (
        <>
          {before}
          {upgradeLink(locale)}
          {after}
        </>
      );
    }
    case "free": {
      const [before, after] = splitWebTranslation(t, "t3Chat.plan.free", "upgrade");
      return (
        <>
          {before}
          {upgradeLink(locale)}
          {after}
        </>
      );
    }
  }
}

/** Links a T3 Chat account so paid subscribers get more tunnels. */
export function T3ChatUserProfilePage() {
  const { locale: copyLocale, t } = useI18n();
  const [beforeConfirmation, afterConfirmation] = splitWebTranslation(
    t,
    "t3Chat.confirmLink",
    "site",
  );
  const { linkState, pending, linkUrl, link: handleLink, unlink: handleUnlink } = useT3ChatLink();
  const usage = useManagedTunnelUsage();

  const data = linkState.data;
  const link = data?.link ?? null;

  return (
    <ClerkUserProfilePage
      title="T3 Chat"
      description={t("t3Chat.linkDescription", {
        pro: T3CHAT_PLAN_TUNNEL_LIMITS.pro,
        premier: T3CHAT_PLAN_TUNNEL_LIMITS.premier,
      })}
      action={
        <ClerkUserProfileRefreshButton
          disabled={pending !== null}
          isPending={linkState.isPending}
          onClick={usage.refresh}
        />
      }
    >
      {linkState.error ? (
        <div className="border-t py-3 text-xs" role="alert">
          <p className="font-medium text-destructive-foreground">
            {translateWebSource(copyLocale, "Could not load T3 Chat link")}
          </p>
          <p className="mt-0.5 text-muted-foreground">{linkState.error}</p>
        </div>
      ) : data === null ? null : !data.available ? (
        <p className="border-t py-4 text-xs text-muted-foreground">
          {translateWebSource(
            copyLocale,
            "This T3 Connect server does not support T3 Chat linking.",
          )}
        </p>
      ) : (
        <ul className="border-t">
          <ClerkUserProfileRow icon={<MessageSquareIcon className="size-4" />}>
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm leading-4.5 font-medium text-foreground">
                  {link ? link.email : translateWebSource(copyLocale, "Not linked")}
                </h3>
                <p className="mt-1 text-xs leading-4.5 text-muted-foreground">
                  {link ? (
                    planLabel(link, copyLocale, t)
                  ) : linkUrl ? (
                    <>
                      {beforeConfirmation}
                      <a
                        className="underline"
                        href={linkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        t3.chat
                      </a>
                      {afterConfirmation}
                    </>
                  ) : (
                    translateWebSource(copyLocale, "You confirm the link on t3.chat.")
                  )}
                </p>
              </div>
              {link ? (
                <Button
                  size="sm"
                  variant="destructive-outline"
                  disabled={pending !== null}
                  onClick={() => void handleUnlink()}
                >
                  {pending === "unlink"
                    ? translateWebSource(copyLocale, "Unlinking…")
                    : translateWebSource(copyLocale, "Unlink")}
                </Button>
              ) : (
                <Button size="sm" disabled={pending !== null} onClick={() => void handleLink()}>
                  {pending === "link"
                    ? translateWebSource(copyLocale, "Opening…")
                    : translateWebSource(copyLocale, "Link T3 Chat")}
                </Button>
              )}
            </div>
          </ClerkUserProfileRow>
          {usage.used !== null && usage.limit !== null ? (
            <li className="border-t py-4">
              <TunnelUsageMeter used={usage.used} limit={usage.limit} />
            </li>
          ) : null}
        </ul>
      )}
    </ClerkUserProfilePage>
  );
}
