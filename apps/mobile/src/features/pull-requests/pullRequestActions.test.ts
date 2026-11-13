import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import { describe, expect, it } from "vite-plus/test";
import {
  allowedMergeMethods,
  canPerformPullRequestAction,
  mergeUnavailableReason,
  pullRequestActionLabel,
} from "./pullRequestActions";

const GITHUB = sourceControlClients.get("github").changeRequest;
const GITLAB = sourceControlClients.get("gitlab").changeRequest;

import type { PullRequestAction } from "@t3tools/contracts";

const ALL_PR_ACTIONS: readonly PullRequestAction[] = [
  "merge",
  "ready",
  "draft",
  "update-branch",
  "enable-auto-merge",
  "disable-auto-merge",
  "approve-workflows",
  "close",
  "reopen",
  "revert",
  "delete-branch",
];

type Detail = Parameters<typeof allowedMergeMethods>[0];

function detail(overrides: Partial<Detail> = {}): Detail {
  return {
    state: "open",
    isDraft: false,
    mergeability: "mergeable",
    autoMergeEnabled: false,
    capabilities: {
      actions: ALL_PR_ACTIONS,
      mergeMethods: ["merge", "squash", "rebase"],
      updateMethods: ["merge", "rebase"],
    },
    viewerPermissions: { actions: ALL_PR_ACTIONS, updateMethods: ["merge"] },
    mergeCapabilities: { merge: true, squash: true, rebase: false },
    ...overrides,
  };
}

describe("mobile pull request actions", () => {
  it("requires both provider support and account permission", () => {
    expect(
      canPerformPullRequestAction(detail({ viewerPermissions: { actions: [] } }), "merge"),
    ).toBe(false);
    expect(
      canPerformPullRequestAction(
        detail({ capabilities: { actions: [], mergeMethods: ["merge"] } }),
        "merge",
      ),
    ).toBe(false);
    expect(mergeUnavailableReason(detail(), false, GITHUB)).toContain("read-only");
    const reasons = [
      [detail(), false, "此环境连接为只读。"],
      [detail({ viewerPermissions: { actions: [] } }), true, "你的账户无法合并此拉取请求。"],
      [
        detail({ capabilities: { actions: [], mergeMethods: ["merge"] } }),
        true,
        "此提供商不支持在此处合并。",
      ],
      [detail({ isDraft: true }), true, "请先将此草稿标记为可供审查，再合并。"],
      [
        detail({ mergeCapabilities: { merge: false, squash: false, rebase: false } }),
        true,
        "此仓库没有可用的合并方式。",
      ],
    ] as const;
    for (const [pr, writable, expected] of reasons) {
      const snapshot = structuredClone(pr);
      expect(mergeUnavailableReason(pr, writable, GITHUB, "zh-CN")).toBe(expected);
      expect(mergeUnavailableReason(pr, writable, GITHUB, "en")).toBe(
        mergeUnavailableReason(pr, writable, GITHUB),
      );
      expect(pr).toEqual(snapshot);
    }
    expect(mergeUnavailableReason(detail(), true, GITHUB, "zh-CN")).toBeNull();
  });

  it("blocks a conflicting PR's immediate merge and explains why", () => {
    const pr = detail({ mergeability: "conflicting" });
    expect(canPerformPullRequestAction(pr, "merge")).toBe(false);
    expect(mergeUnavailableReason(pr, true, GITHUB)).toContain("conflicts");
    expect(mergeUnavailableReason(pr, true, GITHUB, "zh-CN")).toBe("请先解决分支冲突，再合并。");
  });

  it("names the change request with its host's term", () => {
    expect(pullRequestActionLabel("close", GITHUB)).toBe("Close pull request");
    expect(pullRequestActionLabel("close", GITLAB)).toBe("Close merge request");
    expect(pullRequestActionLabel("revert", GITLAB)).toBe("Create revert merge request");
    expect(mergeUnavailableReason(detail({ state: "merged" }), true, GITLAB)).toBe(
      "This merge request has been merged.",
    );
    expect(mergeUnavailableReason(detail({ state: "merged" }), true, GITLAB, "zh-CN")).toBe(
      "此合并请求已合并。",
    );
    expect(mergeUnavailableReason(detail({ state: "closed" }), true, GITLAB, "zh-CN")).toBe(
      "请重新打开此合并请求后再合并。",
    );
  });
});
