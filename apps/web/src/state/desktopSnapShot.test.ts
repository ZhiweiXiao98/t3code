import { describe, expect, it, vi } from "vite-plus/test";
import { snapShotSetupError, formatSnapShotSetupError, runSnapShotSetup } from "./desktopSnapShot";

describe("snapshot setup error boundary", () => {
  it("stores source state and presents cached fallback at the current locale", () => {
    const report = snapShotSetupError("Couldn't check capture setup", null);
    expect(report.title).toBe("Couldn't check capture setup");
    for (const locale of ["en", "zh-CN", "en"] as const) {
      expect(formatSnapShotSetupError(locale, report)).toEqual({
        title: locale === "en" ? "Couldn't check capture setup" : "无法检查捕获设置",
        message: locale === "en" ? "Try again." : "请重试。",
      });
      for (const raw of [
        "",
        "Could not read the snapshot.",
        "Could not set up the GNOME extension.",
        "Error invoking remote method 'desktop:setup-snap-shot': DesktopSnapShotSetupError: Could not set up the GNOME extension.",
        "literal/$&/{name}",
      ]) {
        expect(
          formatSnapShotSetupError(
            locale,
            snapShotSetupError("Couldn't check capture setup", new Error(raw)),
          ).message,
        ).toBe(raw);
      }
    }
  });
  it("selects the outcome capability once and never retries a failed or rejected attempt", async () => {
    const legacy = vi.fn().mockResolvedValue(undefined);
    const outcome = vi.fn().mockResolvedValue({
      _tag: "Failure",
      message: "",
      messageDescriptor: { code: "setup", action: "install-extension", reason: "setup-failed" },
    });
    const bridge = { setupSnapShot: legacy, setupSnapShotOutcome: outcome };
    expect(await runSnapShotSetup(bridge, "install-extension")).toEqual({
      message: "",
      messageDescriptor: { code: "setup", action: "install-extension", reason: "setup-failed" },
    });
    expect(outcome).toHaveBeenCalledExactlyOnceWith("install-extension");
    expect(legacy).not.toHaveBeenCalled();
    outcome.mockRejectedValueOnce(new Error("transport"));
    await expect(runSnapShotSetup(bridge, "retry-shortcut")).rejects.toThrow("transport");
    expect(legacy).not.toHaveBeenCalled();
    outcome.mockResolvedValueOnce({ _tag: "Success" });
    expect(await runSnapShotSetup(bridge, "retry-shortcut")).toBeNull();
    outcome.mockResolvedValueOnce({
      _tag: "Failure",
      message: null,
      messageDescriptor: { code: "setup", action: "install-extension", reason: "setup-failed" },
    });
    expect(await runSnapShotSetup(bridge, "retry-shortcut")).toEqual({ message: null });
    expect(await runSnapShotSetup({ setupSnapShot: legacy }, "retry-shortcut")).toBeNull();
    expect(legacy).toHaveBeenCalledExactlyOnceWith("retry-shortcut");
    legacy.mockRejectedValueOnce(new Error("Could not set up the GNOME extension."));
    await expect(runSnapShotSetup({ setupSnapShot: legacy }, "install-extension")).rejects.toThrow(
      "Could not set up the GNOME extension.",
    );
  });
});
