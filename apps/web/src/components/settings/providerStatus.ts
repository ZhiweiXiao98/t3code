import { translateWebMessage } from "../../i18n/messages";
import type { WebTranslate } from "../../i18n/WebI18nContext";
import type {
  ServerProvider,
  ServerProviderVersionAdvisory,
  ServerProviderCompatibilityAdvisory,
} from "@t3tools/contracts";

const translateProviderEnglish: WebTranslate = (key, values) =>
  translateWebMessage("en", key, values);

function translateProviderMessage(message: string, t: WebTranslate): string {
  const disabledMatch = /^(.+?) is disabled in T3 Code settings\.$/.exec(message);
  if (disabledMatch) {
    return t("providers.status.disabledMessage", { provider: disabledMatch[1]! });
  }

  const missingCliMatch = /^(.+?) CLI \((.+)\) is not installed or not on PATH\.$/.exec(message);
  if (missingCliMatch) {
    return t("providers.status.cliMissing", {
      provider: missingCliMatch[1]!,
      command: missingCliMatch[2]!,
    });
  }

  const oldVersionMatch =
    /^(.+?) (v?[\d.]+) is too old for (.+?)\. Upgrade to (v?[\d.]+) or newer to access it\.$/.exec(
      message,
    );
  if (oldVersionMatch) {
    return t("providers.status.versionTooOld", {
      provider: oldVersionMatch[1]!,
      current: oldVersionMatch[2]!,
      model: oldVersionMatch[3]!,
      required: oldVersionMatch[4]!,
    });
  }

  return message;
}

export const PROVIDER_STATUS_STYLES = {
  disabled: {
    dot: "bg-muted-foreground/50",
  },
  error: {
    dot: "bg-destructive",
  },
  neutral: {
    dot: "bg-muted-foreground",
  },
  ready: {
    dot: "bg-success",
  },
  warning: {
    dot: "bg-warning",
  },
} as const;

export type ProviderStatusKey = keyof typeof PROVIDER_STATUS_STYLES;

// Antigravity's local health check verifies installation, not Google sign-in.
// API-key and Agent Platform warnings still need attention.
function isAntigravitySignInUnchecked(provider: ServerProvider): boolean {
  return (
    provider.driver === "antigravity" &&
    provider.installed &&
    provider.status === "warning" &&
    provider.auth.status === "unknown" &&
    (provider.auth.type === undefined ||
      provider.auth.type === "oauth-personal" ||
      provider.auth.type === "oauth-business")
  );
}

export function getProviderStatusKey(provider: ServerProvider | undefined): ProviderStatusKey {
  if (provider && !provider.enabled) return "disabled";
  if (provider && isAntigravitySignInUnchecked(provider)) return "neutral";
  return provider?.status ?? "warning";
}

export function getProviderSummary(
  provider: ServerProvider | undefined,
  t: WebTranslate = translateProviderEnglish,
) {
  if (!provider) {
    return {
      headline: t("providers.status.checking"),
      detail: t("providers.status.waiting"),
    };
  }
  if (!provider.enabled || provider.status === "disabled") {
    return {
      headline: t("providers.status.disabled"),
      detail: provider.message
        ? translateProviderMessage(provider.message, t)
        : t("providers.status.disabledDetail"),
    };
  }
  if (!provider.installed) {
    return {
      headline: t("providers.status.notFound"),
      detail: provider.message
        ? translateProviderMessage(provider.message, t)
        : t("providers.status.cliNotDetected"),
    };
  }
  if (provider.auth.status === "unauthenticated") {
    const authLabel = provider.auth.label ?? provider.auth.type;
    return {
      headline: authLabel
        ? `${t("providers.status.notAuthenticated")} · ${authLabel}`
        : t("providers.status.notAuthenticated"),
      detail: provider.message ? translateProviderMessage(provider.message, t) : null,
    };
  }
  if (isAntigravitySignInUnchecked(provider)) {
    return {
      headline: t("providers.status.signInUnchecked"),
      detail: provider.message ?? null,
    };
  }
  if (provider.status === "warning") {
    return {
      headline: t("providers.status.needsAttention"),
      detail: provider.message
        ? translateProviderMessage(provider.message, t)
        : t("providers.status.needsAttentionDetail"),
    };
  }
  if (provider.status === "error") {
    return {
      headline: t("providers.status.unavailable"),
      detail: provider.message
        ? translateProviderMessage(provider.message, t)
        : t("providers.status.unavailableDetail"),
    };
  }
  if (provider.auth.status === "authenticated") {
    const authLabel = provider.auth.label ?? provider.auth.type;
    return {
      headline: authLabel
        ? t("providers.status.authenticatedWith", { method: authLabel })
        : t("providers.status.authenticated"),
      detail: provider.message ?? null,
    };
  }
  return {
    headline: t("providers.status.available"),
    detail: provider.message ?? null,
  };
}

export function getProviderVersionLabel(version: string | null | undefined) {
  if (!version) return null;
  const antigravity = /^agy_acp_server_(\d{4})(\d{2})(\d{2})_\d+(?:_(\w+))?$/.exec(version);
  if (antigravity) {
    const [, year, month, day, candidate] = antigravity;
    return `${year}-${month}-${day}${candidate ? ` ${candidate}` : ""}`;
  }
  return /^\d/.test(version) ? `v${version}` : version;
}

const COMPATIBILITY_TITLES = {
  graceful: "Limited support",
  unsupported: "Unsupported version",
  broken: "Known broken version",
} as const;

export function getProviderVersionAdvisoryPresentation(
  advisory: ServerProviderVersionAdvisory | undefined,
  compatibility?: ServerProviderCompatibilityAdvisory | undefined,
  showCompatibility = true,
  t: WebTranslate = translateProviderEnglish,
): {
  readonly title: string;
  readonly detail: string;
  readonly updateCommand: string | null;
  readonly emphasis: "normal" | "strong";
  readonly targetVersion: string | null;
} | null {
  const latestIsIncompatible =
    compatibility?.latestVersionStatus === "broken" ||
    compatibility?.latestVersionStatus === "unsupported";
  if (
    showCompatibility &&
    compatibility &&
    (compatibility.status === "graceful" ||
      compatibility.status === "unsupported" ||
      compatibility.status === "broken")
  ) {
    const targetVersion = compatibility.recommendedVersion;
    const recommendation = getProviderVersionLabel(targetVersion) ?? compatibility.recommendedRange;
    // Latest package versions cannot be updated into recommendations requiring another package.
    const isAlreadyLatest = advisory?.status === "current";
    return {
      title: COMPATIBILITY_TITLES[compatibility.status],
      detail:
        compatibility.message ??
        (recommendation ? `Use ${recommendation} for full support.` : "Update for full support."),
      updateCommand:
        targetVersion || latestIsIncompatible || isAlreadyLatest
          ? null
          : (advisory?.updateCommand ?? null),
      emphasis: compatibility.status === "graceful" ? "normal" : "strong",
      targetVersion,
    };
  }
  if (
    !advisory ||
    advisory.status === "current" ||
    advisory.status === "unknown" ||
    latestIsIncompatible
  ) {
    return null;
  }

  const label = t("providers.update.available");
  const version = advisory.latestVersion;
  const versionLabel = getProviderVersionLabel(version);

  return {
    title: label,
    detail:
      (advisory.message ? translateProviderMessage(advisory.message, t) : null) ??
      (versionLabel
        ? t("providers.update.installVersion", { version: versionLabel })
        : t("providers.update.installLatest")),
    updateCommand: advisory.updateCommand,
    emphasis: "normal" as const,
    targetVersion: null,
  };
}
