import type { GitRunStackedActionResult } from "@t3tools/contracts";
import { expect, it } from "vite-plus/test";
import {
  mobileVcsElapsed,
  mobileVcsFailure,
  mobileVcsProgressLabel,
  mobileVcsResultTitle,
} from "./mobileVcsStrings";

it("localizes only known progress labels and keeps hook names literal", () => {
  for (const locale of ["en", "zh-CN"] as const) {
    expect(mobileVcsElapsed(null, 5000, locale)).toBe(null);
    expect(mobileVcsElapsed(4000, 5000, locale)).toBe(null);
    expect(mobileVcsElapsed(1000, 5000, locale)).toBe(
      locale === "en" ? "Running for 4s" : "已运行 4 秒",
    );
    expect(mobileVcsProgressLabel("Committing...", null, locale)).toBe(
      locale === "en" ? "Committing..." : "正在提交…",
    );
    for (const name of ["Settings", "Open", "{0} $&", "Running custom..."]) {
      expect(mobileVcsProgressLabel(name, null, locale)).toBe(name);
      expect(mobileVcsProgressLabel("ignored", name, locale)).toBe(
        locale === "en" ? `Running ${name}...` : `正在运行 ${name}…`,
      );
    }
  }
});

it("uses structured results to verify app-owned completion titles, never repository descriptions", () => {
  const result = {
    action: "push",
    branch: { status: "skipped_not_requested" },
    commit: { status: "skipped_not_requested", commitSha: "abcdef1234", subject: "Settings" },
    push: { status: "pushed", branch: "Open {0} $&" },
    pr: { status: "skipped_not_requested" },
    toast: {
      title: "Pushed abcdef1 to Open {0} $&",
      description: "Settings",
      cta: { kind: "none" },
    },
  } satisfies GitRunStackedActionResult;
  const before = JSON.stringify(result);
  expect(mobileVcsResultTitle(result, "en")).toBe(result.toast.title);
  expect(mobileVcsResultTitle(result, "zh-CN")).toBe("已推送 abcdef1至 Open {0} $&");
  expect(JSON.stringify(result)).toBe(before);
  for (const title of ["Settings", "Open", "Pushed custom content"]) {
    expect(mobileVcsResultTitle({ ...result, toast: { ...result.toast, title } }, "zh-CN")).toBe(
      title,
    );
  }
  const pr = {
    ...result,
    pr: { status: "created" as const, number: 42, title: "Open" },
    toast: { ...result.toast, title: "Created PR #42" },
  };
  expect(mobileVcsResultTitle(pr, "zh-CN")).toBe("已创建 PR #42");
  expect(pr.pr.title).toBe("Open");
});

it("retains completion branches and unknown future server titles", () => {
  const base: GitRunStackedActionResult = {
    action: "commit",
    branch: { status: "skipped_not_requested" },
    commit: { status: "created", commitSha: "abcdef1234", subject: "Open" },
    push: { status: "skipped_not_requested" },
    pr: { status: "skipped_not_requested" },
    toast: { title: "Committed abcdef1", cta: { kind: "none" } },
  };
  expect(mobileVcsResultTitle(base, "zh-CN")).toBe("已提交 abcdef1");
  const noSha = {
    ...base,
    commit: { ...base.commit, commitSha: undefined },
    toast: { ...base.toast, title: "Committed changes" },
  };
  expect(mobileVcsResultTitle(noSha, "zh-CN")).toBe("已提交更改");
  const done = {
    ...base,
    commit: { status: "skipped_not_requested" as const },
    toast: { ...base.toast, title: "Done" },
  };
  expect(mobileVcsResultTitle(done, "zh-CN")).toBe("完成");
  for (const title of ["Settings", "Custom future title"]) {
    expect(mobileVcsResultTitle({ ...base, toast: { ...base.toast, title } }, "zh-CN")).toBe(title);
  }
});

it("localizes owned VCS error fallbacks while preserving literal Error messages", () => {
  for (const [fallback, translated] of [
    ["Git action failed.", "Git 操作失败。"],
    ["Failed to refresh branches.", "刷新分支失败。"],
  ] as const) {
    for (const locale of ["en", "zh-CN"] as const) {
      expect(mobileVcsFailure(null, fallback, locale)).toBe(
        locale === "en" ? fallback : translated,
      );
      for (const message of ["Settings", "Open", fallback, ""]) {
        expect(mobileVcsFailure(new Error(message), fallback, locale)).toBe(message);
      }
    }
  }
});
