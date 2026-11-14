import { translateWebMessage } from "~/i18n/messages";
import type { EnvironmentId, UsageLimitsReport } from "@t3tools/contracts";
import type { TimestampFormat } from "@t3tools/contracts/settings";
import { formatUsageUnavailableMessage, limitsNotice } from "@t3tools/shared/usageLimits";
import { GaugeIcon } from "lucide-react";

import { ensureLocalApi } from "../../localApi";
import { formatUpcomingTimestamp } from "../../timestampFormat";
import { Button } from "../ui/button";
import { providerClients } from "../settings/providerDriverMeta";
import { RedactedSensitiveText } from "../settings/RedactedSensitiveText";
import { LimitWindows, ResetCredits } from "../usage/UsageLimits";
import { ComposerBanner } from "./ComposerBanner";
import type { ComposerBannerStackItem } from "./ComposerBannerStack";
import { useI18n, type WebTranslate } from "../../i18n/WebI18nContext";
import { translateWebSource } from "../../i18n/messages";

function accountLabel(account: UsageLimitsReport["accounts"][number]): string {
  if (!account.instanceId) return account.label;
  const driver = providerClients.get(account.driver)?.label ?? String(account.driver);
  const instance =
    account.displayName?.trim() ||
    (String(account.instanceId) !== String(account.driver) ? account.instanceId : "");
  return instance && instance.toLowerCase() !== driver.toLowerCase()
    ? `${driver} · ${instance}`
    : driver;
}

function AccountSummary({ account }: { readonly account: UsageLimitsReport["accounts"][number] }) {
  const { t: controlsT } = useI18n();
  const label = accountLabel(account);
  return (
    <>
      {label.includes("@") ? (
        <RedactedSensitiveText
          key={label}
          value={label}
          ariaLabel={controlsT("chatControls.copy4")}
          revealTooltip={controlsT("chatControls.copy5")}
          hideTooltip={controlsT("chatControls.copy6")}
          className="max-w-full truncate align-bottom font-sans text-xs leading-normal"
        />
      ) : (
        label
      )}
      {account.plan ? ` · ${account.plan}` : null}
    </>
  );
}

export function usageLimitsBannerItem(
  id: string,
  report: UsageLimitsReport,
  environmentId: EnvironmentId,
  onDismiss: () => void,
  t: WebTranslate,
): ComposerBannerStackItem {
  const [first] = report.accounts;
  const single = report.accounts.length === 1 && first ? first : null;
  const summary = single ? (
    <AccountSummary account={single} />
  ) : (
    t("usage.limits.accounts", { count: report.accounts.length })
  );
  return {
    id,
    variant: "info",
    icon: <GaugeIcon />,
    title: t("usage.limits.title"),
    description: summary,
    dismissLabel: t("usage.limits.dismiss"),
    onDismiss,
    children: <UsageLimitsBannerBody report={report} environmentId={environmentId} />,
  };
}

export function modelFallbackBannerItem(
  {
    fallbackModelName,
    defaultProviderName,
    defaultModelName,
    locale,
    resetsAt,
    timestampFormat,
    onUseDefault,
    onDismiss,
  }: {
    readonly fallbackModelName: string;
    readonly defaultProviderName: string;
    readonly defaultModelName: string;
    readonly locale?: string;
    readonly resetsAt: string | null;
    readonly timestampFormat: TimestampFormat;
    readonly onUseDefault: () => void;
    readonly onDismiss: () => void;
  },
  controlsT: WebTranslate = (key, values) => translateWebMessage("en", key, values),
): ComposerBannerStackItem {
  return {
    id: "fallback-model",
    variant: "info",
    icon: <GaugeIcon />,
    title: controlsT("chatControls.usingModel", { model: fallbackModelName }),
    description: controlsT("chatControls.outOfUsage", {
      provider: defaultProviderName,
      reset: resetsAt
        ? controlsT("chatControls.resetAt", {
            time: formatUpcomingTimestamp(resetsAt, timestampFormat, undefined, undefined, locale),
          })
        : "",
    }),
    actions: (
      <Button size="xs" variant="ghost" onClick={onUseDefault}>
        {controlsT("chatControls.useModel", { model: defaultModelName })}
      </Button>
    ),
    dismissLabel: controlsT("chatControls.copy7"),
    onDismiss,
  };
}

function UsageLimitsBannerBody({
  report,
  environmentId,
}: {
  readonly report: UsageLimitsReport;
  readonly environmentId: EnvironmentId;
}) {
  const { locale: uiLocale } = useI18n();
  const { locale } = useI18n();
  const now = Date.parse(report.createdAt);
  return (
    <ComposerBanner.Scroll>
      <ComposerBanner.Body className="flex flex-col gap-2 pt-1 pb-1.5 pe-2">
        {report.accounts.map((account) => {
          const resetCreditInput =
            account.resetCreditInput ??
            (account.instanceId ? { instanceId: account.instanceId } : undefined);
          const notice = limitsNotice(
            account.limits,
            (message) => translateWebSource(locale, message),
            (unavailable) => formatUsageUnavailableMessage(unavailable, locale),
          );
          const externalUsage = account.limits.externalUsage;
          return (
            <div key={account.id} className="flex min-w-0 flex-col gap-1">
              {report.accounts.length > 1 ? (
                <span className="truncate text-xs text-muted-foreground">
                  <AccountSummary account={account} />
                </span>
              ) : null}
              {notice ? (
                <span className="text-xs text-muted-foreground">{notice}</span>
              ) : (
                <LimitWindows
                  compact
                  driver={account.driver}
                  accentColor={account.accentColor}
                  windows={account.limits.windows}
                  now={now}
                />
              )}
              {externalUsage ? (
                <Button
                  size="sm"
                  variant="link"
                  className="self-start"
                  onClick={() => void ensureLocalApi().shell.openExternal(externalUsage.url)}
                >
                  {translateWebSource(uiLocale, "Manage usage")}
                </Button>
              ) : null}
              {resetCreditInput && account.limits.resetCredits ? (
                <ResetCredits
                  environmentId={environmentId}
                  input={resetCreditInput}
                  credits={account.limits.resetCredits}
                  now={now}
                />
              ) : null}
            </div>
          );
        })}
        {report.notices.map((notice) => (
          <span key={notice} className="text-xs text-muted-foreground">
            {translateWebSource(locale, notice)}
          </span>
        ))}
      </ComposerBanner.Body>
    </ComposerBanner.Scroll>
  );
}
