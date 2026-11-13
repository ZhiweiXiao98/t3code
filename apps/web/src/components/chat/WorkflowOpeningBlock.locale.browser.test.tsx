import type { ComponentProps } from "react";
import { EnvironmentId } from "@t3tools/contracts";
import {
  deriveWorkflowGroups,
  projectedSubagentsToRuntime,
  type WorkflowOpening,
} from "@t3tools/client-runtime/state/subagentRuntime";
import * as DateTime from "effect/DateTime";
import { expect, it, vi } from "vite-plus/test";
import { render } from "../../../test/render";
import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";
vi.mock(import("~/state/server"), async () => {
  const { Atom } = await import("effect/reactivity");
  return { providersIgnoringCheckedAtAtom: () => Atom.make([]) };
});
vi.mock(import("../ChatMarkdown"), async () => {
  const { memo } = await import("react");
  return {
    default: memo<typeof import("../ChatMarkdown").default.type>(function MarkdownFixture({
      text,
    }: ComponentProps<typeof import("../ChatMarkdown").default>) {
      return <span>{text}</span>;
    }),
  };
});
vi.mock(import("./V2LifecycleRow"), () => ({
  EnvironmentSubagentAvatar: () => <span aria-hidden />,
}));
import { WorkflowOpeningBlock } from "./WorkflowOpeningBlock";

it("updates owned workflow counts and fallback phase titles without changing authored same-text titles", async () => {
  const at = DateTime.makeUnsafe("2026-08-01T10:00:00Z");
  const group = deriveWorkflowGroups(
    projectedSubagentsToRuntime([
      {
        id: "coordinator",
        title: "opaque",
        prompt: "script",
        model: "model",
        status: "running",
        result: null,
        startedAt: at,
        completedAt: null,
        updatedAt: at,
        workflow: {
          phases: [{ index: 1, title: "Phase 1" }],
          agents: [
            { index: 1, label: "opaque", state: "running", phaseIndex: 0 },
            { index: 2, label: "user", state: "completed", phaseIndex: 1 },
          ],
        },
      },
    ]),
  )[0]!;
  const opening: WorkflowOpening = {
    messageId: "message",
    script: "opaque/{script}/$&",
    name: null,
    description: null,
    driver: null,
    providerInstanceId: null,
    group,
  };
  const onOpenThread = vi.fn();
  const surface = (locale: "en" | "zh-CN") => (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => {},
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <WorkflowOpeningBlock
        opening={opening}
        environmentId={EnvironmentId.make("workflow")}
        onOpenThread={onOpenThread}
      />
    </WebI18nContext>
  );
  await using screen = await render(surface("en"));
  await expect
    .element(screen.getByRole("heading", { name: "Workflow", exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByText("2 agents · 1 working · 1 done", { exact: true }))
    .toBeVisible();
  await screen.rerender(surface("zh-CN"));
  await expect.element(screen.getByRole("heading", { name: "工作流", exact: true })).toBeVisible();
  await expect
    .element(screen.getByText("2 个智能体 · 1 个运行中 · 1 个已完成", { exact: true }))
    .toBeVisible();
  await expect.element(screen.getByText("阶段 1", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Phase 1", { exact: true })).toBeVisible();
  expect(group.phases.map((phase) => phase.title)).toEqual(["Phase 1", "Phase 1"]);
  expect(onOpenThread).not.toHaveBeenCalled();
  await screen.rerender(surface("en"));
  await expect
    .element(screen.getByText("2 agents · 1 working · 1 done", { exact: true }))
    .toBeVisible();
});
