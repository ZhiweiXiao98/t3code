import { isElectron } from "~/env";
import { EN_MESSAGES, type WebMessageKey } from "../../i18n/messages";

export type SettingsPath =
  | "/settings/general"
  | "/settings/appearance"
  | "/settings/keybindings"
  | "/settings/providers"
  | "/settings/integrations"
  | "/settings/source-control"
  | "/settings/connections"
  | "/settings/archived";

export interface SettingsSearchDefinition {
  readonly id: string;
  readonly titleKey: WebMessageKey;
  readonly to: SettingsPath;
  readonly targetId?: string;
  // Its row only renders in the desktop app, so a browser result would land on
  // an anchor that isn't there.
  readonly desktopOnly?: boolean;
}

export interface SettingsSearchItem {
  readonly id: string;
  readonly title: string;
  readonly to: SettingsPath;
  readonly targetId?: string;
  readonly desktopOnly?: boolean;
}

/**
 * Section labels in sidebar order. The sidebar nav and the search-result
 * subtitles both render from this record, so each label exists once.
 */
export const SETTINGS_SECTION_MESSAGE_KEYS: Readonly<Record<SettingsPath, WebMessageKey>> = {
  "/settings/general": "settings.section.general",
  "/settings/appearance": "settings.section.appearance",
  "/settings/keybindings": "settings.section.keybindings",
  "/settings/providers": "settings.section.providers",
  "/settings/integrations": "settings.section.integrations",
  "/settings/source-control": "settings.section.sourceControl",
  "/settings/connections": "settings.section.connections",
  "/settings/archived": "settings.section.archive",
};

/**
 * Every searchable setting, in result order. This catalog is the single
 * source of truth for anchor ids and title message keys. Panels own their
 * rendered title, while settings search resolves the same catalog key for
 * the active locale.
 */
export const SETTINGS_SEARCH_ITEMS = [
  {
    id: "language",
    titleKey: "settings.language.title",
    to: "/settings/general",
  },
  {
    id: "color-scheme",
    titleKey: "settings.item.colorScheme",
    to: "/settings/appearance",
    // The scheme tiles sit at the top of the Appearance section.
    targetId: "appearance",
  },
  {
    id: "theme",
    titleKey: "settings.item.themes",
    to: "/settings/appearance",
    // Theme cards live directly under the scheme tiles; the section is the
    // stable scroll destination for both.
    targetId: "appearance",
  },
  {
    // Prefixed because the slider control already owns the `appearance-contrast` id.
    id: "setting-appearance-contrast",
    titleKey: "settings.item.appearanceContrast",
    to: "/settings/appearance",
  },
  {
    // Prefixed because the slider control already owns the `glass-opacity` id.
    id: "setting-glass-opacity",
    titleKey: "settings.item.glassOpacity",
    to: "/settings/appearance",
  },
  {
    id: "environment-identification",
    titleKey: "settings.item.environmentIdentification",
    to: "/settings/appearance",
    // The setting is stage-dependent, so its parent section is the stable destination.
    targetId: "appearance",
  },
  {
    id: "interface-font",
    titleKey: "settings.item.interfaceFont",
    to: "/settings/appearance",
  },
  {
    id: "prompt-font",
    titleKey: "settings.item.promptFont",
    to: "/settings/appearance",
  },
  {
    id: "code-font",
    titleKey: "settings.item.codeFont",
    to: "/settings/appearance",
  },
  {
    id: "terminal-font",
    titleKey: "settings.item.terminalFont",
    to: "/settings/appearance",
  },
  {
    id: "font-smoothing",
    titleKey: "settings.item.fontSmoothing",
    to: "/settings/appearance",
  },
  {
    id: "word-wrap",
    titleKey: "settings.item.wordWrap",
    to: "/settings/appearance",
  },
  {
    id: "project-grouping",
    titleKey: "settings.item.projectGrouping",
    to: "/settings/general",
  },
  {
    id: "auto-settle-inactive-threads",
    titleKey: "settings.item.autoSettleInactiveThreads",
    to: "/settings/general",
  },
  {
    id: "auto-settle-merged-threads",
    titleKey: "settings.item.autoSettleMergedThreads",
    to: "/settings/general",
  },
  {
    id: "time-format",
    titleKey: "settings.item.timeFormat",
    to: "/settings/general",
  },
  {
    id: "hide-whitespace-changes",
    titleKey: "settings.item.hideWhitespaceChanges",
    to: "/settings/general",
  },
  {
    id: "skills-in-slash-menu",
    titleKey: "settings.item.skillsInSlashMenu",
    to: "/settings/general",
  },
  {
    id: "provider-update-checks",
    titleKey: "settings.item.providerUpdateChecks",
    to: "/settings/general",
  },
  {
    id: "new-threads",
    titleKey: "settings.item.newThreads",
    to: "/settings/general",
  },
  {
    id: "start-from-origin",
    titleKey: "settings.item.startFromOrigin",
    to: "/settings/general",
    targetId: "new-threads",
  },
  {
    id: "add-project-starts-in",
    titleKey: "settings.item.addProjectStartsIn",
    to: "/settings/general",
  },
  {
    id: "unpin-confirmation",
    title: "Unpin confirmation",
    to: "/settings/general",
  },
  {
    id: "archive-confirmation",
    titleKey: "settings.item.archiveConfirmation",
    to: "/settings/general",
  },
  {
    id: "delete-confirmation",
    titleKey: "settings.item.deleteConfirmation",
    to: "/settings/general",
  },
  {
    id: "quit-confirmation",
    titleKey: "settings.item.quitConfirmation",
    to: "/settings/general",
    desktopOnly: true,
  },
  {
    id: "text-generation-model",
    titleKey: "settings.item.textGenerationModel",
    to: "/settings/general",
  },
  {
    id: "diagnostics",
    titleKey: "settings.item.diagnostics",
    to: "/settings/general",
  },
  {
    id: "legacy-plan-mode",
    titleKey: "settings.item.legacyPlanMode",
    to: "/settings/general",
  },
  {
    id: "legacy-token-streaming",
    titleKey: "settings.item.legacyTokenStreaming",
    to: "/settings/general",
  },
  {
    id: "legacy-sidebar",
    titleKey: "settings.item.legacySidebar",
    to: "/settings/general",
  },
  {
    id: "keybindings",
    titleKey: "settings.item.keybindings",
    to: "/settings/keybindings",
  },
  {
    id: "providers",
    titleKey: "settings.item.providers",
    to: "/settings/providers",
  },
  {
    id: "agent-browser-access",
    titleKey: "settings.item.agentBrowserAccess",
    to: "/settings/integrations",
    targetId: "browser",
  },
  {
    id: "browser-default-viewport",
    titleKey: "settings.item.browserDefaultViewport",
    to: "/settings/integrations",
    targetId: "browser",
  },
  {
    id: "browser-default-zoom",
    titleKey: "settings.item.browserDefaultZoom",
    to: "/settings/integrations",
    targetId: "browser",
  },
  {
    id: "browser-default-appearance",
    titleKey: "settings.item.browserDefaultAppearance",
    to: "/settings/integrations",
    targetId: "browser",
  },
  {
    id: "browser-auto-show-floating-preview",
    titleKey: "settings.item.browserAutoShowFloatingPreview",
    to: "/settings/integrations",
    targetId: "browser",
  },
  {
    id: "source-control",
    titleKey: "settings.item.sourceControl",
    to: "/settings/source-control",
  },
  {
    id: "remote-environments",
    titleKey: "settings.item.remoteEnvironments",
    to: "/settings/connections",
  },
  {
    id: "archive",
    titleKey: "settings.item.archivedThreads",
    to: "/settings/archived",
  },
] as const satisfies ReadonlyArray<SettingsSearchDefinition>;

export type SettingsSearchItemId = (typeof SETTINGS_SEARCH_ITEMS)[number]["id"];

const SEARCH_ITEMS_BY_ID = Object.fromEntries(
  SETTINGS_SEARCH_ITEMS.map((item) => [item.id, item]),
) as Readonly<Record<SettingsSearchItemId, SettingsSearchDefinition>>;

export function localizeSettingsSearchItems(
  translate: (key: WebMessageKey) => string,
): ReadonlyArray<SettingsSearchItem> {
  return SETTINGS_SEARCH_ITEMS.map(({ titleKey, ...item }) => ({
    ...item,
    title: translate(titleKey),
  }));
}

const ENGLISH_SETTINGS_SEARCH_ITEMS = localizeSettingsSearchItems((key) => EN_MESSAGES[key]);

/**
 * Stable anchor props for the element a search item targets. Visible titles
 * come from the shared message key stored in the search catalog.
 */
export function searchableSetting(id: SettingsSearchItemId): {
  readonly id: string;
} {
  return { id: SEARCH_ITEMS_BY_ID[id].id };
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function searchSettings(
  query: string,
  items: ReadonlyArray<SettingsSearchItem> = ENGLISH_SETTINGS_SEARCH_ITEMS,
): ReadonlyArray<SettingsSearchItem> {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length === 0) return [];

  return items.filter(
    (item) =>
      (isElectron || item.desktopOnly !== true) &&
      normalizeSearchText(item.title).includes(normalizedQuery),
  );
}
