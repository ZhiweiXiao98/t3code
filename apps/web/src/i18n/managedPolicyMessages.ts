import {
  managedCapabilityDenial as contractCapabilityDenial,
  managedRuntimeModeDenial as contractRuntimeModeDenial,
  managedUpdatesDenial as contractUpdatesDenial,
  type ManagedPolicySummary,
  type RuntimeMode,
} from "@t3tools/contracts";

import type { WebTranslate } from "./WebI18nContext";
import { translateWebMessage, type WebMessageKey } from "./messages";

const translateEnglish: WebTranslate = (key, values) => translateWebMessage("en", key, values);

const runtimeModeKeys = {
  "approval-required": "composer.mode.supervised",
  "auto-accept-edits": "composer.mode.autoAcceptEdits",
  auto: "composer.mode.auto",
  "full-access": "composer.mode.fullAccess",
} as const satisfies Record<RuntimeMode, WebMessageKey>;

const capabilityKeys = {
  remoteClients: "managedPolicy.denied.remoteClients",
  connect: "managedPolicy.denied.connect",
  webhookTasks: "managedPolicy.denied.webhookTasks",
  browserCookieImport: "managedPolicy.denied.browserCookieImport",
} as const satisfies Record<Parameters<typeof contractCapabilityDenial>[1], WebMessageKey>;

/** Localize only contract-generated UI reasons. Policy decisions stay in the contracts. */
export function managedCapabilityDenial(
  summary: ManagedPolicySummary | undefined,
  capability: Parameters<typeof contractCapabilityDenial>[1],
  t: WebTranslate = translateEnglish,
): string | undefined {
  const denial = contractCapabilityDenial(summary, capability);
  return denial === undefined || summary === undefined
    ? denial
    : t(capabilityKeys[capability], { organization: summary.organization });
}

export function managedRuntimeModeCeilingMessage(
  organization: string,
  ceiling: RuntimeMode,
  t: WebTranslate = translateEnglish,
): string {
  return t("managedPolicy.runtimeModeCeiling", {
    organization,
    mode: t(runtimeModeKeys[ceiling]),
  });
}

export function managedRuntimeModeDenial(
  summary: ManagedPolicySummary | undefined,
  mode: RuntimeMode,
  t: WebTranslate = translateEnglish,
): string | undefined {
  const denial = contractRuntimeModeDenial(summary, mode);
  const ceiling = summary?.limits?.maxRuntimeMode;
  return denial === undefined || summary === undefined || ceiling === undefined
    ? denial
    : managedRuntimeModeCeilingMessage(summary.organization, ceiling, t);
}

export function managedUpdatesMessage(
  organization: string,
  t: WebTranslate = translateEnglish,
): string {
  return t("managedPolicy.updates", { organization });
}

export function managedNightlyDeniedMessage(
  organization: string,
  t: WebTranslate = translateEnglish,
): string {
  return t("managedPolicy.nightlyDenied", { organization });
}

export function managedUpdatesDenial(
  summary: ManagedPolicySummary | undefined,
  t: WebTranslate = translateEnglish,
): string | undefined {
  const denial = contractUpdatesDenial(summary);
  return denial === undefined || summary === undefined
    ? denial
    : managedUpdatesMessage(summary.organization, t);
}
