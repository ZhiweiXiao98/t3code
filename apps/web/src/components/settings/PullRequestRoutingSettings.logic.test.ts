import { describe, expect, it } from "vite-plus/test";
import { summarizePullRequestRouting } from "./PullRequestRoutingSettings.logic";

describe("pull request routing summary", () => {
  it("preserves English grouping, order, and arbitrary machine names", () => {
    const labels = ["Open", "Read PRs", "Host,{names}"];
    const permissions = ["off", "read", "read-write"] as const;
    for (const a of permissions)
      for (const b of permissions)
        for (const c of permissions) {
          const entries = labels.map((label, index) => ({ label, permission: [a, b, c][index]! }));
          const groups = (["read-write", "read"] as const).flatMap((permission) => {
            const names = entries
              .filter((entry) => entry.permission === permission)
              .map((entry) => entry.label);
            return names.length
              ? [`${names.join(", ")} ${permission === "read" ? "read PRs" : "read and act"}`]
              : [];
          });
          const expected = groups.length ? groups.join(" · ") : null;
          expect(summarizePullRequestRouting(entries)).toBe(expected);
          expect(summarizePullRequestRouting(entries, "en")).toBe(expected);
          const zh = summarizePullRequestRouting(entries, "zh-CN");
          for (const entry of entries)
            if (entry.permission !== "off") expect(zh).toContain(entry.label);
          if (entries.every((entry) => entry.permission === "off")) expect(zh).toBeNull();
        }
  });
  it("localizes permission copy while keeping colliding user labels opaque", () => {
    expect(
      summarizePullRequestRouting(
        [
          { label: "Open", permission: "read" },
          { label: "Read PRs", permission: "read-write" },
        ],
        "zh-CN",
      ),
    ).toBe("Read PRs：读取并操作 · Open：读取拉取请求");
    expect(summarizePullRequestRouting([], "zh-CN")).toBeNull();
  });
});
