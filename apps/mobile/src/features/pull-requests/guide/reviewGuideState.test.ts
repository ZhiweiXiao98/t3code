import { expect, it } from "vite-plus/test";
import { guideNoticeDescription, guideNoticeState } from "./reviewGuideState";

it("distinguishes application guide descriptions from literal server and provider failures", () => {
  const base = { data: null, isPending: false, running: false, startError: null, error: null };
  for (const locale of ["en", "zh-CN"] as const) {
    const loading = guideNoticeState(base);
    expect(guideNoticeDescription(loading, locale)).toBe(
      locale === "en" ? "Checking for a saved guide…" : "正在检查已保存的导览…",
    );
    const writing = guideNoticeState({ ...base, running: true });
    expect(guideNoticeDescription(writing, locale)).toBe(
      locale === "en"
        ? "An agent is reading the change and writing the tour. You can leave and come back when it’s ready."
        : "智能体正在阅读更改并编写导览，你可以先离开，准备好后再回来。",
    );
    for (const error of ["Settings", "Open", "Checking for a saved guide…", "Error/{0}/$&"]) {
      expect(guideNoticeDescription(guideNoticeState({ ...base, startError: error }), locale)).toBe(
        error,
      );
      expect(guideNoticeDescription(guideNoticeState({ ...base, error }), locale)).toBe(error);
    }
  }
});
