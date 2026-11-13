import { act, fakeTimers, render } from "../../../test/render";
import { RegistryProvider } from "@effect/atom-react";
import { DEFAULT_SERVER_SETTINGS, StorageCleanupReport } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { toastManager } from "../ui/toast";
import { type ReactNode } from "react";
import { expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  locale: "en" as "en" | "zh-CN",
  settings: {} as typeof DEFAULT_SERVER_SETTINGS,
  targets: [] as Array<{ environmentId: string; settings: typeof DEFAULT_SERVER_SETTINGS }>,
  run: vi.fn(),
  report: null as StorageCleanupReport | null,
}));

vi.mock(import("../../i18n/readWebI18n"), async () => {
  const { translateWebMessage } = await import("../../i18n/messages");
  return {
    readWebI18n: () => ({
      locale: state.locale,
      t: (
        key: Parameters<typeof translateWebMessage>[1],
        values?: Parameters<typeof translateWebMessage>[2],
      ) => translateWebMessage(state.locale, key, values),
    }),
  };
});

vi.mock(import("../../state/server"), async (original) => {
  const actual = await original();
  const { Atom } = await import("effect/reactivity");
  const report = Atom.make(() => ({ _tag: "Success", value: state.report, waiting: false }));
  const allowed = Atom.make(true);
  return {
    ...actual,
    serverEnvironment: {
      ...actual.serverEnvironment,
      storageCleanupReport: (() => report) as never,
      runStorageCleanup: {
        ...actual.serverEnvironment.runStorageCleanup,
        permissionAtom: () => allowed,
      },
    },
  };
});
vi.mock(import("../../state/use-atom-command"), async (original) => ({
  ...(await original()),
  useAtomCommand: (() => state.run) as never,
}));
vi.mock(import("./SettingsScopeContext"), async (original) => ({
  ...(await original()),
  useSettingsScope: (() => {
    const environments = state.targets.map(({ environmentId, settings }) => ({
      environmentId,
      label: environmentId,
      serverConfig: {
        settings,
        environment: {
          capabilities: {
            storageCleanup: true,
            storageCleanupRun: true,
            settledWorktreeCleanup: true,
          },
        },
      },
    }));
    return {
      scope: { kind: "all" },
      environments,
      connectedEnvironments: environments,
      targets: state.targets,
      target: null,
    };
  }) as never,
}));
vi.mock(import("./useScopedSettings"), async (original) => ({
  ...(await original()),
  useScopedSettings: (() => state.settings) as never,
  useScopedSettingsMixed: () => false,
  useUpdateScopedSettings: () => vi.fn(),
  useClearScopedSettings: () => vi.fn(),
}));
vi.mock(import("./settingsLayout"), async (original) => ({
  ...(await original()),
  SettingsPageContainer: (({ children }: { children: ReactNode }) => children) as never,
  SettingsRow: ({ title, description, status, control, children }) => (
    <div>
      <h3>{title}</h3>
      {description}
      {status && (
        <div
          data-testid={`${title === "Delete old browser artifacts" ? "artifact" : "logs"}-retention-status`}
        >
          {status}
        </div>
      )}
      {control}
      {children}
    </div>
  ),
  SettingResetButton: (() => null) as never,
}));
vi.mock(import("../ui/toast"), async (original) => {
  const actual = await original();
  return { ...actual, toastManager: { ...actual.toastManager, add: vi.fn() } };
});

import { StorageCleanupSections } from "./StorageSettings";

function setup() {
  state.locale = "en";
  vi.mocked(toastManager.add).mockClear();
  state.settings = {
    ...DEFAULT_SERVER_SETTINGS,
    storageCleanup: {
      worktreeKeepWhen: "uncommitted-changes",
      worktreeAfterDays: null,
      worktreeSettledAfterDays: null,
      worktreeOnMerge: false,
      worktreeOnDelete: false,
      worktreeUnchanged: false,
      browserArtifactsAfterDays: null,
      logsAfterDays: null,
    },
    projectSettingsOverrides: {},
  };
  state.targets = ["env-a", "env-b"].map((environmentId) => ({
    environmentId,
    settings: state.settings,
  }));
  state.report = null;
  state.run.mockReset();
}

function setRetentionValues(
  artifactDays: ReadonlyArray<number | null>,
  logDays: ReadonlyArray<number | null> = artifactDays.map(() => null),
  environmentIds: readonly string[] = ["env-a", "env-b"],
) {
  state.targets = artifactDays.map((browserArtifactsAfterDays, index) => ({
    environmentId: environmentIds[index]!,
    settings: {
      ...state.settings,
      storageCleanup: {
        ...state.settings.storageCleanup,
        browserArtifactsAfterDays,
        logsAfterDays: logDays[index]!,
      },
    },
  }));
  state.settings = state.targets[0]?.settings ?? state.settings;
}

const panel = (locale = state.locale) => (
  <WebI18nContext.Provider
    value={{
      locale,
      appLocale: locale,
      setAppLocale: () => undefined,
      t: (key, values) => translateWebMessage(locale, key, values),
    }}
  >
    <RegistryProvider>
      <StorageCleanupSections />
    </RegistryProvider>
  </WebI18nContext.Provider>
);
const deleteButton = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "Delete now",
  )!;

it("keeps cleanup disabled when settled retention and all other rules are off", async () => {
  setup();
  await using screen = await render(panel());
  const button = deleteButton(screen.container);

  expect(button.disabled).toBe(true);
  await act(async () => button.click());
  expect(state.run).not.toHaveBeenCalled();
});

it("settles mixed retention statuses independently across selected machines", async () => {
  setup();
  using _timers = fakeTimers();
  await using screen = await render(panel());
  const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

  await advance(300);
  setRetentionValues([8, null], [8, null]);
  await screen.rerender(panel());
  await advance(125);
  await expect.element(screen.getByTestId("artifact-retention-status")).not.toBeInTheDocument();
  await expect.element(screen.getByTestId("logs-retention-status")).not.toBeInTheDocument();
  setRetentionValues([null, null], [8, null]);
  await screen.rerender(panel());
  await advance(8);
  await expect.element(screen.getByTestId("logs-retention-status")).not.toBeInTheDocument();
  await advance(117);
  await expect.element(screen.getByTestId("logs-retention-status")).not.toBeInTheDocument();
  setRetentionValues([null, null]);
  await screen.rerender(panel());
  await advance(300);
  await expect.element(screen.getByTestId("artifact-retention-status")).not.toBeInTheDocument();
  await expect.element(screen.getByTestId("logs-retention-status")).not.toBeInTheDocument();

  setRetentionValues([8, null]);
  await screen.rerender(panel());
  await advance(300);
  await expect
    .element(screen.getByTestId("artifact-retention-status"))
    .toHaveTextContent("Mixed across selected machines");
  await expect.element(screen.getByTestId("logs-retention-status")).not.toBeInTheDocument();

  setRetentionValues([null, null]);
  await screen.rerender(panel());
  await advance(75);
  await expect
    .element(screen.getByTestId("artifact-retention-status"))
    .toHaveTextContent("Mixed across selected machines");
  setRetentionValues([8, null]);
  await screen.rerender(panel());
  await advance(133);
  await expect
    .element(screen.getByTestId("artifact-retention-status"))
    .toHaveTextContent("Mixed across selected machines");
  setRetentionValues([null, null]);
  await screen.rerender(panel());
  await advance(133);
  await expect
    .element(screen.getByTestId("artifact-retention-status"))
    .toHaveTextContent("Mixed across selected machines");
  await advance(117);
  await expect
    .element(screen.getByTestId("artifact-retention-status"))
    .toHaveTextContent("Mixed across selected machines");
  setRetentionValues([8, null]);
  await screen.rerender(panel());
  await advance(300);
  await expect
    .element(screen.getByTestId("artifact-retention-status"))
    .toHaveTextContent("Mixed across selected machines");

  setRetentionValues([8], [null], ["env-c"]);
  await screen.rerender(panel());
  await expect.element(screen.getByTestId("artifact-retention-status")).not.toBeInTheDocument();

  setRetentionValues([null, null], [null, null], ["env-c", "env-d"]);
  await screen.rerender(panel());
  await expect.element(screen.getByTestId("artifact-retention-status")).not.toBeInTheDocument();

  setRetentionValues([null, null], [8, null]);
  await screen.rerender(panel());
  await advance(300);
  await expect.element(screen.getByTestId("artifact-retention-status")).not.toBeInTheDocument();
  await expect
    .element(screen.getByTestId("logs-retention-status"))
    .toHaveTextContent("Mixed across selected machines");
  setRetentionValues([null, null]);
  await screen.rerender(panel());
  await advance(300);
  await expect.element(screen.getByTestId("logs-retention-status")).not.toBeInTheDocument();
});

const decodeCleanupReport = Schema.decodeUnknownSync(StorageCleanupReport);

function wireReport(entries: ReadonlyArray<Record<string, unknown>>) {
  return decodeCleanupReport(
    JSON.parse(
      JSON.stringify({
        trigger: "manual",
        startedAt: "2026-06-10T12:00:00.000Z",
        finishedAt: "2026-06-10T12:00:01.000Z",
        entries: entries.map((entry) => ({
          kind: "worktree",
          outcome: "kept",
          reason: "No rules apply",
          path: "literal/{count}/$&/中文",
          projectPath: "project/{file}/$&/中文",
          threadId: null,
          threadTitle: "Name stays literal",
          bytes: null,
          files: null,
          ...entry,
        })),
        counts: { removed: 0, kept: entries.length, failed: 0 },
        omittedCount: 0,
        bytesFreed: 0,
      }),
    ),
  );
}

it("renders decoded owned reasons across en → zh → en while leaving old and future payloads literal", async () => {
  setup();
  setRetentionValues([8]);
  const file = "ignored/{count}/$&/中文";
  state.report = wireReport([
    { reason: "No rules apply", reasonMessage: { code: "no-rules" } },
    { reason: "No rules apply" },
    { reason: "No rules apply", reasonMessage: { code: "future-reason" } },
    { reason: "No rules apply", reasonMessage: { code: "uncommitted-changes", count: "1" } },
    { reason: `Has ignored files (${file})`, reasonMessage: { code: "ignored-files", file } },
    {
      reason: `Submodule has ignored files (${file})`,
      reasonMessage: {
        code: "submodule-local-changes",
        changes: { code: "ignored-files", file },
      },
    },
    {
      reason: "Has uncommitted changes (1 file)",
      reasonMessage: { code: "uncommitted-changes", count: 1 },
    },
    {
      reason: "Has uncommitted changes (2 files)",
      reasonMessage: { code: "uncommitted-changes", count: 2 },
    },
    {
      reason: "Inactive for 2 of 8 days",
      reasonMessage: { code: "inactive-retention", days: 2, retentionDays: 8 },
    },
    {
      reason: "git: command failed",
      outcome: "failed",
      reasonMessage: { code: "git-command-failed", command: "git" },
    },
    { reason: "git: command failed", outcome: "failed" },
    {
      reason: "Removed 2 rotated logs",
      kind: "logs",
      outcome: "removed",
      reasonMessage: { code: "removed-logs", count: 2 },
    },
  ]);
  await using screen = await render(panel());
  await screen.getByRole("button", { name: /Last run/ }).click();
  await expect
    .element(screen.getByText(`Has ignored files (${file})`, { exact: true }))
    .toBeVisible();
  await screen.rerender(panel("zh-CN"));
  await expect.element(screen.getByText("没有适用的规则", { exact: true })).toBeVisible();
  expect(screen.container.textContent?.match(/No rules apply/g)).toHaveLength(3);
  await expect
    .element(screen.getByText(`存在被忽略的文件（${file}）`, { exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByText(`子模块：存在被忽略的文件（${file}）`, { exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByText("存在未提交的更改（1 个文件）", { exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByText("存在未提交的更改（2 个文件）", { exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByText("已闲置 2 天，保留期限为 8 天", { exact: true }))
    .toBeVisible();
  await expect.element(screen.getByText("git：命令失败", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("git: command failed", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("已移除 2 个轮转日志", { exact: true })).toBeVisible();
  expect(screen.container.textContent).toContain("literal/{count}/$&/中文");
  expect(screen.container.textContent).toContain("project/{file}/$&/中文");
  expect(screen.container.textContent).toContain("Name stays literal");
  await screen.rerender(panel("en"));
  await expect
    .element(screen.getByText(`Submodule has ignored files (${file})`, { exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByText("Has uncommitted changes (1 file)", { exact: true }))
    .toBeVisible();
  expect(screen.container.textContent?.match(/No rules apply/g)).toHaveLength(4);
});

it("uses the completion-time locale for real cleanup failure toasts and preserves raw collisions", async () => {
  setup();
  setRetentionValues([8]);
  const reason = "git: Git index is locked. Status will resume when the index lock is removed.";
  const owned = wireReport([
    { outcome: "failed", reason, reasonMessage: { code: "git-index-locked", command: "git" } },
  ]);
  type CleanupResult = { _tag: "Success"; value: StorageCleanupReport };
  let resolveCleanup!: (result: CleanupResult) => void;
  const pending = new Promise<CleanupResult>((resolve) => {
    resolveCleanup = resolve;
  });
  state.run.mockReturnValueOnce(pending);
  await using screen = await render(panel());
  await act(async () => deleteButton(screen.container).click());
  state.locale = "zh-CN";
  await screen.rerender(panel());
  await act(async () => resolveCleanup({ _tag: "Success", value: owned }));
  await vi.waitFor(() =>
    expect(toastManager.add).toHaveBeenLastCalledWith(
      expect.objectContaining({
        description: "git：Git 索引已锁定。移除索引锁后将恢复状态检查。",
      }),
    ),
  );
  state.run.mockResolvedValueOnce({
    _tag: "Success",
    value: wireReport([{ outcome: "failed", reason }]),
  });
  await screen.getByRole("button", { name: "立即删除", exact: true }).click();
  await vi.waitFor(() =>
    expect(toastManager.add).toHaveBeenLastCalledWith(
      expect.objectContaining({ description: reason }),
    ),
  );
  state.locale = "en";
  await screen.rerender(panel());
  state.run.mockResolvedValueOnce({ _tag: "Success", value: owned });
  await screen.getByRole("button", { name: "Delete now", exact: true }).click();
  await vi.waitFor(() =>
    expect(toastManager.add).toHaveBeenLastCalledWith(
      expect.objectContaining({ description: reason }),
    ),
  );
});
