import { expect, it } from "vite-plus/test";
import { noticeDetail, noticeTitle } from "./environmentConnectionCopy";

it("localizes connection copy while preserving opaque names, errors and unknown resources", () => {
  for (const locale of ["en", "zh-CN"] as const) {
    const zh = locale === "zh-CN";
    const name = "Settings {0} $&";
    expect(noticeTitle("connecting", name, locale)).toBe(
      zh ? `正在连接 ${name}…` : `Connecting to ${name}...`,
    );
    expect(noticeTitle("available", name, locale)).toBe(
      zh ? `${name} 已断开连接` : `${name} is disconnected`,
    );
    expect(noticeDetail("error", "preview", "Open", locale)).toBe("Open");
    expect(noticeDetail("reconnecting", "preview", name, locale)).toBe(
      zh ? `应用将继续自动重试。${name}` : `The app will keep retrying automatically. ${name}`,
    );
    expect(noticeDetail("available", "preview", null, locale)).toBe(
      zh ? "重新连接环境以加载预览。" : "Reconnect the environment to load the preview.",
    );
    expect(noticeDetail("connecting", name, null, locale)).toBe(
      zh
        ? `环境就绪后将立即加载${name}。`
        : `The ${name} will load as soon as the environment is ready.`,
    );
    for (const resource of ["constructor", "unknown", "toString", "__proto__"]) {
      expect(noticeDetail("available", resource, null, locale)).toBe(
        zh
          ? `重新连接环境以加载${resource}。`
          : `Reconnect the environment to load the ${resource}.`,
      );
    }
    for (const phase of [
      "offline",
      "connecting",
      "reconnecting",
      "unsupported",
      "available",
      "error",
      "connected",
    ] as const) {
      expect(noticeTitle(phase, name, locale)).not.toContain("undefined");
      expect(noticeDetail(phase, "terminal", null, locale)).not.toContain("undefined");
    }
  }
});
