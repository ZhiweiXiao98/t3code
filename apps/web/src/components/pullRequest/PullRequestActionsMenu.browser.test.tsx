import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { readableFailure } from "./pullRequestDetail.logic";
import "~/index.css";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import { Cause } from "effect";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

const mocks = vi.hoisted(() => ({
  update:
    vi.fn<(input: unknown) => Promise<{ _tag: "Success" } | { _tag: "Failure"; cause: unknown }>>(),
  notify: vi.fn(),
  saved: vi.fn(),
  locale: "en" as "en" | "zh-CN",
}));
vi.mock(
  import("~/state/pullRequests"),
  () => ({ pullRequestEnvironment: { update: {} } }) as never,
);
vi.mock(
  import("~/state/use-atom-command"),
  () => ({ useAtomCommand: () => mocks.update }) as never,
);

vi.mock(import("../ui/toast"), () => ({ toastManager: { add: mocks.notify } }) as never);
vi.mock(import("~/state/server"), async () => {
  const { Atom } = await import("effect/reactivity");
  return { primaryServerKeybindingsAtom: Atom.make([]) } as never;
});
vi.mock(import("./PullRequestThreadLinks"), () => ({ PullRequestThreadLinks: () => null }));
vi.mock(
  import("./PullRequestDetailActions"),
  () => ({ ActOnEnvironmentPicker: () => null }) as never,
);

import { act, render } from "../../../test/render";
import { PullRequestActionsMenu } from "./PullRequestActionsMenu";

const reference = { projectId: ProjectId.make("project"), repository: "owner/repo", number: 7 };
const environmentId = EnvironmentId.make("environment");

type Detail = Parameters<typeof PullRequestActionsMenu>[0]["detail"];

const openDetail: Detail = {
  url: "https://github.com/owner/repo/pull/7",
  state: "open",
  isDraft: false,
  headBranch: "feature",
  maintainerCanModify: true,
  observedAt: 1,
  capabilities: {
    diff: true,
    comment: true,
    actions: [],
    mergeMethods: [],
    search: true,
    review: { inlineComment: true, reply: true, resolve: true, verdicts: [] },
    reviewers: { request: true, listCandidates: true },
    edit: { changeRequest: true, comment: true, maintainerEdits: true },
  },
  viewerPermissions: {
    actions: [],
    comment: true,
    resolve: true,
    verdicts: [],
    requestReviewers: true,
    maintainerEdits: true,
  },
};

function setup() {
  mocks.update.mockReset().mockResolvedValue({ _tag: "Success" });
  mocks.notify.mockReset();
  mocks.saved.mockReset();
  mocks.locale = "en";
  return (detail: Detail = openDetail) => (
    <PullRequestActionsMenu
      environmentId={environmentId}
      reference={reference}
      pullRequestKey="owner/repo/7"
      detail={detail}
      terminology={sourceControlClients.get("github").changeRequest}
      linkThreadRef={null}
      onThreadPickerOpenChange={() => {}}
      refreshing={false}
      refreshFromHost={async () => {}}
      handoff={null}
      attachesToComposer={false}
      askAboutPullRequest={() => {}}
      explainPullRequest={() => {}}
      canFixFindings={false}
      startFixFindings={() => {}}
      handoffLabels={{ fixFindings: "Fix review findings" }}
      canWriteGuide={false}
      guideRunning={false}
      guideWritten={false}
      writeGuide={() => {}}
      pickableEnvironments={[]}
      actingEnvironmentId={environmentId}
      onActingEnvironmentChange={() => {}}
      can={() => false}
      autoMergeArmed={false}
      showsDraftToggle={false}
      showsMergeNow={false}
      showsAutoMerge={false}
      showsMergeMethods={false}
      allowedMergeMethods={[]}
      selectedMergeMethod="squash"
      onSelectMergeMethod={() => {}}
      showsDeleteBranch={false}
      environmentConnected={true}
      canWriteSourceControl={true}
      onMaintainerEditsSaved={mocks.saved}
      confirmDeleteBranch={async () => {}}
      pendingAction={null}
      perform={async () => true}
      openOnHostText="Open on GitHub"
      copyReference={() => {}}
    />
  );
}

it("saves maintainer edits, locks while saving, and restores the saved value when a save fails", async () => {
  const control = setup();
  await using screen = await render(control());
  await screen.getByRole("button", { name: "More pull request actions" }).click();
  const checkbox = page.getByRole("menuitemcheckbox", { name: "Allow edits from maintainers" });
  await expect.element(checkbox).toBeChecked();
  await checkbox.click();
  await expect.element(page.getByRole("status")).not.toBeInTheDocument();
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
    environmentId,
    input: { ...reference, maintainerCanModify: false },
  });

  let settle!: (value: { _tag: "Failure"; cause: unknown }) => void;
  mocks.update.mockReturnValueOnce(
    new Promise((resolve) => {
      settle = resolve;
    }),
  );
  await checkbox.click();
  await expect.element(checkbox).toBeChecked();
  await expect.element(checkbox).toBeDisabled();
  await expect.element(page.getByRole("status")).toHaveTextContent("Saving…");
  settle({
    _tag: "Failure",
    cause: Cause.fail(new Error("Resource not accessible by integration")),
  });
  await expect.element(checkbox).not.toBeChecked();
  expect(mocks.notify).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      type: "error",
      title: "Could not save maintainer access",
      description: "Resource not accessible by integration",
    }),
  );
});

it("keeps a saved choice through a stale refresh, then follows the host", async () => {
  const control = setup();
  await using screen = await render(control());
  await screen.getByRole("button", { name: "More pull request actions" }).click();
  const checkbox = page.getByRole("menuitemcheckbox", { name: "Allow edits from maintainers" });
  let settle!: (value: { _tag: "Success" }) => void;
  mocks.update.mockReturnValueOnce(
    new Promise((resolve) => {
      settle = resolve;
    }),
  );
  await checkbox.click();
  await screen.rerender(control({ ...openDetail, observedAt: 2 }));
  settle({ _tag: "Success" });
  await expect.element(page.getByRole("status")).not.toBeInTheDocument();
  await screen.rerender(control({ ...openDetail, observedAt: 2 }));
  await expect.element(checkbox).not.toBeChecked();
  await screen.rerender(control({ ...openDetail, maintainerCanModify: false, observedAt: 3 }));
  await expect.element(checkbox).not.toBeChecked();
  await screen.rerender(control({ ...openDetail, maintainerCanModify: true, observedAt: 4 }));
  await expect.element(checkbox).toBeChecked();
});

it("follows the host's first reading after a save, even when it matches the old value", async () => {
  const control = setup();
  await using screen = await render(control());
  await screen.getByRole("button", { name: "More pull request actions" }).click();
  const checkbox = page.getByRole("menuitemcheckbox", { name: "Allow edits from maintainers" });
  await checkbox.click();
  await expect.element(page.getByRole("status")).not.toBeInTheDocument();
  await expect.element(checkbox).not.toBeChecked();
  await screen.rerender(control({ ...openDetail, observedAt: 2 }));
  await expect.element(checkbox).toBeChecked();
});

it.each<[string, Detail]>([
  ["closed", { ...openDetail, state: "closed" }],
  [
    "not authored by the viewer",
    {
      ...openDetail,
      viewerPermissions: { ...openDetail.viewerPermissions, maintainerEdits: false },
    },
  ],
  [
    "on a host without maintainer edits",
    {
      ...openDetail,
      capabilities: { ...openDetail.capabilities, edit: { changeRequest: true, comment: true } },
    },
  ],
])("hides maintainer edits on a pull request that is %s", async (_, detail) => {
  const control = setup();
  await using screen = await render(control(detail));
  await screen.getByRole("button", { name: "More pull request actions" }).click();
  await expect.element(page.getByRole("menuitem", { name: "Open on GitHub" })).toBeVisible();
  expect(document.querySelector('[role="menuitemcheckbox"]')).toBeNull();
});

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
it.each([
  ["owned", null],
  ["raw", new Error("Could not save maintainer access")],
  ["empty", new Error("")],
  ["whitespace", new Error("  \n ")],
  ["interrupted", undefined],
] as const)("uses settlement locale for maintainer access failure: %s", async (kind, failure) => {
  const control = setup();
  const surface = (locale: "en" | "zh-CN") => {
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
        {control()}
      </WebI18nContext>
    );
  };
  type Result = { _tag: "Failure"; cause: unknown };
  let finish = (_result: Result) => {};
  mocks.update.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await using screen = await render(surface("en"));
  await using _settle = {
    async [Symbol.asyncDispose]() {
      await act(async () => {
        finish({ _tag: "Failure", cause: Cause.interrupt() });
        await Promise.resolve();
      });
    },
  };
  await screen.getByRole("button", { name: "More pull request actions", exact: true }).click();
  const checkbox = page.getByRole("menuitemcheckbox", {
    name: "Allow edits from maintainers",
    exact: true,
  });
  await expect.element(checkbox).toBeChecked();
  await checkbox.click();
  await expect.element(checkbox).not.toBeChecked();
  await expect.element(checkbox).toBeDisabled();
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
    environmentId,
    input: { ...reference, maintainerCanModify: false },
  });
  expect(mocks.notify).not.toHaveBeenCalled();
  expect(mocks.saved).not.toHaveBeenCalled();
  await screen.rerender(surface("zh-CN"));
  const result = {
    _tag: "Failure" as const,
    cause: kind === "interrupted" ? Cause.interrupt() : Cause.fail(failure),
  };
  await act(async () => {
    finish(result);
    await Promise.resolve();
  });
  expect(mocks.notify).toHaveBeenCalledExactlyOnceWith({
    type: "error",
    title: "无法保存维护者权限",
    description:
      kind === "raw"
        ? "Could not save maintainer access"
        : kind === "interrupted"
          ? readableFailure(squashAtomCommandFailure(result), "请重试。")
          : "请重试。",
  });
  const restored = page.getByRole("menuitemcheckbox", { name: "允许维护者编辑", exact: true });
  await expect.element(restored).toBeChecked();
  await expect.element(restored).toBeEnabled();
  await expect.element(page.getByRole("status")).not.toBeInTheDocument();
  expect(mocks.saved).not.toHaveBeenCalled();
  await screen.rerender(surface("en"));
  expect(mocks.notify).toHaveBeenCalledTimes(1);
  expect(mocks.update).toHaveBeenCalledTimes(1);
});
