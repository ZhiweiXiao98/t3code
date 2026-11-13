import { EnvironmentId, DevicePlatformAvailability } from "@t3tools/contracts";
import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import * as Schema from "effect/Schema";
import { expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { SourcePlatforms } from "./DeviceSourcesSettings";

const decode = Schema.decodeUnknownSync(DevicePlatformAvailability);
const original = "The pool has no iOS devices.";
const marked = decode({
  platform: "ios",
  available: false,
  reason: original,
  reasonMessage: { source: "simlock-device-host", code: "ios-devices-missing" },
});

function platforms(
  locale: ResolvedAppLocale,
  entries: ReadonlyArray<DevicePlatformAvailability>,
  shared: boolean,
) {
  return (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => undefined,
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <SourcePlatforms
        row={{
          key: "test-source",
          title: "Test source",
          description: "",
          shared,
          environments: entries.map((entry, index) => ({
            environmentId: EnvironmentId.make(`environment-${index}`),
            label: `Machine ${index}`,
            added: true,
            platforms: [entry],
          })),
        }}
      />
    </WebI18nContext>
  );
}

it.each([true, false])(
  "switches live platform reasons without changing availability, shared=%s",
  async (shared) => {
    const sdkRoot = "/sdk/Working $&/{sdkRoot}/中文";
    const entry = shared
      ? marked
      : decode({
          platform: "android",
          available: false,
          reason: `Android Emulator is missing from ${sdkRoot}. Install it in Android Studio's SDK Manager.`,
          reasonMessage: { source: "local-device-host", code: "android-emulator-missing", sdkRoot },
        });
    const chinese = shared
      ? "设备池中没有 iOS 设备。"
      : `${sdkRoot} 中缺少 Android 模拟器。请在 Android Studio 的 SDK 管理器中安装。`;
    await using screen = await render(platforms("en", [entry], shared));
    await userEvent.click(screen.getByRole("button"));
    await expect.element(page.getByText(entry.reason!, { exact: true })).toBeVisible();
    await screen.rerender(platforms("zh-CN", [entry], shared));
    await expect.element(page.getByText(chinese, { exact: true })).toBeVisible();
    await expect
      .element(screen.getByRole("button"))
      .toHaveAccessibleName(`Test source: ${shared ? "iOS" : "Android"} 不可用`);
    await screen.rerender(platforms("en", [entry], shared));
    await expect.element(page.getByText(entry.reason!, { exact: true })).toBeVisible();
  },
);

it.each([true, false])(
  "keeps mixed raw and marked reasons separate across machines, shared=%s",
  async (shared) => {
    const raw = decode({ platform: "ios", available: false, reason: original });
    await using screen = await render(platforms("zh-CN", [marked, raw], shared));
    await userEvent.click(screen.getByRole("button"));
    await expect.element(page.getByText("设备池中没有 iOS 设备。", { exact: true })).toBeVisible();
    await expect.element(page.getByText(original, { exact: true })).toBeVisible();
  },
);

it.each([
  undefined,
  { source: "simlock-device-host", code: "future-reason" },
  { source: "local-device-host", code: "ios-devices-missing" },
  { source: "simlock-device-host", code: "android-devices-missing" },
])(
  "leaves same-text wire reasons raw when metadata is absent or mismatched: %j",
  async (reasonMessage) => {
    const entry = decode({ platform: "ios", available: false, reason: original, reasonMessage });
    await using screen = await render(platforms("zh-CN", [entry], true));
    await userEvent.click(screen.getByRole("button"));
    await expect.element(page.getByText(original, { exact: true })).toBeVisible();
  },
);
