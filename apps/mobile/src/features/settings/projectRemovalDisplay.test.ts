import { planProjectRemoval } from "@t3tools/client-runtime/state/projects";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { expect, it } from "vite-plus/test";
import { projectRemovalConfirmation } from "./projectRemovalDisplay";
import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";

it("matches shared English removal plans and preserves opaque names and paths in Chinese", () => {
  const member = {
    id: ProjectId.make("project"),
    environmentId: EnvironmentId.make("environment"),
    title: "Settings {1} $&",
    workspaceRoot: "/Open/{0}/$&",
    environmentLabel: "Open {0} $&",
  };
  for (const count of [0, 1, 3]) {
    for (const hasOtherMembers of [false, true]) {
      for (const grouped of [false, true]) {
        const members = grouped ? [member, { ...member, id: ProjectId.make("second") }] : [member];
        const options = {
          members,
          groupMemberCount: members.length,
          hasOtherMembers,
          displayName: "Group {0} $&",
          threads: [],
          unloadedThreadCount: count,
        };
        const plan = planProjectRemoval(options);
        const before = JSON.stringify({ plan, options });
        expect(projectRemovalConfirmation(plan, members, hasOtherMembers, "en")).toBe(
          plan.confirmationMessage,
        );
        const translated = projectRemovalConfirmation(plan, members, hasOtherMembers, "zh-CN");
        expect(translated).toContain(
          `移除${hasOtherMembers ? "检出目录" : "项目"}“${plan.targetLabel}”`,
        );
        expect(translated).toContain(
          count ? `并删除其 ${count} 个对话？` : `“${plan.targetLabel}”？`,
        );
        expect(translated).toContain("此操作无法撤销。");
        if (!grouped) {
          expect(translated).toContain(`路径：${member.workspaceRoot}`);
          expect(translated).toContain(`环境：${member.environmentLabel}`);
        } else {
          expect(translated).toContain("这会移除 2 个分组项目条目。");
        }
        expect(JSON.stringify({ plan, options })).toBe(before);
      }
    }
  }
});

it("uses plan counts and partial-group decisions without changing thread selection", () => {
  const member = {
    id: ProjectId.make("project"),
    environmentId: EnvironmentId.make("environment"),
    title: "Open",
    workspaceRoot: "/Settings",
  };
  const lineage = {
    rootThreadId: ThreadId.make("root"),
    parentThreadId: null,
    relationshipToParent: null,
  };
  const threads = [
    { environmentId: member.environmentId, projectId: member.id, lineage },
    {
      environmentId: member.environmentId,
      projectId: member.id,
      lineage: { ...lineage, sideChat: true },
    },
  ];
  const plan = planProjectRemoval({
    members: [member],
    groupMemberCount: 2,
    hasOtherMembers: false,
    displayName: "Group",
    threads,
    unloadedThreadCount: 2,
  });
  const message = projectRemovalConfirmation(plan, [member], false, "zh-CN");
  expect(plan.threadCount).toBe(3);
  expect(plan.projectThreads).toEqual(threads);
  expect(message).toContain("移除检出目录“Open”并删除其 3 个对话？");
  expect(message).toContain("此分组项目中的其他条目不受影响。");
  expect(message).not.toContain("环境：");
  expect(projectRemovalConfirmation(plan, [member], false, "en")).toBe(plan.confirmationMessage);
});

it("localizes parameterized project failure titles and permission messages without translating names", () => {
  const name = "Settings {0} $&";
  expect(formatMobileMessage('Failed to update "{0}"', [name], "zh-CN")).toBe(`更新“${name}”失败`);
  expect(formatMobileMessage('Failed to remove "{0}"', [name], "zh-CN")).toBe(`移除“${name}”失败`);
  expect(
    formatMobileMessage("This connection cannot change projects in {0}.", [name], "zh-CN"),
  ).toBe(`此连接无法更改 ${name} 中的项目。`);
  expect(formatMobileMessage("{0} checkouts", [3], "zh-CN")).toBe("3 个检出目录");
});
