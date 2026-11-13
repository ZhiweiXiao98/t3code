import {
  EnvironmentId,
  ThreadId,
  type AssetCreateUrlInput,
  type AssetCreateUrlResult,
} from "@t3tools/contracts";
import {
  PrimaryConnectionTarget,
  type PreparedConnection,
} from "@t3tools/client-runtime/connection";
import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import * as Option from "effect/Option";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import type { MobileLocale } from "../../i18n/mobileStrings";
import type { FileChipTarget } from "./fileChipMenu";

const state = vi.hoisted(() => ({
  locale: "en" as MobileLocale,
  connected: true,
  alert: vi.fn<typeof import("react-native").Alert.alert>(),
  createUrl:
    vi.fn<
      (target: {
        environmentId: EnvironmentId;
        input: AssetCreateUrlInput;
      }) => Promise<AtomCommandResult<AssetCreateUrlResult, unknown>>
    >(),
  download: vi.fn<typeof import("../../lib/attachmentDownload").downloadAndShareAttachment>(),
}));
vi.mock("react-native", () => ({ Alert: { alert: state.alert, prompt: vi.fn() } }));
vi.mock("../../state/assets", () => ({ assetEnvironment: { createUrl: "createUrl" } }));
vi.mock("../../state/session", () => ({
  usePreparedConnection: () => (state.connected ? Option.some(prepared) : Option.none()),
}));
vi.mock("../../state/use-atom-query-runner", () => ({ useAtomQueryRunner: () => state.createUrl }));
vi.mock("../../lib/attachmentDownload", () => ({ downloadAndShareAttachment: state.download }));
vi.mock("../../i18n/mobileStrings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../i18n/mobileStrings")>();
  return {
    ...actual,
    localizeMobileString: (value: string) => actual.localizeMobileString(value, state.locale),
    localizeAlertArguments: (...args: Parameters<typeof actual.localizeAlertArguments>) =>
      actual.localizeAlertArguments(args[0], args[1], args[2], state.locale),
  };
});

import { useFileChipShare } from "./useFileChipShare";

const environmentId = EnvironmentId.make("Settings");
const threadId = ThreadId.make("thread");
const prepared: PreparedConnection = {
  environmentId,
  label: "Settings",
  httpBaseUrl: "https://host.example/base/",
  socketUrl: "wss://host.example/ws",
  httpAuthorization: null,
  target: new PrimaryConnectionTarget({
    environmentId,
    label: "Settings",
    httpBaseUrl: "https://host.example/base/",
    wsBaseUrl: "wss://host.example/",
  }),
};
const target = { fullPath: "/repo/Settings {0} $&.pdf", relativePath: "Settings {0} $&.pdf" };
function setup(locale: MobileLocale) {
  state.locale = locale;
  state.connected = true;
  state.alert.mockReset();
  state.createUrl.mockReset().mockResolvedValue(
    AsyncResult.success({
      relativeUrl: "/api/Settings%20%7B0%7D?token=$&",
      expiresAt: 1_800_000_000_000,
    }),
  );
  state.download.mockReset().mockResolvedValue(undefined);
}
async function render(value: FileChipTarget = target) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement("div");
  const root = createRoot(element);
  function Share() {
    const share = useFileChipShare(environmentId, threadId, "source-Settings");
    return <button onClick={() => share(value)}>share</button>;
  }
  await using stack = new AsyncDisposableStack();
  stack.defer(() => act(async () => root.unmount()));
  await act(async () => root.render(<Share />));
  const resources = stack.move();
  return {
    click: () => act(async () => element.querySelector("button")!.click()),
    [Symbol.asyncDispose]: () => resources.disposeAsync(),
  };
}

it.each(["en", "zh-CN"] as const)(
  "translates only owned chip failures in %s and retries after a failure",
  async (locale) => {
    for (const stage of ["disconnected", "no-url", "raw", "fallback"] as const) {
      setup(locale);
      if (stage === "disconnected") state.connected = false;
      if (stage === "no-url")
        state.createUrl.mockResolvedValueOnce(
          AsyncResult.failure(Cause.fail(new Error("Settings"))),
        );
      if (stage === "raw") state.download.mockRejectedValueOnce(new Error("Settings"));
      if (stage === "fallback") state.download.mockRejectedValueOnce("failure");
      await using screen = await render();
      await screen.click();
      expect(state.alert.mock.lastCall?.slice(0, 2)).toEqual([
        locale === "en" ? "Could not share file" : "无法共享文件",
        stage === "disconnected"
          ? locale === "en"
            ? "Reconnect to the environment and try again."
            : "请重新连接环境后重试。"
          : stage === "no-url"
            ? locale === "en"
              ? "The file could not be loaded. Reconnect and try again."
              : "无法加载该文件，请重新连接后重试。"
            : stage === "raw"
              ? "Settings"
              : locale === "en"
                ? "Try again."
                : "请重试。",
      ]);
      if (stage === "disconnected") expect(state.createUrl).not.toHaveBeenCalled();
      if (stage === "disconnected" || stage === "no-url")
        expect(state.download).not.toHaveBeenCalled();
      if (stage !== "disconnected") {
        await screen.click();
        expect(state.createUrl).toHaveBeenLastCalledWith({
          environmentId,
          input: { resource: { _tag: "media-file", threadId, path: target.fullPath } },
        });
        expect(state.download).toHaveBeenLastCalledWith({
          url: "https://host.example/api/Settings%20%7B0%7D?token=$&",
          attachment: {
            name: target.relativePath,
            mimeType: "application/pdf",
            resource: { _tag: "media-file", threadId, path: target.fullPath },
          },
          signal: expect.any(AbortSignal),
          sourceIdentifier: "source-Settings",
        });
        expect(state.alert).toHaveBeenCalledOnce();
      }
    }
  },
);

it("ignores unsupported targets and duplicate shares, then aborts without an alert on unmount", async () => {
  setup("zh-CN");
  {
    await using screen = await render({});
    await screen.click();
    expect(state.createUrl).not.toHaveBeenCalled();
  }
  const completion = Promise.withResolvers<void>();
  state.download.mockReturnValue(completion.promise);
  const screen = await render();
  try {
    await screen.click();
    await screen.click();
    expect(state.download).toHaveBeenCalledOnce();
    const signal = state.download.mock.lastCall![0].signal;
    expect(signal.aborted).toBe(false);
    await screen[Symbol.asyncDispose]();
    expect(signal.aborted).toBe(true);
    await act(async () => completion.reject(new Error("Settings")));
    expect(state.alert).not.toHaveBeenCalled();
  } finally {
    await screen[Symbol.asyncDispose]();
  }
});

it("does not download after unmount during URL preparation", async () => {
  setup("en");
  const url = Promise.withResolvers<AtomCommandResult<AssetCreateUrlResult, unknown>>();
  state.createUrl.mockReturnValue(url.promise);
  await using screen = await render();
  await screen.click();
  await screen[Symbol.asyncDispose]();
  await act(async () =>
    url.resolve(
      AsyncResult.success({ relativeUrl: "/api/file.pdf", expiresAt: 1_800_000_000_000 }),
    ),
  );
  expect(state.download).not.toHaveBeenCalled();
  expect(state.alert).not.toHaveBeenCalled();
});
