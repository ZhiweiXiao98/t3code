import type { EnvironmentCatalogState } from "@t3tools/client-runtime/state/connections";
import { threadKey } from "@t3tools/client-runtime/state/entities";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { act, render } from "../../test/render";
import { openCommandPalette } from "../commandPaletteBus";
import { useCommandPaletteStore } from "../commandPaletteStore";
import { LAST_USED_PROJECT_STORAGE_KEY } from "../hooks/useHandleNewThread";
import { removeLocalStorageItem } from "../hooks/useLocalStorage";
import { makeThreadFixture } from "../test-fixtures";
import type { Project, Thread } from "../types";
import { CommandPalette } from "./CommandPalette";
import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";

const entities = vi.hoisted(() => ({
  projects: [] as ReadonlyArray<Project>,
  threads: [] as ReadonlyArray<Thread>,
  delegatedUnderParent: new Set<string>() as ReadonlySet<string>,
}));
vi.mock("../state/entities", async (original) => ({
  ...(await original<typeof import("../state/entities")>()),
  useProjects: () => entities.projects,
  useVisibleThreadShells: () => entities.threads,
  useDelegatedUnderParent: () => entities.delegatedUnderParent,
}));

// Keep discovery pending so a remembered project cannot silently enable fallback.
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

function setup(state: Partial<typeof entities> = {}) {
  using stack = new DisposableStack();
  const previousProject = localStorage.getItem(LAST_USED_PROJECT_STORAGE_KEY);
  stack.defer(() => {
    if (previousProject === null)
      localStorage.removeItem(LAST_USED_PROJECT_STORAGE_KEY);
    else localStorage.setItem(LAST_USED_PROJECT_STORAGE_KEY, previousProject);
  });
  localStorage.removeItem(LAST_USED_PROJECT_STORAGE_KEY);

  useCommandPaletteStore.setState(
    useCommandPaletteStore.getInitialState(),
    true,
  );
  entities.projects = state.projects ?? [];
  entities.threads = state.threads ?? [];
  entities.delegatedUnderParent = state.delegatedUnderParent ?? new Set();
  return stack.move();
}

describe("CommandPalette open intents", () => {
  it("drags a searched thread into the current composer without navigating", async () => {
    const environmentId = EnvironmentId.make("remote");
    const threadId = ThreadId.make("dragged-thread");
    using _fixture = setup({
      threads: [
        makeThreadFixture({
          environmentId,
          id: threadId,
          title: "Drag this thread",
        }),
      ],
    });
    const onDrop = vi.fn();
    await using screen = await render(
      <CommandPalette>
        <div
          data-thread-context-drop="true"
          ref={(node) => {
            node?.addEventListener("t3-thread-context-drop", onDrop);
          }}
          style={{ position: "fixed", bottom: 0, width: 300, height: 100 }}
        >
          Composer
        </div>
      </CommandPalette>,
    );
    const pathname = screen.router?.state.location.pathname;
    openCommandPalette({ query: "Drag this thread" });
    const row = page.getByRole("option", { name: /Drag this thread/ });
    await expect.element(row).toBeVisible();
    const bounds = row.element().getBoundingClientRect();
    const pointer = (type: string, x: number, y: number) =>
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        isPrimary: true,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
        clientX: x,
        clientY: y,
      });
    await act(() => {
      row
        .element()
        .dispatchEvent(pointer("pointerdown", bounds.x + 20, bounds.y + 10));
      document.dispatchEvent(
        pointer("pointermove", bounds.x + 30, bounds.y + 20),
      );
    });
    expect(useCommandPaletteStore.getState().open).toBe(false);
    await act(() => {
      document.dispatchEvent(
        pointer("pointermove", 50, window.innerHeight - 30),
      );
      document.dispatchEvent(pointer("pointerup", 50, window.innerHeight - 30));
    });
    expect(onDrop).toHaveBeenCalledOnce();
    expect((onDrop.mock.calls[0]![0] as CustomEvent).detail).toEqual([
      { environmentId, threadId, title: "Drag this thread" },
    ]);
    expect(screen.router?.state.location.pathname).toBe(pathname);
  });

  it("opens New thread in... with focus in the search input, not the Back button", async () => {
    using _fixture = setup();
    await using _screen = await render(<CommandPalette>{null}</CommandPalette>);

    openCommandPalette({ open: "new-thread-in" });

    await expect.element(page.getByPlaceholder("Search...")).toHaveFocus();
  });

  it("highlights the first project when New thread in... opens from the root list", async () => {
    const environmentId = EnvironmentId.make("local");
    const project = (id: string, title: string): Project => ({
      id: ProjectId.make(id),
      environmentId,
      title,
      workspaceRoot: `/work/${id}`,
      repositoryIdentity: null,
      defaultModelSelection: null,
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
      scripts: [],
    });
    using storage = new DisposableStack();
    const previousProject = localStorage.getItem(LAST_USED_PROJECT_STORAGE_KEY);
    storage.defer(() => {
      if (previousProject === null)
        localStorage.removeItem(LAST_USED_PROJECT_STORAGE_KEY);
      else localStorage.setItem(LAST_USED_PROJECT_STORAGE_KEY, previousProject);
    });
    const staleProject = JSON.stringify("environment-render:project-render");
    localStorage.setItem(LAST_USED_PROJECT_STORAGE_KEY, staleProject);

    {
      using _fixture = setup({
        projects: [
          project("acme", "Acme"),
          project("beta", "Beta"),
          project("gamma", "Gamma"),
        ],
      });
      await using _screen = await render(
        <CommandPalette>{null}</CommandPalette>,
      );

      openCommandPalette({});
      await expect
        .element(
          page.getByPlaceholder("Search commands, projects, and threads..."),
        )
        .toHaveFocus();
      await userEvent.keyboard("{ArrowDown}");
      await expect
        .element(page.getByRole("option", { name: /^New thread in\.\.\./ }))
        .toHaveAttribute("data-highlighted");
      await userEvent.keyboard("{Enter}");

      await expect.element(page.getByPlaceholder("Search...")).toHaveFocus();
      await expect
        .element(page.getByRole("option").first())
        .toHaveAttribute("data-highlighted");
      await expect
        .element(page.getByRole("option").nth(1))
        .not.toHaveAttribute("data-highlighted");
    }
    expect(localStorage.getItem(LAST_USED_PROJECT_STORAGE_KEY)).toBe(
      staleProject,
    );
  });

  it("opens a search intent with its query in the focused input", async () => {
    using _fixture = setup();
    await using _screen = await render(<CommandPalette>{null}</CommandPalette>);

    openCommandPalette({ query: "acme" });

    const input = page.getByPlaceholder(
      "Search commands, projects, and threads...",
    );
    await expect.element(input).toHaveFocus();
    await expect.element(input).toHaveValue("acme");
  });

  it("opens a searched project's latest listed thread, not a newer subagent, delegated task, or parked thread", async () => {
    const environmentId = EnvironmentId.make("local");
    const projectId = ProjectId.make("acme");
    const parentId = ThreadId.make("parent");
    const delegatedId = ThreadId.make("delegated");
    using _fixture = setup({
      delegatedUnderParent: new Set([
        threadKey({ environmentId, threadId: delegatedId }),
      ]),
      projects: [
        {
          id: projectId,
          environmentId,
          title: "Acme",
          workspaceRoot: "/work/acme",
          repositoryIdentity: null,
          defaultModelSelection: null,
          createdAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-03-01T00:00:00.000Z",
          scripts: [],
        },
      ],
      threads: [
        makeThreadFixture({
          id: parentId,
          environmentId,
          projectId,
          latestUserMessageAt: "2026-03-02T00:00:00.000Z",
        }),
        makeThreadFixture({
          id: ThreadId.make("subagent"),
          environmentId,
          projectId,
          updatedAt: "2026-03-03T00:00:00.000Z",
          lineage: {
            rootThreadId: parentId,
            parentThreadId: parentId,
            relationshipToParent: "subagent",
          },
        }),
        makeThreadFixture({
          id: delegatedId,
          environmentId,
          projectId,
          latestUserMessageAt: "2026-03-04T00:00:00.000Z",
        }),
        makeThreadFixture({
          id: ThreadId.make("settled"),
          environmentId,
          projectId,
          latestUserMessageAt: "2026-03-05T00:00:00.000Z",
          settledOverride: "settled",
        }),
        makeThreadFixture({
          id: ThreadId.make("snoozed"),
          environmentId,
          projectId,
          latestUserMessageAt: "2026-03-06T00:00:00.000Z",
          snoozedUntil: "2999-01-01T00:00:00.000Z",
        }),
      ],
    });
    await using screen = await render(<CommandPalette>{null}</CommandPalette>);

    openCommandPalette({ query: "Acme" });
    await page.getByRole("option", { name: /Acme/ }).first().click();

    await vi.waitFor(() =>
      expect(screen.router?.state.location.pathname).toBe("/local/parent"),
    );
  });
});

it("keeps the MCP action searchable as its displayed title follows the current language", async () => {
  using _fixture = setup();
  const palette = (locale: "en" | "zh-CN") => (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => {},
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <CommandPalette>{null}</CommandPalette>
    </WebI18nContext>
  );
  await using screen = await render(palette("zh-CN"));
  openCommandPalette({ query: "MCP" });
  await expect
    .element(
      page.getByRole("option", { name: /在其他应用中使用 T3 Code（MCP）/ }),
    )
    .toBeVisible();
  await screen.rerender(palette("en"));
  await expect
    .element(
      page.getByRole("option", { name: /Use T3 Code in another app \(MCP\)/ }),
    )
    .toBeVisible();
  await userEvent.keyboard("{Escape}");
  expect(useCommandPaletteStore.getState().open).toBe(false);
});
