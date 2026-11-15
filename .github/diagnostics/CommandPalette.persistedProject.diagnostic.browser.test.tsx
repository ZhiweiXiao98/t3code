import { RegistryContext } from "@effect/atom-react";
import { scopedProjectKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentCatalogState } from "@t3tools/client-runtime/state/connections";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import { AtomRegistry } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { render } from "../../test/render";
import { openCommandPalette } from "../commandPaletteBus";
import { useCommandPaletteStore } from "../commandPaletteStore";
import { environmentCatalog } from "../connection/catalog";
import {
  LAST_USED_PROJECT_STORAGE_KEY,
  lastUsedProjectKeySchema,
  readLastUsedProjectKey,
} from "../hooks/useHandleNewThread";
import { setLocalStorageItem } from "../hooks/useLocalStorage";
import { __setClientSettingsForTests, getClientSettings } from "../hooks/useSettings";
import { WebI18nContext } from "../i18n/WebI18nContext";
import { translateWebMessage } from "../i18n/messages";
import { defaultProjectFallbackReadyAtom } from "../state/projects";
import type { Project, Thread } from "../types";
import { CommandPalette } from "./CommandPalette";

const entities = vi.hoisted(() => ({
  projects: [] as ReadonlyArray<Project>,
  threads: [] as ReadonlyArray<Thread>,
}));

vi.mock("../state/entities", async (original) => ({
  ...(await original<typeof import("../state/entities")>()),
  useProjects: () => entities.projects,
  useVisibleThreadShells: () => entities.threads,
}));

// Hold discovery pending; the production fallback atom still interprets the stored key.
vi.mock(import("../connection/catalog"), async (original) => {
  const actual = await original();
  const { Atom } = await import("effect/reactivity");
  return {
    ...actual,
    environmentCatalog: {
      ...actual.environmentCatalog,
      catalogValueAtom: Atom.make<EnvironmentCatalogState>({
        isReady: false,
        entries: new Map(),
      }),
    },
  };
});

function project(id: string, title: string): Project {
  return {
    id: ProjectId.make(`palette-diagnostic-${id}`),
    environmentId: EnvironmentId.make("local"),
    title,
    workspaceRoot: `/work/palette-diagnostic-${id}`,
    repositoryIdentity: null,
    defaultModelSelection: null,
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    scripts: [],
  };
}

function setup(rememberedProject: string | null) {
  const stack = new DisposableStack();
  try {
    const previousKey = localStorage.getItem(LAST_USED_PROJECT_STORAGE_KEY);
    stack.defer(() => {
      if (previousKey === null) localStorage.removeItem(LAST_USED_PROJECT_STORAGE_KEY);
      else localStorage.setItem(LAST_USED_PROJECT_STORAGE_KEY, previousKey);
    });
    if (rememberedProject === null) localStorage.removeItem(LAST_USED_PROJECT_STORAGE_KEY);
    else {
      setLocalStorageItem(
        LAST_USED_PROJECT_STORAGE_KEY,
        rememberedProject,
        lastUsedProjectKeySchema,
      );
    }

    const previousPalette = useCommandPaletteStore.getState();
    stack.defer(() => useCommandPaletteStore.setState(previousPalette, true));
    useCommandPaletteStore.setState(useCommandPaletteStore.getInitialState(), true);

    const previousEntities = { ...entities };
    stack.defer(() => Object.assign(entities, previousEntities));
    entities.projects = [
      project("acme", "Acme"),
      project("beta", "Beta"),
      project("gamma", "Gamma"),
    ];
    entities.threads = [];

    const previousSettings = getClientSettings();
    stack.defer(() => __setClientSettingsForTests(previousSettings));
    __setClientSettingsForTests({ ...DEFAULT_CLIENT_SETTINGS, appLocale: "en" });

    const registry = AtomRegistry.make();
    stack.defer(() => registry.dispose());
    const resources = stack.move();
    return { registry, [Symbol.dispose]: () => resources.dispose() };
  } catch (error) {
    stack.dispose();
    throw error;
  }
}

function observe(caseName: string, stage: string) {
  const dialog = document.querySelector("[data-command-palette]");
  const input = dialog?.querySelector("input");
  const activeDescendant = input?.getAttribute("aria-activedescendant") ?? null;
  const options = Array.from(dialog?.querySelectorAll('[role="option"]') ?? []).map(
    (option, position) => {
      const text = option.textContent?.replace(/\s+/g, " ").trim() ?? "";
      return {
        position,
        category: /^New thread in Acme/.test(text)
          ? "new-thread-default"
          : /^New thread in\.\.\./.test(text)
            ? "new-thread-picker"
            : /^Go to file/.test(text)
              ? "go-to-file"
              : "other",
        highlighted: option.hasAttribute("data-highlighted"),
        active: option.hasAttribute("data-active"),
        isActiveDescendant: activeDescendant !== null && option.id === activeDescendant,
      };
    },
  );
  const rememberedProject = readLastUsedProjectKey();
  console.log(
    "palette-persisted-project-diagnostic",
    JSON.stringify({
      caseName,
      stage,
      keyCategory:
        rememberedProject === null
          ? "clean"
          : rememberedProject === "environment-render:project-render"
            ? "stale"
            : "other",
      inputFocused: document.activeElement === input,
      hasActiveDescendant: activeDescendant !== null,
      mountedOptionCount: options.length,
      firstOptions: options.slice(0, 8),
      originalRootPredicate: options.some(
        (option) => option.category === "new-thread-picker" && option.highlighted,
      ),
    }),
  );
}

it.each([
  {
    name: "clean key",
    stale: false,
    first: /^New thread in Acme/,
    second: /^New thread in\.\.\./,
  },
  {
    name: "unmatched persisted key",
    stale: true,
    first: /^New thread in\.\.\./,
    second: /^Go to file/,
  },
] as const)("observes root keyboard selection with $name and pending catalog", async (scenario) => {
  // This is the project identity used by Sidebar.delete's AppRoot fixture, not a scheduling assumption.
  const rememberedProject = scenario.stale
    ? scopedProjectKey({
        environmentId: EnvironmentId.make("environment-render"),
        projectId: ProjectId.make("project-render"),
      })
    : null;
  using fixture = setup(rememberedProject);
  expect(readLastUsedProjectKey() === rememberedProject).toBe(true);
  expect(fixture.registry.get(environmentCatalog.catalogValueAtom).isReady).toBe(false);
  expect(fixture.registry.get(environmentCatalog.catalogValueAtom).entries.size).toBe(0);
  expect(fixture.registry.get(defaultProjectFallbackReadyAtom(rememberedProject))).toBe(
    !scenario.stale,
  );

  await using _screen = await render(
    <RegistryContext.Provider value={fixture.registry}>
      <WebI18nContext
        value={{
          locale: "en",
          appLocale: "en",
          setAppLocale: () => {},
          t: (key, values) => translateWebMessage("en", key, values),
        }}
      >
        <CommandPalette>{null}</CommandPalette>
      </WebI18nContext>
    </RegistryContext.Provider>,
  );

  try {
    openCommandPalette({});
    await expect
      .element(page.getByPlaceholder("Search commands, projects, and threads..."))
      .toHaveFocus();
    observe(scenario.name, "focused");
    const options = page.getByRole("option");
    await expect.poll(() => options.first().element().textContent).toMatch(scenario.first);
    await expect.poll(() => options.nth(1).element().textContent).toMatch(scenario.second);
    // Stabilize the known starting row only in this hypothesis probe, never in the original test.
    await expect.element(options.first()).toHaveAttribute("data-highlighted");
    await expect.element(options.nth(1)).not.toHaveAttribute("data-highlighted");
    observe(scenario.name, "before-arrow");

    await userEvent.keyboard("{ArrowDown}");
    observe(scenario.name, "after-arrow");
    await expect.poll(() => options.first().element().textContent).toMatch(scenario.first);
    await expect.poll(() => options.nth(1).element().textContent).toMatch(scenario.second);
    await expect.element(options.nth(1)).toHaveAttribute("data-highlighted");
    await expect.element(options.first()).not.toHaveAttribute("data-highlighted");

    const rootTarget = page.getByRole("option", { name: /^New thread in\.\.\./ });
    if (scenario.stale) {
      await expect.element(rootTarget).not.toHaveAttribute("data-highlighted");
    } else {
      await expect.element(rootTarget).toHaveAttribute("data-highlighted");
    }
    expect(fixture.registry.get(environmentCatalog.catalogValueAtom).isReady).toBe(false);
    expect(readLastUsedProjectKey() === rememberedProject).toBe(true);
  } finally {
    observe(scenario.name, "final");
  }
});
