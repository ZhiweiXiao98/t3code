import { expect, it, vi } from "vite-plus/test";

const nativeAlert = vi.hoisted(() => vi.fn());
vi.mock("react-native", () => ({ Alert: { alert: nativeAlert, prompt: vi.fn() } }));
vi.mock("../../i18n/mobileStrings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../i18n/mobileStrings")>();
  return {
    ...actual,
    localizeAlertArguments: (...args: Parameters<typeof actual.localizeAlertArguments>) =>
      actual.localizeAlertArguments(args[0], args[1], args[2], "zh-CN"),
  };
});

import { alertWithLiteralMessage } from "./Dialog";

it("keeps literal error messages while localizing title and actions without losing native options", () => {
  const onPress = vi.fn();
  const options = { cancelable: true, onDismiss: vi.fn() };
  alertWithLiteralMessage(
    "Settings",
    "Settings",
    [{ text: "Cancel", style: "cancel", onPress }],
    options,
  );
  expect(nativeAlert).toHaveBeenLastCalledWith(
    "设置",
    "Settings",
    [{ text: "取消", style: "cancel", onPress }],
    options,
  );
});
