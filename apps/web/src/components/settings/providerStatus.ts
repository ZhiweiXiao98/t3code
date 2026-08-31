import type { ServerProvider, ServerProviderVersionAdvisory } from "@t3tools/contracts";
import type { WebTranslate } from "../../i18n/WebI18nProvider";
import { translateWebMessage } from "../../i18n/messages";

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

/**
 * Visual treatment for each server-reported provider status. Centralized so
 * the default-driver card and per-instance cards share the same language.
 */
export const PROVIDER_STATUS_STYLES = {
  disabled: {
    dot: "bg-muted-foreground/50",
  },
  error: {
    dot: "bg-destructive",
  },
  ready: {
    dot: "bg-success",
  },
  warning: {
    dot: "bg-warning",
  },
} as const;

export type ProviderStatusKey = keyof typeof PROVIDER_STATUS_STYLES;

/**
 * Derive the headline + detail copy shown under a provider's name in the
 * settings page. Prefers `provider.message` for server-supplied detail and
 * falls back to generic phrasing when the server has not yet reported any
 * state — which happens before the first probe or when an instance names a
 * driver this build does not ship.
 */
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
  if (!provider.enabled) {
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
  if (provider.auth.status === "authenticated") {
    const authLabel = provider.auth.label ?? provider.auth.type;
    return {
      headline: authLabel
        ? t("providers.status.authenticatedWith", { method: authLabel })
        : t("providers.status.authenticated"),
      detail: provider.message ? translateProviderMessage(provider.message, t) : null,
    };
  }
  if (provider.auth.status === "unauthenticated") {
    return {
      headline: t("providers.status.notAuthenticated"),
      detail: provider.message ? translateProviderMessage(provider.message, t) : null,
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
  return {
    headline: t("providers.status.available"),
    detail: provider.message
      ? translateProviderMessage(provider.message, t)
      : t("providers.status.availableDetail"),
  };
}

/**
 * Normalize a version string for display. Adds the `v` prefix when the
 * driver reported a bare version (e.g. `1.2.3`) so cards render
 * consistently regardless of driver.
 */
export function getProviderVersionLabel(version: string | null | undefined) {
  if (!version) return null;
  return version.startsWith("v") ? version : `v${version}`;
}

export function getProviderVersionAdvisoryPresentation(
  advisory: ServerProviderVersionAdvisory | undefined,
  t: WebTranslate = translateProviderEnglish,
): {
  readonly detail: string;
  readonly updateCommand: string | null;
  readonly emphasis: "normal" | "strong";
} | null {
  if (!advisory || advisory.status === "current" || advisory.status === "unknown") {
    return null;
  }

  const version = advisory.latestVersion;
  const versionLabel = getProviderVersionLabel(version);

  return {
    detail:
      (advisory.message ? translateProviderMessage(advisory.message, t) : null) ??
      (versionLabel
        ? t("providers.update.installVersion", { version: versionLabel })
        : t("providers.update.installLatest")),
    updateCommand: advisory.updateCommand,
    emphasis: "normal" as const,
  };
}
