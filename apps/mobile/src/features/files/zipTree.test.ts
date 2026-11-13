import { expect, it } from "vite-plus/test";
import { zipDownloadTimeLeft } from "./zipTree";

it("localizes download estimates without changing rounded duration or absent-estimate rules", () => {
  for (const locale of ["en", "zh-CN"] as const) {
    expect(
      zipDownloadTimeLeft({ receivedBytes: 0, totalBytes: 100, elapsedMs: 1000 }, locale),
    ).toBeNull();
    expect(
      zipDownloadTimeLeft({ receivedBytes: 100, totalBytes: 100, elapsedMs: 1000 }, locale),
    ).toBeNull();
    expect(
      zipDownloadTimeLeft({ receivedBytes: 50, totalBytes: 100, elapsedMs: 999 }, locale),
    ).toBeNull();
    for (const [elapsedMs, english, chinese] of [
      [1000, "About 1 second left", "预计还需 1 秒"],
      [59001, "About 1 minutes left", "预计还需 1 分钟"],
      [60001, "About 2 minutes left", "预计还需 2 分钟"],
    ] as const) {
      expect(zipDownloadTimeLeft({ receivedBytes: 50, totalBytes: 100, elapsedMs }, locale)).toBe(
        locale === "en" ? english : chinese,
      );
    }
  }
});
