import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { VoiceInputSetup } from "./VoiceInputSetup";

vi.mock("../../state/environments", () => ({ useEnvironment: () => undefined }));
vi.mock("../../state/session", () => ({ useEnvironmentScope: () => true }));
vi.mock("../../hooks/useSettings", () => ({
  useClientSettings: (select: (settings: typeof DEFAULT_CLIENT_SETTINGS) => unknown) =>
    select(DEFAULT_CLIENT_SETTINGS),
  updateClientSettings: vi.fn(),
}));

it("renders a cached microphone enumeration failure in the current locale without retrying", async () => {
  using enumerate = vi
    .spyOn(navigator.mediaDevices, "enumerateDevices")
    .mockRejectedValue(new Error("opaque device failure"));
  const onStartRecording = vi.fn();
  const surface = (locale: "en" | "zh-CN") => (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => undefined,
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <VoiceInputSetup
        environmentId={null}
        open
        step={1}
        status={null}
        model={null}
        language={null}
        downloading={false}
        error={null}
        onOpenChange={() => undefined}
        onRetryCatalog={null}
        onDownload={() => undefined}
        onCancelDownload={() => undefined}
        onStartRecording={onStartRecording}
      />
    </WebI18nContext>
  );
  await using screen = await render(surface("en"));
  const alert = page.getByRole("alert");
  const english = "Could not list microphones. You can still use the system default.";
  await expect.element(alert).toHaveTextContent(english);
  await screen.rerender(surface("zh-CN"));
  await expect.element(alert).toHaveTextContent("无法列出麦克风，仍可使用系统默认设备。");
  await screen.rerender(surface("en"));
  await expect.element(alert).toHaveTextContent(english);
  expect(enumerate).toHaveBeenCalledOnce();
  expect(onStartRecording).not.toHaveBeenCalled();
});
