import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";
import "~/index.css";
import { EnvironmentId, ProviderDriverKind, ThreadId, TurnItemId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
vi.mock(import("./CommandOutputPanel"), () => ({
  useCommandOutputStreaming: () => true,
  CommandOutputPanel: () => <div>Command output stream</div>,
}));

import { render } from "../../../test/render";
import { backgroundWorkNowItem, goalNowItem } from "./ThreadActivityBanners";
import { ThreadNow } from "./ThreadNow";

it("opens full command details for short labels and keeps pending tasks current", async () => {
  const command = "python3 audit.py -j 6\n> scratch/audit.log 2>&1";
  const commandItem = (status: "running" | "completed") => ({
    id: TurnItemId.make("bash-1"),
    threadId: ThreadId.make("thread"),
    runId: null,
    nodeId: null,
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal: 1,
    status,
    title: null,
    startedAt: null,
    completedAt: null,
    updatedAt: DateTime.makeUnsafe("2026-11-09T00:00:00Z"),
    type: "command_execution" as const,
    input: command,
    output: "Command running in background with ID: native-task",
  });
  const view = (
    description?: string,
    status: "running" | "completed" = "completed",
    explicitItem = true,
  ) => (
    <ThreadNow
      attention={null}
      syncPhase={null}
      goal={null}
      work={backgroundWorkNowItem({
        environmentId: EnvironmentId.make("test"),
        threadId: ThreadId.make("thread"),
        tasks: [
          {
            taskId: "native-task",
            itemId: explicitItem ? TurnItemId.make("bash-1") : undefined,
            kind: "command",
            description,
            command,
            awaited: true,
          },
        ],
        turnItems: [
          commandItem(status),
          {
            ...commandItem("running"),
            id: TurnItemId.make("native-match"),
            nativeItemRef: {
              driver: ProviderDriverKind.make("codex"),
              nativeId: "native-task",
              strength: "strong",
            },
            ordinal: 2,
          },
        ],
        stopDisabled: false,
        stopping: false,
        onStop: async () => undefined,
        onOpenThread: () => undefined,
      })}
    />
  );
  await using screen = await render(view("Audit"));
  await screen.getByRole("button", { name: "Details", exact: true }).click();
  await vi.waitFor(() => expect(page.getByRole("dialog").element().textContent).toContain(command));
  await expect.element(page.getByText("Command output stream")).not.toBeInTheDocument();

  await screen.rerender(view(command));
  await expect.element(page.getByRole("heading", { name: "Command", exact: true })).toBeVisible();
  await screen.rerender(view());
  await expect.element(page.getByRole("heading", { name: "Command", exact: true })).toBeVisible();

  await screen.rerender(view("Check remaining modules", "running"));
  await expect
    .element(page.getByRole("heading", { name: "Check remaining modules" }))
    .toBeVisible();
  await expect.element(page.getByText("Command output stream")).toBeVisible();
  await screen.rerender(view("Native fallback", "completed", false));
  await expect.element(page.getByText("Command output stream")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
});

it("switches actual activity and goal presentation without changing command parameters or stop actions", async () => {
  const command = "audit/{0}/$& --check";
  const objective = "Goal complete / opaque/{0}/$&";
  const onStop = vi.fn(async () => {});
  const onSendCommand = vi.fn(async () => {});
  const surface = (locale: "en" | "zh-CN") => (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => {},
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <ThreadNow
        attention={null}
        syncPhase={null}
        work={backgroundWorkNowItem({
          locale,
          environmentId: EnvironmentId.make("test"),
          threadId: ThreadId.make("thread"),
          tasks: [{ taskId: "opaque-task", kind: "command", description: command, awaited: true }],
          turnItems: [],
          stopDisabled: false,
          stopping: false,
          onStop,
          onOpenThread: () => {},
        })}
        goal={goalNowItem({
          locale,
          threadId: ThreadId.make("thread"),
          goal: { objective, status: "active", tokensUsed: 1000, tokenBudget: 2000, checks: 2 },
          isWorking: true,
          onSendCommand,
        })}
      />
    </WebI18nContext>
  );
  await using screen = await render(surface("en"));
  await expect.element(screen.getByText(`Waiting · ${command}`, { exact: true })).toBeVisible();
  await expect
    .element(screen.getByText(objective, { exact: true }).element().parentElement!)
    .toHaveTextContent(`Pursuing goal · 1k / 2k tokens · 2 checks ${objective}`);
  await screen.rerender(surface("zh-CN"));
  await expect.element(screen.getByText(`等待中 · ${command}`, { exact: true })).toBeVisible();
  await expect
    .element(screen.getByText(objective, { exact: true }).element().parentElement!)
    .toHaveTextContent(`正在推进目标 · 1k / 2k 个 Token · 2 次检查 ${objective}`);
  await expect.element(screen.getByText(objective, { exact: true })).toBeVisible();
  await screen.getByRole("button", { name: "停止", exact: true }).click();
  expect(onStop).toHaveBeenCalledOnce();
  expect(onSendCommand).not.toHaveBeenCalled();
  await screen.rerender(surface("en"));
  await expect.element(screen.getByText(`Waiting · ${command}`, { exact: true })).toBeVisible();
});
