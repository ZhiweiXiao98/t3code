import { PROVIDER_DISPLAY_NAMES, type ServerProvider } from "@t3tools/contracts";
import { compareSemverVersions } from "@t3tools/shared/semver";

const RUNTIME_NAMES: Partial<Record<string, string>> = {
  claudeAgent: "Claude Code",
  codex: "the Codex CLI",
};

type FormatDisplayMessage = (template: string, values: ReadonlyArray<string>) => string;

const formatEnglishMessage: FormatDisplayMessage = (template, values) =>
  template.replace(
    /\{(\d+)\}/g,
    (placeholder, index: string) => values[Number(index)] ?? placeholder,
  );

function formatModelList(names: ReadonlyArray<string>, format: FormatDisplayMessage): string {
  if (names.length < 2) return names[0] ?? "";
  if (names.length === 2) return format("{0} and {1}", names);
  const prefix = names.slice(0, -1).reduce((list, name) => format("{0}, {1}", [list, name]));
  return format("{0}, and {1}", [prefix, names[names.length - 1]!]);
}

export function formatProviderUpdateRequiredNotice(
  provider: Pick<ServerProvider, "driver" | "updateRequiredModels">,
  searchQuery = "",
  format: FormatDisplayMessage = formatEnglishMessage,
): string | null {
  const query = searchQuery.trim().toLocaleLowerCase();
  const models = (provider.updateRequiredModels ?? []).filter(
    (model) =>
      query.length === 0 ||
      model.name.toLocaleLowerCase().includes(query) ||
      model.slug.toLocaleLowerCase().includes(query),
  );
  if (models.length === 0) return null;
  const minVersion = models
    .map((model) => model.minVersion)
    .reduce((highest, version) =>
      compareSemverVersions(version, highest) > 0 ? version : highest,
    );
  const providerName =
    provider.driver === "codex"
      ? format(RUNTIME_NAMES.codex!, [])
      : (RUNTIME_NAMES[provider.driver] ??
        PROVIDER_DISPLAY_NAMES[provider.driver] ??
        provider.driver);
  const version = minVersion.startsWith("v") ? minVersion : `v${minVersion}`;
  const names = formatModelList(
    models.map((model) => model.name),
    format,
  );
  return format("Update {0} to {1} or newer to use {2}.", [providerName, version, names]);
}
