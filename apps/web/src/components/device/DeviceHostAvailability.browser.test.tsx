import { DevicePlatformAvailability } from "@t3tools/contracts";
import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import * as Schema from "effect/Schema";
import { expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { DeviceHostAvailability } from "./DeviceHostAvailability";

const decode = Schema.decodeUnknownSync(DevicePlatformAvailability);
function availability(locale: ResolvedAppLocale, platform: DevicePlatformAvailability) {
  return (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => undefined,
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <DeviceHostAvailability platforms={[platform]} />
    </WebI18nContext>
  );
}

it("updates the connection-check tooltip on locale changes and preserves an opaque SDK path", async () => {
  const sdkRoot = "C:\\SDK\\Working $&\\{sdkRoot}\\中文";
  const reason = `Android Emulator is missing from ${sdkRoot}. Install it in Android Studio's SDK Manager.`;
  const entry = decode({
    platform: "android",
    available: false,
    reason,
    reasonMessage: { source: "local-device-host", code: "android-emulator-missing", sdkRoot },
  });
  await using screen = await render(availability("en", entry));
  await userEvent.hover(screen.getByText("Android unavailable", { exact: true }));
  await expect.element(page.getByRole("tooltip")).toHaveTextContent(reason);
  await screen.rerender(availability("zh-CN", entry));
  await expect
    .element(page.getByRole("tooltip"))
    .toHaveTextContent(
      `${sdkRoot} 中缺少 Android 模拟器。请在 Android Studio 的 SDK 管理器中安装。`,
    );
  await screen.rerender(availability("en", entry));
  await expect.element(page.getByRole("tooltip")).toHaveTextContent(reason);
  await screen.rerender(availability("zh-CN", { ...entry, reasonMessage: undefined }));
  await expect.element(page.getByRole("tooltip")).toHaveTextContent(reason);
});
