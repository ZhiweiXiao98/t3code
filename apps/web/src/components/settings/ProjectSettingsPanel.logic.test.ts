import { projectRemovalMessage } from "../../i18n/confirmationMessages";
import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { planProjectRemoval } from "@t3tools/client-runtime/state/projects";

describe("project removal confirmation", () => {
  const local = {
    id: ProjectId.make("shared-id"),
    environmentId: EnvironmentId.make("local"),
    title: "Repo",
    workspaceRoot: "/work/repo",
    environmentLabel: "Local",
  };
  const remote = {
    ...local,
    environmentId: EnvironmentId.make("remote"),
    environmentLabel: "Remote",
  };

  const parentId = ThreadId.make("parent");
  const listed = { rootThreadId: parentId, parentThreadId: null, relationshipToParent: null };
  const child = { rootThreadId: parentId, parentThreadId: parentId };

  it("limits a checkout's thread count to its listed threads in that environment and project", () => {
    const plan = planProjectRemoval({
      members: [local],
      groupMemberCount: 2,
      hasOtherMembers: false,
      displayName: "Repo",
      threads: [
        { environmentId: local.environmentId, projectId: local.id, lineage: listed },
        {
          environmentId: local.environmentId,
          projectId: local.id,
          lineage: { ...child, relationshipToParent: "subagent" },
        },
        {
          environmentId: local.environmentId,
          projectId: local.id,
          lineage: { ...child, relationshipToParent: "fork", sideChat: true },
        },
        { environmentId: remote.environmentId, projectId: remote.id, lineage: listed },
      ],
    });
    expect(plan.projectThreads).toHaveLength(3);
    expect(plan.threadCount).toBe(1);
    expect(plan.targetLabel).toBe("Repo");
    expect(projectRemovalMessage("en", plan, [local], false)).toBe(plan.confirmationMessage);
    const chinese = projectRemovalMessage("zh-CN", plan, [local], false);
    expect(chinese).toContain("移除检出目录“Repo”并删除其中的 1 个会话？");
    expect(chinese).toContain("提供方会话将保留。");
    expect(plan.confirmationMessage).toBe(
      'Remove checkout "Repo" and delete its 1 thread?\nPath: /work/repo\nEnvironment: Local\nThose threads and any archived threads are deleted from T3 Code. Provider sessions are kept.\nOther entries in this grouped project are unaffected.\nThis action cannot be undone.',
    );
  });

  it("keeps an environment-filtered group scoped to its selected checkout", () => {
    const plan = planProjectRemoval({
      members: [remote],
      groupMemberCount: 1,
      hasOtherMembers: true,
      displayName: "Repo",
      threads: [],
    });
    expect(plan.targetKind).toBe("checkout");
    expect(plan.threadCount).toBe(0);
    expect(projectRemovalMessage("zh-CN", plan, [remote], true)).toContain(
      "所有已归档会话将从 T3 Code 中删除。提供方会话将保留。",
    );
    expect(plan.confirmationMessage).toContain("Environment: Remote");
    expect(plan.confirmationMessage).toContain(
      "Other entries in this grouped project are unaffected.",
    );
    expect(plan.confirmationMessage).toContain(
      "Any archived threads are deleted from T3 Code. Provider sessions are kept.",
    );
  });

  // regression: #21409 project-wide removal must count every checkout's threads and keep files
  it("states the full group count and preserves files when removing a project everywhere", () => {
    const plan = planProjectRemoval({
      members: [local, remote],
      groupMemberCount: 2,
      hasOtherMembers: false,
      displayName: "Repo",
      threads: [],
    });
    expect(plan.targetKind).toBe("project");
    expect(plan.threadCount).toBe(0);
    expect(projectRemovalMessage("en", plan, [local, remote], false)).toBe(
      plan.confirmationMessage,
    );
    expect(projectRemovalMessage("zh-CN", plan, [local, remote], false)).toContain("2");
    expect(plan.confirmationMessage).toContain("This removes 2 grouped project entries.");
    expect(plan.confirmationMessage).toContain(
      "This removes only the project entries, not the files on disk.",
    );
  });
});
