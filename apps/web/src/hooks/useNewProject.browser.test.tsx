import { useState } from "react";
import {
  EnvironmentId,
  ProjectId,
  SourceControlProviderKind,
  type ProjectCreateNewResult,
  type SourceControlPublishRepositoryResult,
} from "@t3tools/contracts";
import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import { act, render } from "../../test/render";
import { WebI18nContext } from "../i18n/WebI18nContext";
import { translateWebMessage } from "../i18n/messages";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { ProjectAppearanceTimeoutError } from "../i18n/queryFailureMessages";
import type { NewProjectPublishTarget } from "@t3tools/client-runtime/operations/projects";
import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import { useNewProject } from "./useNewProject";

const fixture = vi.hoisted(() => ({
  locale: "en" as "en" | "zh-CN",
  create: vi.fn(),
  publish: vi.fn(),
  wait: vi.fn(),
  thread: vi.fn(),
  toast: vi.fn(),
  suggest: vi.fn(),
}));
vi.mock("../state/use-atom-command", async (original) => {
  const actual = await original<typeof import("../state/use-atom-command")>();
  const { projectEnvironment } = await import("../state/projects");
  const { sourceControlEnvironment } = await import("../state/sourceControl");
  return {
    ...actual,
    useAtomCommand: (command: unknown) => {
      if (command === projectEnvironment.createNew) return fixture.create;
      if (command === sourceControlEnvironment.publishRepository) return fixture.publish;
      throw new Error("Unexpected command");
    },
  };
});
vi.mock("../state/entities", async (original) => ({
  ...(await original<typeof import("../state/entities")>()),
  waitForProject: fixture.wait,
}));
vi.mock("./useHandleNewThread", async (original) => ({
  ...(await original<typeof import("./useHandleNewThread")>()),
  useNewThreadHandler: () => fixture.thread,
}));
vi.mock("../components/ui/toast", async (original) => {
  const actual = await original<typeof import("../components/ui/toast")>();
  return { ...actual, toastManager: { ...actual.toastManager, add: fixture.toast } };
});
vi.mock("../i18n/readWebI18n", async (original) => ({
  ...(await original<typeof import("../i18n/readWebI18n")>()),
  readWebI18n: () => {
    const locale = fixture.locale;
    return {
      locale,
      t: (
        key: Parameters<typeof translateWebMessage>[1],
        values?: Parameters<typeof translateWebMessage>[2],
      ) => translateWebMessage(locale, key, values),
    };
  },
}));
const environmentId = EnvironmentId.make("new-project-test");
function Probe({ publishTo = null }: { publishTo?: NewProjectPublishTarget | null }) {
  const create = useNewProject();
  const [status, setStatus] = useState("idle");
  return (
    <>
      <button
        disabled={status === "pending"}
        onClick={async () => {
          setStatus("pending");
          const result = await create({
            environmentId,
            name: "Literal $& {project}",
            publishTo,
          });
          setStatus(String(result));
        }}
      >
        Create project
      </button>
      <output>{status}</output>
    </>
  );
}
function view(publishTo: NewProjectPublishTarget | null = null) {
  const locale = fixture.locale;
  return (
    <WebI18nContext.Provider
      value={{
        locale: fixture.locale,
        appLocale: fixture.locale,
        setAppLocale: () => {},
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <Probe publishTo={publishTo} />
    </WebI18nContext.Provider>
  );
}
it.each(["owned", "raw", "collision", "empty", "whitespace", "interrupted"] as const)(
  "uses settlement locale for initial project %s failure",
  async (kind) => {
    vi.clearAllMocks();
    fixture.locale = "en";
    let finish!: (result: AtomCommandResult<never, unknown>) => void;
    fixture.create.mockReset().mockReturnValue(
      new Promise<AtomCommandResult<never, unknown>>((resolve) => {
        finish = resolve;
      }),
    );
    await using screen = await render(view());
    await using _settle = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          finish(AsyncResult.failure(Cause.interrupt()));
          await Promise.resolve();
        });
      },
    };
    await screen.getByRole("button", { name: "Create project" }).click();
    await expect.element(screen.getByRole("button", { name: "Create project" })).toBeDisabled();
    expect(fixture.create).toHaveBeenCalledExactlyOnceWith({
      environmentId,
      input: { name: "Literal $& {project}" },
    });
    fixture.locale = "zh-CN";
    await screen.rerender(view());
    const raw =
      kind === "raw"
        ? "Literal $& {private}"
        : kind === "collision"
          ? translateWebMessage("en", "common.error")
          : kind === "whitespace"
            ? " \n "
            : "";
    await act(async () => {
      finish(
        AsyncResult.failure(
          kind === "interrupted"
            ? Cause.interrupt()
            : Cause.fail(kind === "owned" ? null : new Error(raw)),
        ),
      );
    });
    await expect.element(screen.getByRole("button", { name: "Create project" })).toBeEnabled();
    await expect.poll(() => screen.container.textContent).toContain("false");
    if (kind === "interrupted") expect(fixture.toast).not.toHaveBeenCalled();
    else {
      expect(fixture.toast).toHaveBeenCalledTimes(1);
      expect(fixture.toast.mock.calls[0]?.[0]).toMatchObject({
        title: translateWebMessage("zh-CN", "newProject.createError"),
        description:
          kind === "raw" || kind === "collision"
            ? raw
            : translateWebMessage("zh-CN", "common.error"),
      });
    }
    fixture.locale = "en";
    await screen.rerender(view());
    expect(fixture.create).toHaveBeenCalledTimes(1);
    expect(fixture.toast).toHaveBeenCalledTimes(kind === "interrupted" ? 0 : 1);
    expect(fixture.publish).not.toHaveBeenCalled();
    expect(fixture.wait).not.toHaveBeenCalled();
    expect(fixture.thread).not.toHaveBeenCalled();
  },
);

const createdProject: EnvironmentProject = {
  environmentId,
  id: ProjectId.make("created-project"),
  title: "Literal $& {project}",
  workspaceRoot: "/literal/{project}",
  repositoryIdentity: null,
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};
it.each([
  { stage: "wait", kind: "owned" },
  { stage: "wait", kind: "raw" },
  { stage: "wait", kind: "empty" },
  { stage: "wait", kind: "whitespace" },
  { stage: "wait", kind: "typed" },
  { stage: "thread", kind: "owned" },
  { stage: "thread", kind: "raw" },
  { stage: "thread", kind: "empty" },
  { stage: "thread", kind: "whitespace" },
] as const)(
  "uses settlement locale for project open $stage $kind failure",
  async ({ stage, kind }) => {
    vi.clearAllMocks();
    fixture.locale = "en";
    fixture.create.mockReset().mockResolvedValue(
      AsyncResult.success({
        projectId: createdProject.id,
        workspaceRoot: createdProject.workspaceRoot,
      }),
    );
    let reject!: (error: unknown) => void;
    const pending = new Promise<never>((_resolve, fail) => {
      reject = fail;
    });
    void pending.catch(() => {});
    fixture.wait
      .mockReset()
      .mockReturnValue(stage === "wait" ? pending : Promise.resolve(createdProject));
    fixture.thread
      .mockReset()
      .mockReturnValue(stage === "thread" ? pending : Promise.resolve(null));
    await using screen = await render(view());
    await using _settle = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          reject(null);
          await Promise.resolve();
        });
      },
    };
    await screen.getByRole("button", { name: "Create project" }).click();
    await expect
      .poll(() => (stage === "wait" ? fixture.wait : fixture.thread).mock.calls.length)
      .toBe(1);
    await expect.element(screen.getByRole("button", { name: "Create project" })).toBeDisabled();
    expect(fixture.toast).toHaveBeenCalledTimes(1);
    const firstToast = fixture.toast.mock.calls[0]?.[0];
    fixture.locale = "zh-CN";
    await screen.rerender(view());
    const raw =
      kind === "raw"
        ? translateWebMessage("en", "common.error")
        : kind === "whitespace"
          ? " \n "
          : "";
    await act(async () => {
      reject(
        kind === "owned"
          ? null
          : kind === "typed"
            ? new ProjectAppearanceTimeoutError({})
            : new Error(raw),
      );
    });
    await expect.poll(() => screen.container.textContent).toContain("true");
    const detail =
      kind === "typed"
        ? translateWebMessage("zh-CN", "audit11.projectTimeout")
        : kind === "raw"
          ? raw
          : translateWebMessage("zh-CN", "common.error");
    expect(fixture.toast).toHaveBeenCalledTimes(2);
    expect(fixture.toast.mock.calls[1]?.[0]).toMatchObject({
      title: translateWebMessage("zh-CN", "newProject.openError"),
      description:
        stage === "wait"
          ? translateWebMessage("zh-CN", "newProject.openErrorDescription", { error: detail })
          : detail,
    });
    expect(fixture.toast.mock.calls[0]?.[0]).toEqual(firstToast);
    fixture.locale = "en";
    await screen.rerender(view());
    expect(fixture.create).toHaveBeenCalledExactlyOnceWith({
      environmentId,
      input: { name: "Literal $& {project}" },
    });
    expect(fixture.wait).toHaveBeenCalledExactlyOnceWith(
      scopeProjectRef(environmentId, createdProject.id),
    );
    if (stage === "wait") expect(fixture.thread).not.toHaveBeenCalled();
    else
      expect(fixture.thread).toHaveBeenCalledExactlyOnceWith(
        scopeProjectRef(environmentId, createdProject.id),
      );
    expect(fixture.publish).not.toHaveBeenCalled();
    expect(fixture.toast).toHaveBeenCalledTimes(2);
  },
);

vi.mock("../components/sourceControlAppAccessToast", async (original) => ({
  ...(await original<typeof import("../components/sourceControlAppAccessToast")>()),
  suggestAppAccessForRemote: fixture.suggest,
}));
it.each(["owned", "raw", "empty", "whitespace", "interrupted"] as const)(
  "uses settlement locale for project publish %s failure",
  async (kind) => {
    vi.clearAllMocks();
    fixture.locale = "en";
    const definition = sourceControlClients.definitions.find((item) => item.kind === "github");
    if (!definition) throw new Error("Missing GitHub definition");
    const publishTo: NewProjectPublishTarget = { definition, owner: "fake-owner" };
    fixture.create.mockReset().mockResolvedValue(
      AsyncResult.success({
        projectId: createdProject.id,
        workspaceRoot: createdProject.workspaceRoot,
      }),
    );
    fixture.wait.mockReset().mockResolvedValue(createdProject);
    fixture.thread.mockReset().mockResolvedValue(null);
    let finish!: (result: AtomCommandResult<never, unknown>) => void;
    fixture.publish.mockReset().mockReturnValue(
      new Promise<AtomCommandResult<never, unknown>>((resolve) => {
        finish = resolve;
      }),
    );
    await using screen = await render(view(publishTo));
    await using _settle = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          finish(AsyncResult.failure(Cause.interrupt()));
          await Promise.resolve();
        });
      },
    };
    await screen.getByRole("button", { name: "Create project" }).click();
    await expect.poll(() => screen.container.textContent).toContain("true");
    expect(fixture.toast).toHaveBeenCalledTimes(1);
    expect(fixture.publish).toHaveBeenCalledExactlyOnceWith({
      environmentId,
      input: {
        cwd: createdProject.workspaceRoot,
        provider: definition.kind,
        repository: "fake-owner/{project}",
        visibility: "private",
      },
    });
    fixture.locale = "zh-CN";
    await screen.rerender(view(publishTo));
    const raw =
      kind === "raw"
        ? translateWebMessage("en", "common.error")
        : kind === "whitespace"
          ? " \n "
          : "";
    await act(async () => {
      finish(
        AsyncResult.failure(
          kind === "interrupted"
            ? Cause.interrupt()
            : Cause.fail(kind === "owned" ? null : new Error(raw)),
        ),
      );
    });
    expect(fixture.toast).toHaveBeenCalledTimes(kind === "interrupted" ? 1 : 2);
    if (kind !== "interrupted")
      expect(fixture.toast.mock.calls[1]?.[0]).toMatchObject({
        title: translateWebMessage("zh-CN", "newProject.repositoryError", {
          provider: definition.label,
        }),
        description: translateWebMessage("zh-CN", "newProject.gitHubErrorDescription", {
          error: kind === "raw" ? raw : translateWebMessage("zh-CN", "common.error"),
        }),
      });
    fixture.locale = "en";
    await screen.rerender(view(publishTo));
    expect(fixture.toast).toHaveBeenCalledTimes(kind === "interrupted" ? 1 : 2);
    expect(fixture.create).toHaveBeenCalledExactlyOnceWith({
      environmentId,
      input: { name: "Literal $& {project}" },
    });
    expect(fixture.publish).toHaveBeenCalledTimes(1);
    expect(fixture.wait).toHaveBeenCalledExactlyOnceWith(
      scopeProjectRef(environmentId, createdProject.id),
    );
    expect(fixture.thread).toHaveBeenCalledExactlyOnceWith(
      scopeProjectRef(environmentId, createdProject.id),
    );
    expect(fixture.suggest).not.toHaveBeenCalled();
  },
);

it.each(["plain", "commit warning"] as const)(
  "uses settlement locale for project creation %s success",
  async (kind) => {
    vi.clearAllMocks();
    fixture.locale = "en";
    let finish!: (result: AtomCommandResult<ProjectCreateNewResult, unknown>) => void;
    fixture.create.mockReset().mockReturnValue(
      new Promise<AtomCommandResult<ProjectCreateNewResult, unknown>>((resolve) => {
        finish = resolve;
      }),
    );
    fixture.wait.mockReset().mockResolvedValue(createdProject);
    fixture.thread.mockReset().mockResolvedValue(null);
    await using screen = await render(view());
    await using _settle = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          finish(AsyncResult.failure(Cause.interrupt()));
          await Promise.resolve();
        });
      },
    };
    await screen.getByRole("button", { name: "Create project" }).click();
    await expect.element(screen.getByRole("button", { name: "Create project" })).toBeDisabled();
    expect(fixture.toast).not.toHaveBeenCalled();
    expect(fixture.wait).not.toHaveBeenCalled();
    expect(fixture.thread).not.toHaveBeenCalled();
    fixture.locale = "zh-CN";
    await screen.rerender(view());
    const commitError = "Literal $& {commit} error";
    await act(async () => {
      finish(
        AsyncResult.success({
          projectId: createdProject.id,
          workspaceRoot: createdProject.workspaceRoot,
          ...(kind === "plain" ? {} : { commitError }),
        }),
      );
    });
    await expect.poll(() => screen.container.textContent).toContain("true");
    expect(fixture.toast).toHaveBeenCalledTimes(1);
    expect(fixture.toast.mock.calls[0]?.[0]).toMatchObject({
      type: kind === "plain" ? "success" : "warning",
      title: translateWebMessage(
        "zh-CN",
        kind === "plain" ? "newProject.created" : "newProject.createdWithoutCommit",
        { name: "Literal $& {project}" },
      ),
      description:
        kind === "plain"
          ? createdProject.workspaceRoot
          : translateWebMessage("zh-CN", "newProject.commitErrorDescription", {
              error: commitError,
              path: createdProject.workspaceRoot,
            }),
    });
    fixture.locale = "en";
    await screen.rerender(view());
    expect(fixture.toast).toHaveBeenCalledTimes(1);
    expect(fixture.create).toHaveBeenCalledExactlyOnceWith({
      environmentId,
      input: { name: "Literal $& {project}" },
    });
    expect(fixture.wait).toHaveBeenCalledExactlyOnceWith(
      scopeProjectRef(environmentId, createdProject.id),
    );
    expect(fixture.thread).toHaveBeenCalledExactlyOnceWith(
      scopeProjectRef(environmentId, createdProject.id),
    );
    expect(fixture.publish).not.toHaveBeenCalled();
    expect(fixture.suggest).not.toHaveBeenCalled();
  },
);
it("uses settlement locale for project publish success", async () => {
  vi.clearAllMocks();
  fixture.locale = "en";
  const definition = sourceControlClients.definitions.find((item) => item.kind === "github");
  if (!definition) throw new Error("Missing GitHub definition");
  const publishTo: NewProjectPublishTarget = { definition, owner: "fake-owner" };
  fixture.create.mockReset().mockResolvedValue(
    AsyncResult.success({
      projectId: createdProject.id,
      workspaceRoot: createdProject.workspaceRoot,
    }),
  );
  fixture.wait.mockReset().mockResolvedValue(createdProject);
  fixture.thread.mockReset().mockResolvedValue(null);
  let finish!: (result: AtomCommandResult<SourceControlPublishRepositoryResult, unknown>) => void;
  fixture.publish.mockReset().mockReturnValue(
    new Promise<AtomCommandResult<SourceControlPublishRepositoryResult, unknown>>((resolve) => {
      finish = resolve;
    }),
  );
  fixture.suggest.mockReset().mockResolvedValue(undefined);
  await using screen = await render(view(publishTo));
  await using _settle = {
    async [Symbol.asyncDispose]() {
      await act(async () => {
        finish(AsyncResult.failure(Cause.interrupt()));
        await Promise.resolve();
      });
    },
  };
  await screen.getByRole("button", { name: "Create project" }).click();
  await expect.poll(() => screen.container.textContent).toContain("true");
  expect(fixture.toast).toHaveBeenCalledTimes(1);
  expect(fixture.suggest).not.toHaveBeenCalled();
  fixture.locale = "zh-CN";
  await screen.rerender(view(publishTo));
  const remoteUrl = "https://example.invalid/fake-owner/project.git";
  const nameWithOwner = "fake-owner/Literal $& {repository}";
  await act(async () => {
    finish(
      AsyncResult.success({
        repository: {
          provider: SourceControlProviderKind.make("github"),
          nameWithOwner,
          url: "https://example.invalid/repository",
          sshUrl: "git@example.invalid:fake-owner/project.git",
        },
        remoteName: "origin",
        remoteUrl,
        branch: "main",
        status: "pushed",
      }),
    );
  });
  expect(fixture.toast).toHaveBeenCalledTimes(2);
  expect(fixture.toast.mock.calls[1]?.[0]).toMatchObject({
    type: "success",
    title: translateWebMessage("zh-CN", "newProject.publishedRepository", {
      provider: definition.label,
    }),
    description: nameWithOwner,
  });
  expect(fixture.suggest).toHaveBeenCalledExactlyOnceWith(environmentId, remoteUrl);
  expect(fixture.toast.mock.invocationCallOrder[1]).toBeLessThan(
    fixture.suggest.mock.invocationCallOrder[0]!,
  );
  fixture.locale = "en";
  await screen.rerender(view(publishTo));
  expect(fixture.toast).toHaveBeenCalledTimes(2);
  expect(fixture.suggest).toHaveBeenCalledTimes(1);
  expect(fixture.create).toHaveBeenCalledExactlyOnceWith({
    environmentId,
    input: { name: "Literal $& {project}" },
  });
  expect(fixture.publish).toHaveBeenCalledExactlyOnceWith({
    environmentId,
    input: {
      cwd: createdProject.workspaceRoot,
      provider: definition.kind,
      repository: "fake-owner/{project}",
      visibility: "private",
    },
  });
  expect(fixture.wait).toHaveBeenCalledExactlyOnceWith(
    scopeProjectRef(environmentId, createdProject.id),
  );
  expect(fixture.thread).toHaveBeenCalledExactlyOnceWith(
    scopeProjectRef(environmentId, createdProject.id),
  );
});
