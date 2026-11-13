import type { AlertButton } from "react-native";
import { expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({ alert: vi.fn(), download: vi.fn() }));
vi.mock("react-native", () => ({ Alert: { alert: state.alert } }));
vi.mock("../../lib/attachmentDownload", () => ({ downloadAndShareAttachment: state.download }));

it("retains downloaded names, URLs and raw save failures when the localized action is chosen", async () => {
  const previous = process.env.EXPO_PUBLIC_APP_LOCALE;
  try {
    for (const locale of ["en", "zh-CN"] as const) {
      process.env.EXPO_PUBLIC_APP_LOCALE = locale;
      vi.resetModules();
      const { offerPreviewDownload } = await import("./previewDownload");
      for (const fileName of ["Settings", "Open", "{0} $&.txt"]) {
        state.alert.mockClear();
        state.download.mockReset().mockRejectedValue(new Error(fileName));
        const download = { fileName, sizeBytes: 4, url: "https://example.test/opaque-download" };
        offerPreviewDownload(download);
        expect(state.alert.mock.lastCall?.[0]).toBe(
          locale === "en" ? `Downloaded ${fileName}` : `已下载 ${fileName}`,
        );
        expect(state.download).not.toHaveBeenCalled();
        const actions = state.alert.mock.lastCall?.[2] as AlertButton[];
        expect(actions[0]).toMatchObject({
          text: locale === "en" ? "Not now" : "暂不",
          style: "cancel",
        });
        await actions[1]!.onPress?.();
        expect(state.download).toHaveBeenCalledExactlyOnceWith({
          url: download.url,
          attachment: { name: fileName, mimeType: "application/octet-stream" },
          signal: expect.any(AbortSignal),
        });
        expect(state.alert.mock.lastCall?.slice(0, 2)).toEqual([
          locale === "en" ? "Could not save the download" : "无法保存下载",
          fileName,
        ]);
      }
    }
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_APP_LOCALE;
    else process.env.EXPO_PUBLIC_APP_LOCALE = previous;
    vi.resetModules();
  }
});
