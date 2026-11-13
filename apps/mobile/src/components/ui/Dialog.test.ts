import { expect, it, vi } from "vite-plus/test";

const nativeAlert = vi.hoisted(() => vi.fn());
vi.mock("react-native", () => ({ Alert: { alert: nativeAlert, prompt: vi.fn() } }));
it("keeps literal content while localizing owned titles and actions without losing native options", async () => {
  vi.resetModules();
  const previous = process.env.EXPO_PUBLIC_APP_LOCALE;
  process.env.EXPO_PUBLIC_APP_LOCALE = "zh-CN";
  try {
    const { alertWithLiteralMessage, alertWithLiteralContent } = await import("./Dialog");
    const onPress = vi.fn();
    const options = { cancelable: true, onDismiss: vi.fn() };
    for (const [alert, title] of [
      [alertWithLiteralMessage, "设置"],
      [alertWithLiteralContent, "Settings"],
    ] as const) {
      alert("Settings", "Open", [{ text: "Cancel", style: "cancel", onPress }], options);
      expect(nativeAlert).toHaveBeenLastCalledWith(
        title,
        "Open",
        [{ text: "取消", style: "cancel", onPress }],
        options,
      );
    }
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_APP_LOCALE;
    else process.env.EXPO_PUBLIC_APP_LOCALE = previous;
    vi.resetModules();
  }
});

it("keeps environment update parameters literal and retains the confirmed update callback", async () => {
  vi.resetModules();
  const previous = process.env.EXPO_PUBLIC_APP_LOCALE;
  process.env.EXPO_PUBLIC_APP_LOCALE = "zh-CN";
  try {
    const { alertWithLiteralMessage } = await import("./Dialog");
    const { environmentUpdateConfirmation } =
      await import("../../features/settings/environmentSettingsDisplay");
    const onUpdate = vi.fn();
    const onCancel = vi.fn();
    const confirmation = environmentUpdateConfirmation(
      "Settings {0} $&",
      "Open/{1}",
      true,
      "zh-CN",
    );
    alertWithLiteralMessage(confirmation.title, confirmation.message, [
      { text: "Cancel", style: "cancel", onPress: onCancel },
      { text: "Update", onPress: onUpdate },
    ]);
    expect(nativeAlert).toHaveBeenLastCalledWith(
      confirmation.title,
      confirmation.message,
      [
        { text: "取消", style: "cancel", onPress: onCancel },
        { text: "更新", onPress: onUpdate },
      ],
      undefined,
    );
    expect(onUpdate).not.toHaveBeenCalled();
    const buttons = nativeAlert.mock.lastCall?.[2] as Array<{ onPress: () => void }>;
    buttons[1]!.onPress();
    expect(onUpdate).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_APP_LOCALE;
    else process.env.EXPO_PUBLIC_APP_LOCALE = previous;
    vi.resetModules();
  }
});
