import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import { expect, it } from "vite-plus/test";
import { pullRequestActionFailure, pullRequestMergeConfirmation } from "./pullRequestMergeDisplay";

it("preserves merge identifiers and branch text while translating confirmation templates", () => {
  for (const provider of ["github", "gitlab"] as const) {
    const terminology = sourceControlClients.get(provider).changeRequest;
    const baseBranch = "Settings/{1}/$&";
    const input = {
      action: "merge" as const,
      terminology,
      number: 7,
      baseBranch,
      method: "squash" as const,
      stack: null,
    };
    const original = structuredClone(input);
    expect(pullRequestMergeConfirmation(input, "en")).toEqual({
      title: `Merge ${terminology.singular}?`,
      message: `Merge #7 into ${baseBranch} using squash.`,
    });
    expect(pullRequestMergeConfirmation(input, "zh-CN")).toEqual({
      title: provider === "github" ? "合并 拉取请求？" : "合并 合并请求？",
      message: `使用 squash 将 #7 合并到 ${baseBranch}。`,
    });
    const stackInput = {
      ...input,
      stack: { base: "Open/{0}/$&", layers: [{ number: 9 }, { number: 7 }] },
    };
    const stackSnapshot = structuredClone(stackInput);
    expect(pullRequestMergeConfirmation(stackInput, "en")).toEqual({
      title: "Merge 2 stack layers?",
      message: "Merge #9 → #7 into Open/{0}/$& using squash. Layers above #7 stay open.",
    });
    expect(pullRequestMergeConfirmation(stackInput, "zh-CN")).toEqual({
      title: "合并 2 个堆叠层？",
      message: "使用 squash 将 #9 → #7 合并到 Open/{0}/$&。#7 以上的堆叠层将保持打开。",
    });
    const singleLayer = { ...stackInput, stack: { ...stackInput.stack, layers: [{ number: 7 }] } };
    expect(pullRequestMergeConfirmation(singleLayer, "en")).toEqual({
      title: `Merge ${terminology.singular}?`,
      message: "Merge #7 into Open/{0}/$& using squash. Layers above #7 stay open.",
    });
    for (const locale of ["en", "zh-CN"] as const) {
      const enable = pullRequestMergeConfirmation(
        { ...input, action: "enable-auto-merge" },
        locale,
      );
      expect(enable).toEqual(
        locale === "en"
          ? {
              title: "Enable auto-merge?",
              message:
                "Merge #7 using squash when its requirements are met. This may happen immediately.",
            }
          : {
              title: "启用自动合并？",
              message: "满足要求后，使用 squash 合并 #7。这可能会立即发生。",
            },
      );
      const disable = pullRequestMergeConfirmation(
        { ...input, action: "disable-auto-merge", method: undefined },
        locale,
      );
      expect(disable).toEqual(
        locale === "en"
          ? {
              title: "Disable auto-merge?",
              message: `Stop the provider from automatically merging this ${terminology.singular}.`,
            }
          : {
              title: "停用自动合并？",
              message:
                provider === "github"
                  ? "停止提供商自动合并此拉取请求。"
                  : "停止提供商自动合并此合并请求。",
            },
      );
    }
    expect(input).toEqual(original);
    expect(stackInput).toEqual(stackSnapshot);
  }
});

it("keeps provider failure messages literal, even when they match application keys", () => {
  for (const locale of ["en", "zh-CN"] as const) {
    for (const message of ["Settings", "Try again.", "Error: $& {0}\nfeature/Settings", ""]) {
      expect(pullRequestActionFailure(new Error(message), locale)).toBe(message);
    }
    expect(pullRequestActionFailure({ message: "Settings" }, locale)).toBe(
      locale === "zh-CN" ? "请重试。" : "Try again.",
    );
    expect(pullRequestActionFailure(new Error("Save"), locale, "Save")).toBe("Save");
    expect(pullRequestActionFailure({ message: "Save" }, locale, "Save")).toBe(
      locale === "zh-CN" ? "保存" : "Save",
    );
  }
});
