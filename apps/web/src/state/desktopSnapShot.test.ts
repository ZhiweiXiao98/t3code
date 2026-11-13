import { describe, expect, it, vi } from "vite-plus/test";
const localeState = vi.hoisted(() => ({ locale: "en" as "en" | "zh-CN" }));
vi.mock("../i18n/readWebI18n", () => ({ readWebI18n: () => localeState }));
import { snapShotSetupError } from "./desktopSnapShot";

describe("snapshot setup error boundary", () => {
  it("reads the current locale for background errors and keeps external details literal", () => {
    for (const locale of ["zh-CN", "en"] as const) {
      localeState.locale = locale;
      expect(
        snapShotSetupError(
          "Couldn't check capture setup",
          new Error("Could not read the snapshot."),
        ),
      ).toEqual(
        locale === "zh-CN"
          ? { title: "无法检查捕获设置", message: "无法读取快照。" }
          : { title: "Couldn't check capture setup", message: "Could not read the snapshot." },
      );
      expect(
        snapShotSetupError("Couldn't check capture setup", new Error("provider/{message}/$&"))
          .message,
      ).toBe("provider/{message}/$&");
      expect(snapShotSetupError("Couldn't check capture setup", null).message).toBe(
        locale === "zh-CN" ? "请重试。" : "Try again.",
      );
    }
  });
});
