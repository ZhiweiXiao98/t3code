import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { EnvironmentId } from "@t3tools/contracts";
import {
  createServerUpdateFailedState,
  ServerUpdateResumeTimeoutError,
  type ServerUpdateState,
} from "@t3tools/client-runtime/state/server";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/reactivity";
import type { AlertButton } from "react-native";
import { expect, it, vi } from "vite-plus/test";
import type { MobileLocale } from "../../i18n/mobileStrings";
import type { EnvironmentReleaseCheck } from "./environmentUpdateCheck";

const harness = vi.hoisted(() => ({
  locale: "en" as MobileLocale,
  updateState: { status: "idle" } as ServerUpdateState,
  checkResult: undefined as AsyncResult.AsyncResult<EnvironmentReleaseCheck, Error> | undefined,
  alert: vi.fn<(title: string, message?: string, buttons?: AlertButton[]) => void>(),
  update: vi.fn(),
  describe: vi.fn(),
  check: vi.fn(),
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  Alert: { alert: harness.alert },
  View: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  Text: ({ children, accessibilityRole }: { children?: ReactNode; accessibilityRole?: "alert" }) =>
    createElement("span", { role: accessibilityRole }, children),
  TextInput: "input",
  useWindowDimensions: () => ({ fontScale: 1 }),
}));
vi.mock("uniwind", () => ({ useResolveClassNames: () => ({}) }));
vi.mock("../../components/ui/AppSymbol", () => ({ SymbolView: () => null }));
vi.mock("../../components/ui/AppActivityIndicator", () => ({ AppActivityIndicator: () => null }));
vi.mock("../../components/ui/RowPressable", () => ({
  RowPressable: ({
    children,
    accessibilityLabel,
    onPress,
    disabled,
  }: {
    children?: ReactNode;
    accessibilityLabel?: string;
    onPress: () => void;
    disabled?: boolean;
  }) =>
    createElement(
      "button",
      { "aria-label": accessibilityLabel, disabled, onClick: onPress },
      children,
    ),
}));
vi.mock("@effect/atom-react", () => ({
  useAtomValue: () => harness.updateState,
  useAtom: () => [harness.checkResult, harness.check],
}));
vi.mock("../../state/server", () => ({
  serverEnvironment: { updateStateAtom: () => "update-state" },
  updateOutdatedServer: "update",
  describeOutdatedServer: "describe",
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (command: string) => (command === "update" ? harness.update : harness.describe),
}));
vi.mock("../../i18n/mobileStrings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../i18n/mobileStrings")>();
  return {
    ...actual,
    get MOBILE_LOCALE() {
      return harness.locale;
    },
    localizeMobileString: (value: string, locale: MobileLocale = harness.locale) =>
      actual.localizeMobileString(value, locale),
    localizeAlertArguments: (title: string, message?: string, buttons?: AlertButton[]) =>
      actual.localizeAlertArguments(title, message, buttons, harness.locale),
  };
});
import { OutdatedServerUpdateSection } from "./OutdatedServerUpdateSection";

it.each(["en", "zh-CN"] as const)(
  "preserves actual retry confirmation, raw check error precedence and failed-state identity in %s",
  async (locale) => {
    harness.locale = locale;
    for (const mock of [harness.alert, harness.update, harness.describe, harness.check])
      mock.mockReset();
    harness.update.mockResolvedValue(AsyncResult.success(undefined));
    const environmentId = EnvironmentId.make("Settings");
    const label = "Settings {0} $&";
    const targetVersion = "Open {0} $&";
    const release = AsyncResult.success({ fromVersion: "old", targetVersion });
    const failure = new ServerUpdateResumeTimeoutError({ environmentId, targetVersion });
    const failed = createServerUpdateFailedState(
      { stage: "resuming", fromVersion: "old", targetVersion },
      failure,
    );
    harness.updateState = failed;
    harness.checkResult = AsyncResult.failure(Cause.fail(new Error("Settings")), {
      previousSuccess: Option.some(release),
    });
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    using _globals = { [Symbol.dispose]: () => vi.unstubAllGlobals() };
    const container = document.createElement("div");
    const root = createRoot(container);
    const render = (key: string) =>
      act(async () =>
        root.render(
          <OutdatedServerUpdateSection key={key} environmentId={environmentId} label={label} />,
        ),
      );
    try {
      await render("priority");
      expect(container.querySelector('[role="alert"]')?.textContent).toBe("Settings");
      const retry = locale === "en" ? "Retry update" : "重试更新";
      act(() => container.querySelector<HTMLButtonElement>(`[aria-label="${retry}"]`)!.click());
      expect(harness.alert.mock.lastCall?.[0]).toContain(label);
      expect(harness.alert.mock.lastCall?.[1]).toContain(targetVersion);
      await act(async () => harness.alert.mock.lastCall?.[2]?.[0]?.onPress?.());
      expect(harness.update).not.toHaveBeenCalled();
      act(() => container.querySelector<HTMLButtonElement>(`[aria-label="${retry}"]`)!.click());
      await act(async () => harness.alert.mock.lastCall?.[2]?.[1]?.onPress?.());
      expect(harness.update).toHaveBeenCalledExactlyOnceWith({
        environmentId,
        input: { targetVersion },
        fromVersion: "old",
      });
      expect(container.querySelector('[role="alert"]')?.textContent).toBe(
        locale === "en"
          ? failure.message
          : `无法确认服务器已恢复运行 t3@${targetVersion}。请重新连接以检查更新结果。`,
      );
      expect(failed.message).toBe(failure.message);
      harness.checkResult = release;
      harness.updateState = { ...failed };
      await render("copy");
      expect(container.querySelector('[role="alert"]')?.textContent).toBe(failure.message);
      harness.updateState = {
        status: "running",
        stage: "resuming",
        fromVersion: "old",
        targetVersion,
      };
      await render("running");
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(
        Array.from(container.querySelectorAll("button")).every((button) => button.disabled),
      ).toBe(true);
      expect(harness.update).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => root.unmount());
    }
  },
);
