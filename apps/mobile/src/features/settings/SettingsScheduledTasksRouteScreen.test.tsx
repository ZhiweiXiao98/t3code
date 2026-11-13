import { PrimaryConnectionTarget } from "@t3tools/client-runtime/connection";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import type { WebhookFilterDraft } from "@t3tools/client-runtime/scheduled-task-webhook";
import {
  DEFAULT_SERVER_SETTINGS,
  EnvironmentId,
  MAX_WEBHOOK_FILTERS,
  ProjectId,
  ProviderInstanceId,
  ScheduledTaskId,
  ThreadId,
  type ScheduledTask,
  type ServerConfig,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/reactivity";
import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import type { MobileLocale } from "../../i18n/mobileStrings";
import type { SettingsTarget } from "./settings-environment-filter";
import type { ScheduledTaskEditor } from "./scheduled-task-editor-state";

const state = vi.hoisted(() => ({
  locale: "en" as MobileLocale,
  fixture: null as ReturnType<typeof fixture> | null,
  editor: null as ScheduledTaskEditor | null,
  canOperate: true,
  alert: vi.fn<typeof import("react-native").Alert.alert>(),
  upsert: vi.fn(),
  rotate: vi.fn(),
  run: vi.fn(),
  toggle: vi.fn(),
  remove: vi.fn(),
  navigate: vi.fn(),
  goBack: vi.fn(),
  selectDetail: vi.fn(),
  markSaved: vi.fn(),
  startEditor: vi.fn(),
  copy: vi.fn(),
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  TextInput: ({
    value,
    onChangeText,
    accessibilityLabel,
  }: {
    value: string;
    onChangeText: (value: string) => void;
    accessibilityLabel: string;
  }) => (
    <input
      aria-label={accessibilityLabel}
      value={value}
      onInput={(event) => onChangeText(event.currentTarget.value)}
      readOnly
    />
  ),
  Pressable: ({
    children,
    accessibilityLabel,
    disabled,
    onPress,
  }: {
    children?: ReactNode;
    accessibilityLabel?: string;
    disabled?: boolean;
    onPress?: () => void;
  }) => (
    <button aria-label={accessibilityLabel} disabled={disabled} onClick={onPress}>
      {children}
    </button>
  ),
  Alert: { alert: state.alert, prompt: vi.fn() },
}));
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: state.navigate, goBack: state.goBack, isFocused: () => true }),
  useFocusEffect: () => undefined,
  usePreventRemove: () => undefined,
}));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => state.canOperate }));
vi.mock("@expo/ui/community/datetime-picker", () => ({ DateTimePicker: () => null }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock("../../components/ui/AppSymbol", () => ({ SymbolView: () => null }));
vi.mock("../../components/EnvironmentMachineSymbol", () => ({
  EnvironmentMachineSymbol: () => null,
  ENVIRONMENT_MACHINE_SYMBOLS: {},
}));
vi.mock("../../components/ui/ScreenScrollView", () => ({
  ScreenScrollView: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock("../../components/ui/Button", () => ({
  Button: ({
    label,
    onPress,
    disabled,
  }: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
  }) => (
    <button data-button={label} onClick={onPress} disabled={disabled}>
      {label}
    </button>
  ),
}));
vi.mock("../../components/ui/Menu", () => ({
  Menu: ({
    children,
    actions,
    onPressAction,
  }: ComponentProps<typeof import("../../components/ui/Menu").Menu>) => (
    <div>
      {children}
      {actions.map((action) => (
        <button
          key={action.id}
          data-menu-action={action.id}
          disabled={action.attributes?.disabled}
          onClick={() => {
            if (action.id !== undefined) onPressAction?.({ nativeEvent: { event: action.id } });
          }}
        >
          {action.title}
        </button>
      ))}
    </div>
  ),
}));
vi.mock("../../components/ui/SegmentedControl", () => ({ SegmentedControl: () => null }));
vi.mock("../../components/ui/ThemedSwitch", () => ({ ThemedSwitch: () => null }));
vi.mock("./components/SettingsScreen", () => ({
  SettingsScreen: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock("./components/SettingsEnvironmentFilterHeader", () => ({
  useSettingsEnvironmentMenu: () => ({}),
}));
vi.mock("./components/ScheduledTaskPromptField", () => ({
  ScheduledTaskPromptField: ({ value }: { value: string }) => (
    <textarea aria-label="prompt" value={value} readOnly />
  ),
}));
vi.mock("../voice-input/useVoiceInputController", () => ({
  useVoiceInputController: () => ({ blocksSubmission: false, isBusy: false }),
}));
vi.mock("../layout/workspace/useSelectWorkspaceDetail", () => ({
  useSelectWorkspaceDetail: () => state.selectDetail,
}));
vi.mock("../../lib/copyTextWithHaptic", () => ({ tryCopyTextWithHaptic: state.copy }));
vi.mock("../../state/session", () => ({
  readEnvironmentScope: () => state.canOperate,
  usePreparedConnection: () => Option.none(),
}));
vi.mock("../../state/atom-registry", () => ({ appAtomRegistry: {} }));
vi.mock("../../state/server", () => ({
  serverEnvironment: {
    scheduledTasksLive: () => "tasks",
    upsertScheduledTask: { execute: state.upsert, permissionAtom: () => "permission" },
    rotateScheduledTaskWebhookToken: { execute: state.rotate },
    runScheduledTaskNow: { execute: state.run },
    setScheduledTaskEnabled: { execute: state.toggle },
    deleteScheduledTask: { execute: state.remove },
  },
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (command: { execute: () => void }) => command.execute,
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: () => ({ data: { tasks: state.fixture!.tasks }, error: null }),
}));
vi.mock("../../state/entities", () => ({
  useProjects: () => [state.fixture!.project],
  useEnvironmentServerConfig: () => state.fixture!.config,
}));
vi.mock("./settings-environment-filter", () => ({
  useSettingsEnvironmentFilter: () => ({
    availableTargets: [state.fixture!.target],
    selectedTargets: [state.fixture!.target],
    selectedProjectKey: null,
    projectGroups: [],
  }),
}));
vi.mock("./scheduled-task-editor", () => ({
  useScheduledTaskDestinationLabel: () => "Open",
  useScheduledTaskEditor: () => ({
    editor: state.editor,
    voiceOwnerKey: "scheduled-task:test",
    readEditor: () => state.editor,
    setEditor: (editor: ScheduledTaskEditor) => {
      state.editor = editor;
    },
    hasChanges: false,
    startEditor: state.startEditor,
    resetEditor: vi.fn(),
  }),
}));
vi.mock("./scheduled-task-editor-state", () => ({
  discardScheduledTaskEditor: vi.fn(),
  markScheduledTaskEditorSaved: state.markSaved,
  scheduledTaskEditorSessionAtom: {},
}));
vi.mock("../../i18n/mobileStrings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../i18n/mobileStrings")>();
  return {
    ...actual,
    get MOBILE_LOCALE() {
      return state.locale;
    },
    localizeMobileString: (value: string, locale: MobileLocale = state.locale) =>
      actual.localizeMobileString(value, locale),
    localizeAlertArguments: (...args: Parameters<typeof actual.localizeAlertArguments>) =>
      actual.localizeAlertArguments(args[0], args[1], args[2], state.locale),
  };
});

import {
  SettingsScheduledTasksRouteScreen,
  SettingsScheduledTaskEditRouteScreen,
} from "./SettingsScheduledTasksRouteScreen";
import { editDraft } from "./scheduledTaskDraft";
import { SettingsSidebarContext } from "./components/SettingsSection";

function fixture(schedule: ScheduledTask["schedule"] = { type: "interval", everyMs: 60_000 }) {
  const environmentId = EnvironmentId.make("environment");
  const projectId = ProjectId.make("project");
  const config: ServerConfig = {
    environment: {
      environmentId,
      label: "Settings",
      platform: { os: "darwin", arch: "arm64" },
      serverVersion: "0.0.0-test",
      capabilities: { repositoryIdentity: false, scheduledTaskThreadModes: true },
    },
    auth: {
      policy: "loopback-browser",
      bootstrapMethods: ["one-time-token"],
      sessionMethods: ["browser-session-cookie"],
      sessionCookieName: "t3_session",
    },
    cwd: "/workspaces/Open",
    keybindingsConfigPath: "/workspaces/keybindings.json",
    keybindings: [],
    issues: [],
    providers: [],
    availableEditors: [],
    observability: {
      logsDirectoryPath: "/tmp/logs",
      localTracingEnabled: false,
      otlpTracesEnabled: false,
      otlpMetricsEnabled: false,
      otlpLogsEnabled: false,
    },
    settings: DEFAULT_SERVER_SETTINGS,
  };
  const target: SettingsTarget = {
    environmentId,
    label: "Settings",
    displayUrl: "https://example.test",
    relayManaged: false,
    entry: {
      target: new PrimaryConnectionTarget({
        environmentId,
        label: "Settings",
        httpBaseUrl: "https://example.test",
        wsBaseUrl: "wss://example.test",
      }),
      profile: Option.none(),
      enabled: true,
    },
    connection: { phase: "connected", error: null, traceId: null },
    serverConfig: config,
  };
  const project: EnvironmentProject = {
    id: projectId,
    environmentId,
    title: "Open",
    workspaceRoot: "/workspaces/Open",
    defaultModelSelection: null,
    scripts: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const task: ScheduledTask = {
    id: ScheduledTaskId.make("task"),
    title: "Settings",
    prompt: "Open {0} $&\n{{body}}",
    enabled: true,
    schedule,
    projectId,
    threadId: ThreadId.make("thread"),
    threadMode: "continue",
    workspaceStrategy: { type: "root" },
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "Settings" },
    runtimeMode: "full-access",
    interactionMode: "default",
    createdBy: "user",
    creationSource: "mobile",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    nextRunAt: null,
    lastRunAt: null,
    lastRunStatus: "never",
    lastRunError: "Open {0} $&",
    runCount: 0,
    webhook: {
      path: "/hooks/Settings",
      url: "https://example.test/hooks/Settings?label=Open",
      hasSecret: false,
    },
  };
  return { environmentId, config, target, project, task, tasks: [task] };
}

function mount(locale: MobileLocale, schedule?: ScheduledTask["schedule"]) {
  const data = fixture(schedule);
  state.locale = locale;
  state.fixture = data;
  state.editor = {
    environmentId: data.environmentId,
    environmentLabel: data.target.label,
    draft: editDraft(data.task),
  };
  state.canOperate = true;
  for (const mock of [
    state.alert,
    state.upsert,
    state.rotate,
    state.run,
    state.toggle,
    state.remove,
    state.navigate,
    state.goBack,
    state.selectDetail,
    state.markSaved,
    state.startEditor,
    state.copy,
  ])
    mock.mockReset();
  for (const mock of [state.upsert, state.rotate, state.run, state.toggle, state.remove])
    mock.mockResolvedValue(AsyncResult.success(undefined));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  return {
    container,
    fixture: data,
    render(node: ReactNode) {
      act(() => root.render(node));
    },
    async click(selector: string) {
      const button = container.querySelector<HTMLButtonElement>(selector);
      if (!button) throw new Error(`Missing action: ${selector}`);
      await act(async () => button.click());
    },
    [Symbol.dispose]() {
      act(() => root.unmount());
      vi.unstubAllGlobals();
    },
  };
}

it.each(["en", "zh-CN"] as const)(
  "keeps environment/task identity and delete consent literal in %s",
  async (locale) => {
    using screen = mount(locale);
    for (const sidebar of [false, true]) {
      screen.render(
        <SettingsSidebarContext value={sidebar ? { selected: null } : null}>
          <SettingsScheduledTasksRouteScreen />
        </SettingsSidebarContext>,
      );
      expect(screen.container.querySelector("span")!.textContent).toBe("Settings");
      await screen.click('[data-menu-action="delete"]');
      expect(state.alert.mock.lastCall?.[0]).toBe(
        locale === "en" ? "Delete task?" : "删除定时任务？",
      );
      expect(state.alert.mock.lastCall?.[1]).toBe("Settings");
      const buttons = state.alert.mock.lastCall?.[2];
      expect(buttons?.map((button) => [button.text, button.style])).toEqual([
        [locale === "en" ? "Cancel" : "取消", "cancel"],
        [locale === "en" ? "Delete" : "删除", "destructive"],
      ]);
      buttons?.[0]?.onPress?.();
      expect(state.remove).not.toHaveBeenCalled();
    }
    await act(async () => state.alert.mock.lastCall?.[2]?.[1]?.onPress?.());
    expect(state.remove).toHaveBeenCalledExactlyOnceWith({
      environmentId: screen.fixture.environmentId,
      input: { id: screen.fixture.task.id },
    });
    await screen.click('[data-menu-action="thread"]');
    expect(state.selectDetail).toHaveBeenCalledExactlyOnceWith({
      name: "Thread",
      params: { environmentId: "environment", threadId: "thread" },
    });
    await screen.click('[data-menu-action="edit"]');
    expect(state.startEditor).toHaveBeenCalledWith({
      environmentId: screen.fixture.environmentId,
      environmentLabel: "Settings",
      draft: editDraft(screen.fixture.task),
    });
    expect(state.navigate).toHaveBeenCalledWith("SettingsScheduledTaskEdit");
  },
);

it.each(["en", "zh-CN"] as const)(
  "preserves run, toggle and delete failures and permission checks in %s",
  async (locale) => {
    using screen = mount(locale);
    screen.render(<SettingsScheduledTasksRouteScreen />);
    const cases = [
      {
        action: "run",
        command: state.run,
        title: "Could not run task",
        zh: "无法运行任务",
        input: { id: screen.fixture.task.id },
      },
      {
        action: "toggle",
        command: state.toggle,
        title: "Could not update task",
        zh: "无法更新任务",
        input: { id: screen.fixture.task.id, enabled: false },
      },
      {
        action: "delete",
        command: state.remove,
        title: "Could not delete task",
        zh: "无法删除任务",
        input: { id: screen.fixture.task.id },
      },
    ];
    for (const { action, command, title, zh, input } of cases) {
      const trigger = async () => {
        await screen.click(`[data-menu-action="${action}"]`);
        if (action === "delete")
          await act(async () => state.alert.mock.lastCall?.[2]?.[1]?.onPress?.());
      };
      for (const error of ["Settings", "Open {0} $&\n", new Error("Settings")]) {
        command.mockResolvedValue(AsyncResult.failure(Cause.fail(error)));
        await trigger();
        expect(command).toHaveBeenLastCalledWith({
          environmentId: screen.fixture.environmentId,
          input,
        });
        expect(state.alert.mock.lastCall?.slice(0, 2)).toEqual([
          locale === "en" ? title : zh,
          String(error),
        ]);
      }
      command.mockResolvedValue(AsyncResult.failure(Cause.interrupt()));
      state.alert.mockClear();
      await trigger();
      expect(state.alert).toHaveBeenCalledTimes(action === "delete" ? 1 : 0);
    }
    await screen.click('[data-menu-action="delete"]');
    const confirmDelete = state.alert.mock.lastCall?.[2]?.[1]?.onPress;
    state.canOperate = false;
    const deletes = state.remove.mock.calls.length;
    await act(async () => confirmDelete?.());
    expect(state.remove).toHaveBeenCalledTimes(deletes);
    screen.render(<SettingsScheduledTasksRouteScreen />);
    for (const action of ["run", "toggle", "delete"])
      expect(
        screen.container.querySelector<HTMLButtonElement>(`[data-menu-action="${action}"]`)!
          .disabled,
      ).toBe(true);
  },
);

it.each(["en", "zh-CN"] as const)(
  "formats all filter failures before the native dialog and blocks invalid saves in %s",
  async (locale) => {
    using screen = mount(locale, { type: "webhook", signature: null });
    const rows: readonly { filters: readonly WebhookFilterDraft[]; en: string; zh: string }[] = [
      {
        filters: Array.from({ length: MAX_WEBHOOK_FILTERS + 1 }, (_, index) => ({
          id: String(index),
          path: "body",
          op: "exists",
          value: "",
        })),
        en: `Use at most ${MAX_WEBHOOK_FILTERS} filters.`,
        zh: `最多可使用 ${MAX_WEBHOOK_FILTERS} 个筛选条件。`,
      },
      {
        filters: [{ id: "exists", path: "Settings", op: "exists", value: "Open" }],
        en: "Filter 1 needs a path under body, headers or query.",
        zh: "筛选条件 1 需要 body、headers 或 query 下的路径。",
      },
      {
        filters: [{ id: "in", path: "body.Settings", op: "in", value: " , " }],
        en: "Filter 1 needs a path under body, headers or query, and at least one value.",
        zh: "筛选条件 1 需要 body、headers 或 query 下的路径，以及至少一个值。",
      },
      {
        filters: [{ id: "equals", path: "Settings", op: "equals", value: "Open {0} $&" }],
        en: "Filter 1 needs a path under body, headers or query, and a value.",
        zh: "筛选条件 1 需要 body、headers 或 query 下的路径，以及一个值。",
      },
    ];
    for (const { filters, en, zh } of rows) {
      state.editor = {
        ...state.editor!,
        draft: { ...state.editor!.draft, schedule: { ...state.editor!.draft.schedule, filters } },
      };
      state.alert.mockClear();
      screen.render(<SettingsScheduledTaskEditRouteScreen key={en} />);
      await screen.click('[data-button="Save changes"]');
      expect(state.alert).toHaveBeenCalledOnce();
      expect(state.alert.mock.lastCall?.slice(0, 2)).toEqual([
        locale === "en" ? "Invalid filter" : "筛选条件无效",
        locale === "en" ? en : zh,
      ]);
      expect(state.upsert).not.toHaveBeenCalled();
      expect(state.goBack).not.toHaveBeenCalled();
    }
  },
);

it.each(["en", "zh-CN"] as const)(
  "keeps save and rotate failures literal, permits retry, and sends exact webhook values in %s",
  async (locale) => {
    using screen = mount(locale, { type: "webhook", signature: null });
    const filters: readonly WebhookFilterDraft[] = [
      { id: "raw", path: "body.Settings", op: "equals", value: "Open {0} $&\n" },
      { id: "list", path: "query.Open", op: "in", value: "Settings,Open {0} $&" },
    ];
    state.editor = {
      ...state.editor!,
      draft: {
        ...state.editor!.draft,
        schedule: { ...state.editor!.draft.schedule, filters, replayKey: "{{headers.Settings}}" },
      },
    };
    screen.render(<SettingsScheduledTaskEditRouteScreen />);
    for (const error of ["Settings", "Open {0} $&", new Error("Settings")]) {
      state.upsert.mockResolvedValue(AsyncResult.failure(Cause.fail(error)));
      await screen.click('[data-button="Save changes"]');
      expect(state.alert.mock.lastCall?.slice(0, 2)).toEqual([
        locale === "en" ? "Could not save task" : "无法保存任务",
        String(error),
      ]);
      expect(state.markSaved).not.toHaveBeenCalled();
      expect(state.goBack).not.toHaveBeenCalled();
    }
    expect(state.upsert.mock.lastCall?.[0]).toEqual({
      environmentId: screen.fixture.environmentId,
      input: {
        id: screen.fixture.task.id,
        requireExisting: true,
        title: "Settings",
        prompt: "Open {0} $&\n{{body}}",
        projectId: screen.fixture.project.id,
        modelSelection: screen.fixture.task.modelSelection,
        schedule: {
          type: "webhook",
          signature: null,
          maxDeliveryAgeMinutes: null,
          dedupe: { replayKey: "{{headers.Settings}}" },
          filters: [
            { path: "body.Settings", op: "equals", value: "Open {0} $&\n" },
            { path: "query.Open", op: "in", value: ["Settings", "Open {0} $&"] },
          ],
        },
        enabled: true,
        threadId: screen.fixture.task.threadId,
        threadMode: "continue",
        workspaceStrategy: { type: "root" },
        runtimeMode: "full-access",
        interactionMode: "default",
        creationSource: "mobile",
      },
    });
    state.upsert.mockResolvedValue(AsyncResult.failure(Cause.interrupt()));
    state.alert.mockClear();
    await screen.click('[data-button="Save changes"]');
    expect(state.alert).not.toHaveBeenCalled();
    await screen.click('[data-button="Rotate URL"]');
    state.alert.mock.lastCall?.[2]?.[0]?.onPress?.();
    expect(state.rotate).not.toHaveBeenCalled();
    for (const error of ["Settings", "Open {0} $&", new Error("Settings")]) {
      state.rotate.mockResolvedValue(AsyncResult.failure(Cause.fail(error)));
      await screen.click('[data-button="Rotate URL"]');
      await act(async () => state.alert.mock.lastCall?.[2]?.[1]?.onPress?.());
      expect(state.rotate).toHaveBeenLastCalledWith({
        environmentId: screen.fixture.environmentId,
        input: { id: screen.fixture.task.id },
      });
      expect(state.alert.mock.lastCall?.slice(0, 2)).toEqual([
        locale === "en" ? "Could not rotate URL" : "无法更换 URL",
        String(error),
      ]);
    }
    state.rotate.mockResolvedValue(AsyncResult.failure(Cause.interrupt()));
    await screen.click('[data-button="Rotate URL"]');
    const confirmRotate = state.alert.mock.lastCall?.[2]?.[1]?.onPress;
    state.alert.mockClear();
    await act(async () => confirmRotate?.());
    expect(state.alert).not.toHaveBeenCalled();
    const copyButton = [...screen.container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) =>
        button.getAttribute("aria-label") ===
        (locale === "en" ? "Copy webhook URL" : "复制 Webhook URL"),
    );
    if (!copyButton) throw new Error("Missing webhook copy action");
    await act(async () => copyButton.click());
    expect(state.copy).toHaveBeenCalledExactlyOnceWith(screen.fixture.task.webhook!.url);
    state.upsert.mockResolvedValue(AsyncResult.success(undefined));
    await screen.click('[data-button="Save changes"]');
    expect(state.markSaved).toHaveBeenCalledOnce();
    expect(state.goBack).toHaveBeenCalledOnce();
  },
);

it("keeps one save in flight and closes only after the command completes", async () => {
  using screen = mount("zh-CN", { type: "webhook", signature: null });
  const pending = Promise.withResolvers<AsyncResult.Success<void>>();
  state.upsert.mockReturnValue(pending.promise);
  screen.render(<SettingsScheduledTaskEditRouteScreen />);
  await screen.click('[data-button="Save changes"]');
  await screen.click('[data-button="Saving…"]');
  expect(state.upsert).toHaveBeenCalledOnce();
  expect(state.markSaved).not.toHaveBeenCalled();
  expect(state.goBack).not.toHaveBeenCalled();
  await act(async () => pending.resolve(AsyncResult.success(undefined)));
  expect(state.markSaved).toHaveBeenCalledOnce();
  expect(state.goBack).toHaveBeenCalledOnce();
});
