import {
  EnvironmentId,
  ThreadId,
  ProjectId,
  ServerConfig,
  type PullRequestRef,
} from "@t3tools/contracts";
import { Schema } from "effect";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { act, render } from "../../../test/render";
import { makeThreadFixture } from "../../test-fixtures";
import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";
import { Menu, MenuTrigger, MenuPopup } from "../ui/menu";
import { PullRequestThreadLinks } from "./PullRequestThreadLinks";
const mocks = vi.hoisted(() => ({
  change: vi.fn(),
  toast: vi.fn(),
  picker: vi.fn(),
  linked: false,
  supported: true,
  locale: "en" as "en" | "zh-CN",
}));
vi.mock("~/hooks/usePullRequestLinking", () => ({
  usePullRequestLinking: () => ({
    mode: "multiple",
    isLinked: () => mocks.linked,
    canLink: () => true,
    changeLink: mocks.change,
  }),
}));
vi.mock(import("~/state/entities"), async (original) => ({
  ...(await original()),
  useServerConfigs: () => (mocks.supported ? new Map([[target.environmentId, config]]) : new Map()),
  useThreadShell: () => shell,
  useAnyEnvironmentHiding: () => false,
  useEnvironmentThreadRefs: () => [],
}));
vi.mock(import("~/state/threads"), async (original) => {
  const actual = await original();
  const { Atom } = await import("effect/reactivity");
  return {
    ...actual,
    environmentThreadShells: {
      ...actual.environmentThreadShells,
      hiddenThreadKeysAtom: Atom.make(new Set<string>()),
    },
  };
});
vi.mock("../ui/toast", async (original) => ({
  ...(await original<typeof import("../ui/toast")>()),
  toastManager: { add: mocks.toast },
}));
vi.mock("~/i18n/readWebI18n", () => ({
  readWebI18n: () => {
    const locale = mocks.locale;
    return {
      locale,
      t: (
        key: Parameters<typeof translateWebMessage>[1],
        values?: Parameters<typeof translateWebMessage>[2],
      ) => translateWebMessage(locale, key, values),
    };
  },
}));
const target = {
  environmentId: EnvironmentId.make("link-env"),
  threadId: ThreadId.make("literal-thread"),
};
const shell = makeThreadFixture({ id: target.threadId, environmentId: target.environmentId });
const reference: PullRequestRef = {
  projectId: ProjectId.make("link-project"),
  repository: "owner/repo",
  number: 42,
};
const config = Schema.decodeSync(ServerConfig)({
  environment: {
    environmentId: target.environmentId,
    label: "Fixture",
    platform: { os: "linux", arch: "x64" },
    serverVersion: "0.0.0",
    capabilities: { repositoryIdentity: true },
  },
  auth: {
    policy: "loopback-browser",
    bootstrapMethods: [],
    sessionMethods: [],
    sessionCookieName: "test",
  },
  cwd: "/test",
  keybindingsConfigPath: "/test/keybindings.json",
  keybindings: [],
  issues: [],
  providers: [],
  availableEditors: [],
  observability: {
    logsDirectoryPath: "/test/logs",
    localTracingEnabled: false,
    otlpTracesEnabled: false,
    otlpMetricsEnabled: false,
  },
  settings: {},
});
function setup() {
  mocks.change.mockReset();
  mocks.toast.mockClear();
  mocks.picker.mockClear();
  mocks.linked = false;
  mocks.supported = true;
}
function surface(locale: "en" | "zh-CN", url: string) {
  mocks.locale = locale;
  return (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => {},
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <Menu>
        <MenuTrigger>Thread actions</MenuTrigger>
        <MenuPopup keepMounted>
          <PullRequestThreadLinks
            environmentId={target.environmentId}
            reference={reference}
            url={url}
            threadRef={target}
            display="menu-item"
            onPickerOpenChange={mocks.picker}
          />
        </MenuPopup>
      </Menu>
    </WebI18nContext>
  );
}
it.each([
  [
    "github link owned",
    false,
    "https://github.com/owner/repo/pull/42",
    null,
    "null",
    "无法关联拉取请求",
  ],
  [
    "github unlink",
    true,
    "https://github.com/owner/repo/pull/42",
    null,
    "null",
    "无法取消关联拉取请求",
  ],
  [
    "gitlab link",
    false,
    "https://gitlab.com/owner/repo/-/merge_requests/42",
    null,
    "null",
    "无法关联合并请求",
  ],
  [
    "raw",
    false,
    "https://github.com/owner/repo/pull/42",
    new Error("Literal $& {host}"),
    "Literal $& {host}",
    "无法关联拉取请求",
  ],
  ["empty", false, "https://github.com/owner/repo/pull/42", new Error(""), "", "无法关联拉取请求"],
] as const)(
  "uses settlement locale for thread linking failure: %s",
  async (_kind, linked, url, error, description, title) => {
    setup();
    mocks.linked = linked;
    let reject = (_error: unknown) => {};
    const pending = new Promise<void>((_yes, no) => {
      reject = no;
    });
    void pending.catch(() => {});
    mocks.change.mockReturnValueOnce(pending);
    await using screen = await render(surface("en", url));
    await using _settle = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          reject(new Error("Fixture disposed"));
          await Promise.resolve();
        });
      },
    };
    await screen.getByRole("button", { name: "Thread actions", exact: true }).click();
    const label = linked ? "Unlink from this thread" : "Link to this thread";
    await page.getByRole("menuitem", { name: label, exact: true }).click();
    expect(mocks.change).toHaveBeenCalledExactlyOnceWith(target, url, !linked);
    // Selection closes the menu; reopen the retained component to inspect the real pending gate.
    await screen.getByRole("button", { name: "Thread actions", exact: true }).click();
    const item = page.getByRole("menuitem", { name: label, exact: true });
    await expect.element(item).toBeVisible();
    await expect.element(item).toHaveAttribute("aria-disabled", "true");
    await act(async () => {
      item.element().dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    });
    expect(mocks.change).toHaveBeenCalledTimes(1);
    await screen.rerender(surface("zh-CN", url));
    expect(mocks.toast).not.toHaveBeenCalled();
    await act(async () => {
      reject(error);
      await Promise.resolve();
    });
    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({ type: "error", title, description });
    expect(mocks.picker).not.toHaveBeenCalled();
    await expect
      .element(
        page.getByRole("menuitem", {
          name: linked ? "取消与此任务关联" : "关联到此任务",
          exact: true,
        }),
      )
      .not.toHaveAttribute("aria-disabled", "true");
    await screen.rerender(surface("en", url));
    expect(mocks.change).toHaveBeenCalledTimes(1);
    expect(mocks.toast).toHaveBeenCalledTimes(1);
  },
);
it.each(["unsupported", "unparseable"] as const)(
  "hides thread link control when %s",
  async (kind) => {
    setup();
    mocks.supported = kind !== "unsupported";
    await using screen = await render(
      surface(
        "en",
        kind === "unparseable" ? "not a change request" : "https://github.com/owner/repo/pull/42",
      ),
    );
    await screen.getByRole("button", { name: "Thread actions", exact: true }).click();
    await expect.element(page.getByRole("menu")).toBeVisible();
    await expect.element(page.getByRole("menuitem")).not.toBeInTheDocument();
    expect(mocks.change).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.picker).not.toHaveBeenCalled();
  },
);
