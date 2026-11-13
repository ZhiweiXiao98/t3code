import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import {
  DEFAULT_SERVER_SETTINGS,
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  SourceControlProviderKind,
  ThreadId,
  type ThreadPullRequestLink,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import type { MobileLocale } from "../../i18n/mobileStrings";
import type { ThreadPrPresentation } from "../../state/thread-pr-presentation";
import { makeThreadShellFixture } from "../../test-fixtures";

const mocks = vi.hoisted(() => ({
  locale: "en" as MobileLocale,
  alert: vi.fn(),
  prompt: vi.fn(),
  copy: vi.fn(),
  openUrl: vi.fn(),
  openPr: vi.fn(),
  navigate: vi.fn(),
  link: vi.fn(),
  unlink: vi.fn(),
  watch: vi.fn(),
  canOperate: true,
}));
vi.mock("react-native", () => ({ Alert: { alert: mocks.alert, prompt: mocks.prompt } }));
vi.mock("expo-clipboard", () => ({ setStringAsync: mocks.copy }));
vi.mock("../../lib/openExternalUrl", () => ({ tryOpenExternalUrl: mocks.openUrl }));
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mocks.navigate }),
}));
vi.mock("../../native/useOpenPullRequest", () => ({
  useNavigateToPullRequest: () => mocks.openPr,
}));
vi.mock("../../state/session", () => ({ useEnvironmentScope: () => mocks.canOperate }));
vi.mock("../../state/threads", () => ({
  threadEnvironment: {
    linkPullRequest: "link",
    unlinkPullRequest: "unlink",
    watchPullRequest: "watch",
  },
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (command: "link" | "unlink" | "watch") => mocks[command],
}));
vi.mock("../../i18n/mobileStrings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../i18n/mobileStrings")>();
  return {
    ...actual,
    get MOBILE_LOCALE() {
      return mocks.locale;
    },
    localizeMobileString: (value: string, locale: MobileLocale = mocks.locale) =>
      actual.localizeMobileString(value, locale),
    localizeAlertArguments: (...args: Parameters<typeof actual.localizeAlertArguments>) =>
      actual.localizeAlertArguments(args[0], args[1], args[2], mocks.locale),
  };
});

import * as Dialog from "../../components/ui/Dialog";
import { useLinkedPullRequestActions } from "./useLinkedPullRequestActions";
import { useOpenThreadPullRequests } from "./use-open-thread-pull-requests";

function setup(locale: MobileLocale) {
  mocks.locale = locale;
  mocks.canOperate = true;
  for (const mock of [
    mocks.alert,
    mocks.prompt,
    mocks.copy,
    mocks.openUrl,
    mocks.openPr,
    mocks.navigate,
    mocks.link,
    mocks.unlink,
    mocks.watch,
  ])
    mock.mockReset();
  mocks.copy.mockResolvedValue(undefined);
}

function fixture(kind: "github" | "gitlab") {
  const host = kind === "github" ? "github.com" : "gitlab.com";
  const repository = "Settings/Open";
  const route = kind === "github" ? "pull" : "-/merge_requests";
  const environmentId = EnvironmentId.make("environment");
  const projectId = ProjectId.make("project");
  const thread = makeThreadShellFixture({
    id: ThreadId.make("thread"),
    environmentId,
    projectId,
    title: "Open",
    providerInstanceId: ProviderInstanceId.make("codex"),
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "Settings" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
  });
  const link: ThreadPullRequestLink = {
    host,
    repository,
    number: 42,
    url: `https://${host}/${repository}/${route}/42`,
    snapshot: null,
    stack: null,
    source: "manual",
    linkedAt: "2026-01-01T00:00:00.000Z",
  };
  const input: Parameters<typeof useLinkedPullRequestActions>[0] = {
    thread,
    project: {
      id: projectId,
      environmentId,
      title: "Open",
      workspaceRoot: "/workspaces/Open",
      defaultModelSelection: null,
      scripts: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      repositoryIdentity: {
        provider: SourceControlProviderKind.make(kind),
        canonicalKey: `${host}/${repository}`,
        displayName: repository,
        locator: {
          source: "git-remote",
          remoteName: "origin",
          remoteUrl: `https://${host}/${repository}.git`,
        },
      },
    },
    runtime: {
      connectionState: "connected",
      connectionError: null,
      connectionErrorTraceId: null,
      serverConfig: {
        environment: {
          environmentId,
          label: "Settings",
          platform: { os: "darwin", arch: "arm64" },
          serverVersion: "0.0.0-test",
          capabilities: { repositoryIdentity: true, threadPullRequestWatch: true },
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
      },
    },
  };
  return { thread, link, input, term: kind === "github" ? "拉取请求" : "合并请求" };
}

function submit(reference: string) {
  const buttons = mocks.prompt.mock.lastCall?.[2] as Array<{ onPress?: (value: string) => void }>;
  buttons[1]!.onPress?.(reference);
}

it.each(["en", "zh-CN"] as const)(
  "localizes PR/MR prompts and resolver failures in %s without changing numeric references or cancellation",
  async (locale) => {
    for (const kind of ["github", "gitlab"] as const) {
      setup(locale);
      const { input, link, term } = fixture(kind);
      const actions = useLinkedPullRequestActions(input);
      using prompt = vi.spyOn(Dialog, "prompt");
      actions.promptLink();
      const englishTerm = actions.terminology.singular;
      expect(mocks.prompt.mock.lastCall?.[0]).toBe(
        locale === "en" ? `Link ${englishTerm}` : `连接 ${term}`,
      );
      expect(mocks.prompt.mock.lastCall?.[1]).toBe(
        locale === "en"
          ? `Paste a ${englishTerm} URL, or enter 123 / #123 for this thread's repository.`
          : `粘贴${term}网址，或输入 123 / #123 来关联此对话仓库中的请求。`,
      );
      expect(prompt.mock.lastCall?.[0].placeholder).toBe(
        locale === "en"
          ? `${englishTerm[0]!.toUpperCase()}${englishTerm.slice(1)} URL or #42`
          : `${term}网址或 #42`,
      );
      const cancel = mocks.prompt.mock.lastCall?.[2][0];
      cancel.onPress?.();
      expect(mocks.link).not.toHaveBeenCalled();
      submit("Open {0} $&");
      expect(mocks.alert.mock.lastCall?.slice(0, 2)).toEqual([
        locale === "en" ? `Couldn't link this ${englishTerm}` : `无法关联此${term}`,
        locale === "en"
          ? `Use a ${englishTerm} URL, 123, or #123.`
          : `请输入${term}网址、123 或 #123。`,
      ]);
      const result = Promise.resolve(AsyncResult.success(undefined));
      mocks.link.mockReturnValueOnce(result);
      submit("  #42  ");
      await result;
      expect(mocks.link).toHaveBeenCalledExactlyOnceWith({
        environmentId: "environment",
        input: {
          threadId: "thread",
          host: link.host,
          repository: "settings/open",
          number: 42,
          url: link.url,
          source: "manual",
        },
      });
      using _noUrl = vi
        .spyOn(sourceControlClients.get(kind), "changeRequestUrl")
        .mockReturnValue(null);
      actions.promptLink();
      submit("42");
      expect(mocks.alert.mock.lastCall?.[1]).toBe(
        locale === "en"
          ? `Paste a full URL; this project's host has no known ${englishTerm} URL.`
          : `请粘贴完整网址；此项目的托管平台没有已知的${term}网址。`,
      );
      useLinkedPullRequestActions({ ...input, project: null }).promptLink();
      submit("123");
      expect(mocks.alert.mock.lastCall?.[1]).toBe(
        locale === "en"
          ? "Paste the full pull request URL; this thread has no repository to resolve the number against."
          : "请粘贴完整的拉取请求网址；此对话没有可用于解析编号的仓库。",
      );
    }
  },
);

it.each(["en", "zh-CN"] as const)(
  "preserves PR/MR mutation diagnostics, URLs and watch actions in %s",
  async (locale) => {
    for (const kind of ["github", "gitlab"] as const) {
      setup(locale);
      const { input, link, term } = fixture(kind);
      const actions = useLinkedPullRequestActions(input);
      for (const [action, command] of [
        ["link", mocks.link],
        ["unlink", mocks.unlink],
        ["watch", mocks.watch],
      ] as const) {
        const failed = Promise.resolve(AsyncResult.failure(Cause.fail(new Error("Settings"))));
        command.mockReturnValueOnce(failed);
        if (action === "link") {
          actions.promptLink();
          submit(link.url);
        } else actions.onMenuAction(link, action);
        await failed;
        expect(mocks.alert.mock.lastCall?.[1]).toBe("Settings");
        if (action !== "watch")
          expect(mocks.alert.mock.lastCall?.[0]).toBe(
            locale === "en"
              ? `Couldn't ${action} this ${actions.terminology.singular}`
              : action === "link"
                ? `无法关联此${term}`
                : `无法取消关联此${term}`,
          );
      }
      expect(mocks.watch.mock.lastCall?.[0]).toEqual({
        environmentId: "environment",
        input: {
          threadId: "thread",
          host: link.host,
          repository: link.repository,
          number: 42,
          watching: true,
        },
      });
      const interrupted = Promise.resolve(AsyncResult.failure(Cause.interrupt(1)));
      mocks.watch.mockReturnValueOnce(interrupted);
      const previousAlerts = mocks.alert.mock.calls.length;
      actions.onMenuAction(link, "watch");
      await interrupted;
      expect(mocks.alert).toHaveBeenCalledTimes(previousAlerts);
      const fallback = Promise.resolve(AsyncResult.failure(Cause.fail("not an Error")));
      mocks.watch.mockReturnValueOnce(fallback);
      actions.onMenuAction(link, "watch");
      await fallback;
      expect(mocks.alert.mock.lastCall?.[1]).toBe(locale === "en" ? "Try again." : "请重试。");
      actions.onMenuAction(link, "copy");
      expect(mocks.copy).toHaveBeenCalledExactlyOnceWith(link.url);
      const opened = Promise.resolve(false);
      mocks.openUrl.mockReturnValueOnce(opened);
      actions.onMenuAction(link, "browser");
      await opened;
      expect(mocks.openUrl).toHaveBeenCalledExactlyOnceWith(link.url, "pull-request");
      expect(mocks.alert.mock.lastCall?.slice(0, 2)).toEqual([
        locale === "en"
          ? `Unable to open ${actions.terminology.shortLabel}`
          : `无法打开 ${actions.terminology.shortLabel}`,
        locale === "en"
          ? `The ${actions.terminology.singular} could not be opened.`
          : `无法打开${term}。`,
      ]);
      mocks.canOperate = false;
      const readOnly = useLinkedPullRequestActions(input);
      expect(readOnly.canLink).toBe(false);
      expect(readOnly.menuActions(link).map((action) => action.id)).toEqual(["copy", "browser"]);
    }
  },
);

it.each(["en", "zh-CN"] as const)(
  "keeps thread-badge list versus external navigation in %s and localizes both PR/MR open failures",
  async (locale) => {
    for (const kind of ["github", "gitlab"] as const) {
      setup(locale);
      const { thread, link, term } = fixture(kind);
      const changeRequest = sourceControlClients.get(kind).changeRequest;
      const pr: ThreadPrPresentation = {
        kind: "pull-request",
        others: 0,
        url: link.url,
        changeRequest,
        number: 42,
        state: "open",
        isDraft: false,
        updatedAt: null,
        label: "42",
        accessibilityLabel: "Open",
        textClassName: "text-foreground",
      };
      const open = useOpenThreadPullRequests();
      open(thread, { ...pr, others: 2 });
      expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith("ThreadPullRequests", {
        environmentId: "environment",
        threadId: "thread",
      });
      expect(mocks.openPr).not.toHaveBeenCalled();
      const failed = Promise.resolve(false);
      mocks.openPr.mockReturnValueOnce(failed);
      open(thread, pr);
      await failed;
      expect(mocks.openPr).toHaveBeenCalledExactlyOnceWith(link.url, {
        environmentId: "environment",
        projectId: "project",
      });
      expect(mocks.alert.mock.lastCall?.slice(0, 2)).toEqual([
        locale === "en"
          ? `Unable to open ${changeRequest.shortLabel}`
          : `无法打开 ${changeRequest.shortLabel}`,
        locale === "en"
          ? `The ${changeRequest.singular} could not be opened.`
          : `无法打开${term}。`,
      ]);
    }
  },
);
