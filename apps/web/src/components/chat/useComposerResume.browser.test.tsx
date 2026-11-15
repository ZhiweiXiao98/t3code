import "~/index.css";
import { useState } from "react";
import * as Cause from "effect/Cause";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { makeThreadErrorSetter, type LocalThreadErrorEntry } from "../ChatView.logic";
import { ChatBannerLane } from "./ChatBannerLane";
import { EnvironmentId, ProviderInstanceId, RunId, ThreadId } from "@t3tools/contracts";
import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import { AsyncResult } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";

vi.mock("./ProviderStatusBanner", async (original) => ({
  ...(await original<typeof import("./ProviderStatusBanner")>()),
  ProviderStatusBanner: () => null,
}));

const state = vi.hoisted(() => ({
  startedTurn: null as ReturnType<typeof deferred<unknown>> | null,
  command: vi.fn(),
}));

vi.mock(import("../../state/use-orchestration-command"), async (importOriginal) => ({
  ...(await importOriginal()),
  useOrchestrationCommand: (() => async (value: { readonly input: unknown }) => {
    state.command(value.input);
    state.startedTurn?.resolve(value.input);
    return AsyncResult.success(undefined);
  }) as never,
}));

import { render } from "../../../test/render";
import type { ComposerHandleRef } from "../../composerHandleContext";
import { useComposerResume } from "./useComposerResume";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function setup() {
  state.command.mockReset();
  const startedTurn = deferred<unknown>();
  state.startedTurn = startedTurn;
  return { startedTurn };
}

const threadA = ThreadId.make("thread:a");
const threadAModel = { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.5" };
const threadBModel = { instanceId: ProviderInstanceId.make("claudeAgent"), model: "claude-opus" };

function composerShowing(selectedModelSelection: typeof threadAModel) {
  return { getSendContext: () => ({ selectedModelSelection }) } as never;
}

function ResumeButton(props: {
  readonly composerRef: ComposerHandleRef;
  readonly persistSettings: () => Promise<AtomCommandResult<void, unknown>>;
  readonly showErrors?: boolean;
}) {
  const [entries, setEntries] = useState<Record<string, LocalThreadErrorEntry>>({});
  const [, setDismissTick] = useState(0);
  const ref = { environmentId: EnvironmentId.make("environment:test"), threadId: threadA };
  const setError = makeThreadErrorSetter({
    routeThreadRef: ref,
    routeThreadKey: "resume",
    draftId: null,
    serverThreadRef: ref,
    setLocalServerErrorsByThreadKey: setEntries,
    setLocalDraftErrorsByDraftId: setEntries,
  });
  const { onResume, isResuming } = useComposerResume({
    environmentId: EnvironmentId.make("environment:test"),
    routeThreadKey: "environment:test:thread:a",
    currentRouteThreadKeyRef: { current: "environment:test:thread:a" },
    activeThread: { id: threadA } as never,
    resumableRunId: RunId.make("run:interrupted"),
    hasHeldQueuedRuns: false,
    isSendBusy: false,
    isRevertingCheckpoint: false,
    threadDetailLoading: false,
    activeEnvironmentUnavailable: false,
    runtimeMode: "full-access",
    localCheckoutBranchMismatch: null,
    composerRef: props.composerRef,
    persistThreadSettingsForNextTurn: props.persistSettings,
    clearUsageLimitsFor: () => undefined,
    scrollToEnd: () => undefined,
    setThreadError: setError,
  });
  return (
    <>
      <button type="button" disabled={isResuming} onClick={() => void onResume()}>
        Resume
      </button>
      {props.showErrors ? (
        <ChatBannerLane
          environmentId={ref.environmentId}
          providerStatus={null}
          providerStatusBannerKey={null}
          setDismissedProviderStatusBannerKey={() => undefined}
          onOpenProviderSetup={() => undefined}
          threadId={threadA}
          threadError={entries.resume?.message ?? null}
          localThreadErrorEntry={entries.resume}
          threadErrorClass={null}
          threadErrorCode={null}
          threadErrorBannerKey={null}
          setThreadError={setError}
          setThreadErrorBannerDismissTick={setDismissTick}
        />
      ) : null}
    </>
  );
}

it("continues on the resumed thread's model after the composer moves to another thread", async () => {
  const { startedTurn } = setup();
  const settingsPersisted = deferred<AtomCommandResult<void, unknown>>();
  // ChatView keeps one composer across thread routes, so its ref follows navigation.
  const composerRef: ComposerHandleRef = { current: composerShowing(threadAModel) };
  await using screen = await render(
    <ResumeButton composerRef={composerRef} persistSettings={() => settingsPersisted.promise} />,
  );

  await screen.getByRole("button", { name: "Resume" }).click();
  composerRef.current = composerShowing(threadBModel);
  settingsPersisted.resolve(AsyncResult.success(undefined));

  expect(await startedTurn.promise).toMatchObject({
    threadId: threadA,
    manualContinuationOfRunId: "run:interrupted",
    modelSelection: threadAModel,
  });
});

it.each(["owned", "raw", "empty", "interrupted"] as const)(
  "keeps resume pipeline %s failure current without another operation",
  async (kind) => {
    setup();
    const pending = deferred<AtomCommandResult<void, unknown>>();
    const persistSettings = vi.fn(() => pending.promise);
    const composerRef: ComposerHandleRef = { current: composerShowing(threadAModel) };
    const surface = (locale: "en" | "zh-CN") => (
      <WebI18nContext
        value={{
          locale,
          appLocale: locale,
          setAppLocale: () => undefined,
          t: (key, values) => translateWebMessage(locale, key, values),
        }}
      >
        <ResumeButton composerRef={composerRef} persistSettings={persistSettings} showErrors />
      </WebI18nContext>
    );
    await using screen = await render(surface("en"));
    await screen.getByRole("button", { name: "Resume", exact: true }).click();
    await expect
      .element(screen.getByRole("button", { name: "Resume", exact: true }))
      .toBeDisabled();
    await screen.rerender(surface("zh-CN"));
    pending.resolve(
      AsyncResult.failure(
        kind === "interrupted"
          ? Cause.interrupt()
          : Cause.fail(
              kind === "owned"
                ? null
                : new Error(kind === "empty" ? "" : "Could not resume thread."),
            ),
      ),
    );
    await expect.element(screen.getByRole("button", { name: "Resume", exact: true })).toBeEnabled();
    for (const locale of ["zh-CN", "en", "zh-CN", "en"] as const) {
      await screen.rerender(surface(locale));
      if (kind === "empty" || kind === "interrupted") {
        await expect
          .poll(() => screen.container.querySelector('[data-variant="error"]'))
          .toBeNull();
      } else {
        const expected =
          kind === "owned" && locale === "zh-CN" ? "无法恢复会话。" : "Could not resume thread.";
        await expect.poll(() => screen.container.textContent).toContain(expected);
      }
    }
    expect(persistSettings).toHaveBeenCalledTimes(1);
    expect(state.command).not.toHaveBeenCalled();
  },
);
