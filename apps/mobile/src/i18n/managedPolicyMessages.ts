import {
  disallowedProviderMessage as contractDisallowedProviderMessage,
  managedCapabilityDenial as contractCapabilityDenial,
  managedRuntimeModeDenial as contractRuntimeModeDenial,
  managedUpdatesDenial as contractUpdatesDenial,
  type ManagedPolicySummary,
  type RuntimeMode,
} from "@t3tools/contracts";

import { localizeMobileString, MOBILE_LOCALE, type MobileLocale } from "./mobileStrings";

const RUNTIME_MODE_LABELS: Record<RuntimeMode, string> = {
  "approval-required": "Supervised",
  "auto-accept-edits": "Auto-accept edits",
  auto: "Auto",
  "full-access": "Full access",
};

const CAPABILITY_LABELS = {
  remoteClients: "从其他设备连接",
  connect: "T3 Connect",
  webhookTasks: "Webhook 任务",
  browserCookieImport: "导入浏览器 Cookie",
} as const;

function formatMessage(
  template: string,
  values: Readonly<Record<string, string>>,
  locale: MobileLocale,
): string {
  return localizeMobileString(template, locale).replace(
    /\{(\w+)\}/g,
    (placeholder, key: string) => values[key] ?? placeholder,
  );
}

/** Only contract-generated UI reasons are translated; contract decisions stay authoritative. */
export function managedRuntimeModeDenial(
  summary: ManagedPolicySummary | undefined,
  mode: RuntimeMode,
  locale: MobileLocale = MOBILE_LOCALE,
): string | undefined {
  const denial = contractRuntimeModeDenial(summary, mode);
  const ceiling = summary?.limits?.maxRuntimeMode;
  return denial === undefined || summary === undefined || ceiling === undefined || locale === "en"
    ? denial
    : formatMessage(
        "{organization} limits threads to {mode}.",
        {
          organization: summary.organization,
          mode: localizeMobileString(RUNTIME_MODE_LABELS[ceiling], locale),
        },
        locale,
      );
}

export function managedCapabilityDenial(
  summary: ManagedPolicySummary | undefined,
  capability: Parameters<typeof contractCapabilityDenial>[1],
  locale: MobileLocale = MOBILE_LOCALE,
): string | undefined {
  const denial = contractCapabilityDenial(summary, capability);
  return denial === undefined || summary === undefined || locale === "en"
    ? denial
    : formatMessage(
        "{organization}'s policy does not allow {capability}.",
        {
          organization: summary.organization,
          capability: CAPABILITY_LABELS[capability],
        },
        locale,
      );
}

export function managedUpdatesDenial(
  summary: ManagedPolicySummary | undefined,
  locale: MobileLocale = MOBILE_LOCALE,
): string | undefined {
  const denial = contractUpdatesDenial(summary);
  return denial === undefined || summary === undefined || locale === "en"
    ? denial
    : formatMessage(
        "{organization} manages T3 Code updates.",
        {
          organization: summary.organization,
        },
        locale,
      );
}

export function disallowedProviderMessage(
  organization: string | undefined,
  provider: string,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  if (locale === "en") return contractDisallowedProviderMessage(organization, provider);
  return formatMessage(
    organization === undefined
      ? "Your organization policy does not allow the {provider} provider."
      : "{organization}'s policy does not allow the {provider} provider.",
    { organization: organization ?? "", provider },
    locale,
  );
}

export function managedByMessage(
  organization: string | undefined,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  return formatMessage(
    "Managed by {organization}.",
    { organization: String(organization) },
    locale,
  );
}

export function managedHelpMessage(
  organization: string,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  return formatMessage("Get help from {organization}", { organization }, locale);
}

export function managedSettingsMessage(
  organizations: readonly string[],
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  return formatMessage(
    "Some settings are managed by {organizations} and cannot be changed here.",
    {
      organizations: organizations.join(", "),
    },
    locale,
  );
}

export function switchRuntimeModeMessage(
  label: string,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  return formatMessage("Switch to {mode}", { mode: localizeMobileString(label, locale) }, locale);
}

/** The reason may contain an organization name; localize only the application explanation. */
export function managedSettingDescription(
  description: string,
  reason: string | undefined,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  const translated = localizeMobileString(description, locale);
  return reason === undefined ? translated : `${translated} ${reason}`;
}
