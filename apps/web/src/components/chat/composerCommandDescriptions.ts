import type { ServerProviderSkill, ServerProviderSlashCommand } from "@t3tools/contracts";
import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import { translateWebMessage, type WebMessageKey } from "~/i18n/messages";

const SKILL_SCOPE_MESSAGES: Readonly<Record<string, WebMessageKey>> = {
  app: "composer.skillSource.app",
  repo: "composer.skillSource.repo",
  repository: "composer.skillSource.repo",
  project: "composer.skillSource.project",
  workspace: "composer.skillSource.project",
  local: "composer.skillSource.project",
  user: "composer.skillSource.personal",
  personal: "composer.skillSource.personal",
  system: "composer.skillSource.system",
  provider: "composer.skillSource.provider",
};

export function providerSlashCommandDescription(
  command: Pick<ServerProviderSlashCommand, "description" | "input">,
  locale: ResolvedAppLocale,
): string {
  return (
    command.description ??
    command.input?.hint ??
    translateWebMessage(locale, "composer.command.runProviderCommand")
  );
}

export function providerSkillDescription(
  skill: Pick<ServerProviderSkill, "shortDescription" | "description" | "scope">,
  locale: ResolvedAppLocale,
  fallback: string,
): string {
  if (skill.shortDescription != null) return skill.shortDescription;
  if (skill.description != null) return skill.description;
  if (!skill.scope) return fallback;
  const scopeKey = Object.hasOwn(SKILL_SCOPE_MESSAGES, skill.scope)
    ? SKILL_SCOPE_MESSAGES[skill.scope]
    : undefined;
  const scope = locale !== "en" && scopeKey ? translateWebMessage(locale, scopeKey) : skill.scope;
  return translateWebMessage(locale, "composer.command.scopedSkill", { scope });
}
