import { RegistryContext } from "@effect/atom-react";
import { AuthSessionState, ServerSelfUpdateError, type EnvironmentId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Schema from "effect/Schema";
import { AsyncResult, Atom } from "effect/reactivity";
import { type ReactNode, useState } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, render, type Screen } from "../../test/render";

type SessionResult = AsyncResult.AsyncResult<AuthSessionState, Error>;
const testState = vi.hoisted(() => ({
  updateServer: vi.fn(),
  toast: vi.fn(),
  clipboard: vi.fn(),
  sessionAtom: null as unknown,
  serverVersions: new Map<string, string>(),
}));

vi.mock(import("~/hooks/useCopyToClipboard"), async (original) => ({
  ...(await original()),
  useCopyToClipboard: ((options: { onCopy: (context: { command: string }) => void }) => ({
    copyToClipboard: (command: string, context: { command: string }) => {
      testState.clipboard(command);
      options.onCopy(context);
    },
    isCopied: false,
  })) as never,
}));
vi.mock(import("~/state/session"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    environmentSession: {
      ...actual.environmentSession,
      sessionStateAtom: (() => testState.sessionAtom) as never,
    },
  };
});
vi.mock(import("~/state/entities"), async (original) => ({
  ...(await original()),
  useServerConfigs: (() =>
    new Map(
      [...testState.serverVersions].map(([id, serverVersion]) => [
        id,
        { environment: { serverVersion } },
      ]),
    )) as never,
}));
vi.mock(import("~/state/use-atom-command"), async (original) => ({
  ...(await original()),
  useAtomCommand: (() => testState.updateServer) as never,
}));
vi.mock(import("./ui/toast"), async (original) => {
  const actual = await original();
  return { ...actual, toastManager: { ...actual.toastManager, add: testState.toast } };
});

import { resetConfirmDialogForTests } from "~/confirmDialog";
import { WebI18nContext, useI18n } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";
import {
  createServerUpdateFailedState,
  ServerUpdateResumeTimeoutError,
} from "@t3tools/client-runtime/state/server";
import { collectUpdateEverythingResult } from "./sidebar/updateEverything.logic";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import {
  ServerUpdateAction,
  ServerUpdatesAction,
  ServerUpdateProgress,
  useServerUpdate,
  type ServerUpdateTarget,
} from "./ServerUpdateAction";

const decodeSessionState = Schema.decodeUnknownSync(AuthSessionState);
const updateErrorCodec = Schema.toCodecJson(ServerSelfUpdateError);
const encodeUpdateError = Schema.encodeSync(updateErrorCodec);
const decodeUpdateError = Schema.decodeUnknownSync(updateErrorCodec);

const legacyAuth = {
  policy: "remote-reachable",
  bootstrapMethods: ["one-time-token"],
  sessionMethods: ["bearer-access-token"],
  sessionCookieName: "t3_session",
} as const;

const currentSession = {
  authenticated: true,
  scopes: ["environment:maintain"],
  auth: {
    ...legacyAuth,
    serverUpdateScope: "environment:maintain",
  },
} as const satisfies AuthSessionState;

const success = (method: "boot-service" | "desktop-app" = "boot-service", version = "0.0.31") =>
  AsyncResult.success({ targetVersion: version, method });

let sessionAtom: Atom.Writable<SessionResult>;

function setSession(session: SessionResult) {
  appAtomRegistry.set(sessionAtom, session);
}

function setup(): Disposable {
  testState.updateServer.mockReset();
  testState.toast.mockReset();
  testState.clipboard.mockReset();
  testState.serverVersions.clear();
  sessionAtom = Atom.make<SessionResult>(AsyncResult.success(currentSession));
  testState.sessionAtom = sessionAtom;
  resetConfirmDialogForTests();
  return { [Symbol.dispose]: resetConfirmDialogForTests };
}

function renderUpdate(element: ReactNode) {
  return render(
    <RegistryContext.Provider value={appAtomRegistry}>{element}</RegistryContext.Provider>,
  );
}

function button(screen: Screen, name?: string) {
  const buttons = [...screen.container.querySelectorAll("button")];
  return name === undefined
    ? buttons[0]
    : buttons.find((element) => element.textContent?.trim() === name);
}

async function click(screen: Screen, name?: string) {
  await act(async () => button(screen, name)!.click());
}

function renderAction(props: Partial<Parameters<typeof ServerUpdateAction>[0]> = {}) {
  return renderUpdate(
    <ServerUpdateAction
      environmentId={"env-test" as EnvironmentId}
      serverLabel="Test server"
      selfUpdate="boot-service"
      targetVersion="0.0.31"
      {...props}
    />,
  );
}

describe("ServerUpdateAction", () => {
  it.each([
    { serverUpdateScope: undefined, scopes: ["orchestration:operate"], allowed: true },
    { serverUpdateScope: undefined, scopes: ["orchestration:read"], allowed: false },
    {
      serverUpdateScope: "environment:maintain",
      scopes: ["orchestration:operate"],
      allowed: false,
    },
    {
      serverUpdateScope: "environment:maintain",
      scopes: ["environment:maintain"],
      allowed: true,
    },
  ] as const)(
    "uses the advertised update scope $serverUpdateScope with grant $scopes",
    async ({ serverUpdateScope, scopes, allowed }) => {
      using _state = setup();
      setSession(
        AsyncResult.success(
          decodeSessionState({
            ...currentSession,
            scopes,
            auth: {
              ...legacyAuth,
              ...(serverUpdateScope === undefined ? {} : { serverUpdateScope }),
            },
          }),
        ),
      );
      testState.updateServer.mockResolvedValue(success());

      await using screen = await renderAction();
      expect(button(screen, "Update")!.disabled).toBe(!allowed);
      await click(screen, "Update");

      expect(testState.updateServer).toHaveBeenCalledTimes(allowed ? 1 : 0);
    },
  );

  it("disables the action once maintenance access is removed", async () => {
    using _state = setup();
    await using screen = await renderAction();
    await act(() => setSession(AsyncResult.success({ ...currentSession, scopes: [] })));
    expect(button(screen, "Update")!.disabled).toBe(true);
    await click(screen, "Update");
    expect(testState.updateServer).not.toHaveBeenCalled();
  });
});

describe("ServerUpdatesAction", () => {
  const targets: ReadonlyArray<ServerUpdateTarget> = [
    {
      environmentId: "batch-a" as EnvironmentId,
      serverLabel: "Laptop",
      selfUpdate: "boot-service",
      targetVersion: "0.0.31",
    },
    {
      environmentId: "batch-b" as EnvironmentId,
      serverLabel: "Office",
      selfUpdate: "respawn",
      targetVersion: "0.0.31",
    },
    {
      environmentId: "batch-c" as EnvironmentId,
      serverLabel: "Manual",
      selfUpdate: null,
      targetVersion: "0.0.31",
    },
  ];

  const mount = (batch = targets) => renderUpdate(<ServerUpdatesAction targets={batch} />);

  it("names a failed machine while letting the other machine complete", async () => {
    using _state = setup();
    testState.updateServer
      .mockResolvedValueOnce(AsyncResult.failure(Cause.fail(new Error("Download failed"))))
      .mockResolvedValueOnce(success());
    await using screen = await mount();
    await click(screen, "Update all");

    expect(testState.updateServer).toHaveBeenCalledTimes(2);
    expect(testState.toast).toHaveBeenCalledWith({
      type: "error",
      title: "Laptop update failed",
      description: "Download failed",
    });
    expect(testState.toast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success", title: "Office updated" }),
    );
    expect(button(screen, "Update all")!.disabled).toBe(false);
  });

  it("skips a machine whose update would cross Stable and Nightly", async () => {
    using _state = setup();
    testState.serverVersions.set("batch-a", "0.0.30-nightly.20261001.1");
    testState.updateServer.mockResolvedValue(success());
    await using screen = await mount();
    await click(screen, "Update all");

    expect(testState.updateServer).toHaveBeenCalledTimes(1);
    expect(testState.toast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success", title: "Office updated" }),
    );
  });
});

function localeSurface(locale: "en" | "zh-CN", children: ReactNode) {
  return (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => {},
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      {children}
    </WebI18nContext>
  );
}

function UpdateFailureOutcome({ target }: { target: ServerUpdateTarget }) {
  const update = useServerUpdate();
  const { t } = useI18n();
  const [failure, setFailure] = useState("");
  return (
    <>
      <button
        onClick={() =>
          void update(target).then((outcome) => {
            setFailure(
              collectUpdateEverythingResult(
                {
                  localVersion: null,
                  localFailures: [],
                  servers: [{ label: target.serverLabel, outcome }],
                  providers: [],
                },
                t,
              ).failures[0] ?? "",
            );
          })
        }
      >
        Run update
      </button>
      <output>{failure}</output>
    </>
  );
}

it("uses decoded owned update reasons for the actual toast and aggregate outcome", async () => {
  using _state = setup();
  const version = "opaque-$& {version} 中文";
  const reason = `The desktop app found no build of ${version}.`;
  const error = decodeUpdateError(
    JSON.parse(
      JSON.stringify(
        encodeUpdateError(
          new ServerSelfUpdateError({
            reason,
            reasonMessage: { code: "build-not-found", version },
          }),
        ),
      ),
    ),
  );
  testState.updateServer.mockResolvedValue(AsyncResult.failure(Cause.fail(error)));
  const target = {
    environmentId: "owned-failure" as EnvironmentId,
    serverLabel: "Office $& {reason}",
    selfUpdate: "boot-service" as const,
    targetVersion: version,
  };
  await using screen = await renderUpdate(
    localeSurface("zh-CN", <UpdateFailureOutcome target={target} />),
  );
  await screen.getByRole("button", { name: "Run update" }).click();
  const expected = `服务器更新失败：桌面应用未找到 ${version} 的构建版本。`;
  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent(`${target.serverLabel}: ${expected}`);
  expect(testState.toast).toHaveBeenCalledWith(
    expect.objectContaining({ type: "error", description: expected }),
  );
  expect(testState.updateServer).toHaveBeenCalledWith({
    environmentId: target.environmentId,
    input: { targetVersion: version },
  });
  expect(error.reason).toBe(reason);

  testState.updateServer.mockResolvedValue(
    AsyncResult.failure(Cause.fail(new Error(error.message))),
  );
  await screen.getByRole("button", { name: "Run update" }).click();
  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent(`${target.serverLabel}: ${error.message}`);
  expect(testState.toast).toHaveBeenLastCalledWith(
    expect.objectContaining({ description: error.message }),
  );
  for (const reasonMessage of [
    undefined,
    { code: "future" },
    { code: "build-not-found", version: null },
    { code: "build-not-found", version: "stale" },
  ]) {
    const legacy = decodeUpdateError(
      JSON.parse(JSON.stringify({ _tag: "ServerSelfUpdateError", reason, reasonMessage })),
    );
    testState.updateServer.mockResolvedValue(AsyncResult.failure(Cause.fail(legacy)));
    await screen.getByRole("button", { name: "Run update" }).click();
    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent(`${target.serverLabel}: 服务器更新失败：${reason}`);
    expect(legacy.reason).toBe(reason);
    if (reasonMessage?.version !== "stale") expect(legacy.reasonMessage).toBeUndefined();
  }
});

it("renders cached failed state in the current locale without retaining provenance on a clone", async () => {
  using _state = setup();
  const version = "opaque-$& {version} 中文";
  const error = new ServerUpdateResumeTimeoutError({
    environmentId: "cached",
    targetVersion: version,
  });
  const state = createServerUpdateFailedState(
    { stage: "resuming", fromVersion: "old", targetVersion: version },
    error,
  );
  await using screen = await renderUpdate(
    localeSurface("en", <ServerUpdateProgress state={state} />),
  );
  await expect.element(screen.getByRole("alert")).toHaveTextContent(error.message);
  await screen.rerender(localeSurface("zh-CN", <ServerUpdateProgress state={state} />));
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent(`无法确认服务器已恢复运行 t3@${version}。请重新连接以检查更新结果。`);
  await screen.rerender(localeSurface("zh-CN", <ServerUpdateProgress state={{ ...state }} />));
  await expect.element(screen.getByRole("alert")).toHaveTextContent(error.message);
  await screen.rerender(localeSurface("en", <ServerUpdateProgress state={state} />));
  await expect.element(screen.getByRole("alert")).toHaveTextContent(error.message);
  expect(state.message).toBe(error.message);
  expect(testState.updateServer).not.toHaveBeenCalled();
});
