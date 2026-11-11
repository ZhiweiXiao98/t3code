import { useI18n } from "../../i18n/WebI18nContext";
import type {
  EnvironmentId,
  OrchestrationV2PendingBackgroundTask,
  ThreadId,
} from "@t3tools/contracts";
import type { ThreadStructure } from "@t3tools/client-runtime/state/shell";
import { useState } from "react";

import { InlineButton } from "../ui/button";
import {
  Dialog,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { CommandOutputPanel, useCommandOutputStreaming } from "./CommandOutputPanel";
import { ShellCommandBlock } from "./ShellCommandBlock";

export function BackgroundWorkDetails(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly tasks: ReadonlyArray<OrchestrationV2PendingBackgroundTask>;
  readonly turnItems: ThreadStructure["turnItems"];
  readonly onOpenThread: (threadId: ThreadId) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const streamsOutput = useCommandOutputStreaming(props.environmentId);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<InlineButton />}>{t("v019.backgroundDetails")}</DialogTrigger>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{t("v019.backgroundWork")}</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <div className="space-y-5">
            {props.tasks.map((task) => {
              const item = props.turnItems.findLast((candidate) =>
                task.itemId === undefined
                  ? (candidate.nativeItemRef?.nativeId || candidate.id) === task.taskId
                  : candidate.id === task.itemId,
              );
              const command =
                task.command ?? (item?.type === "command_execution" ? item.input : undefined);
              const description = task.description?.trim();
              const title =
                description && description !== command?.trim()
                  ? description
                  : command
                    ? t("v019.backgroundCommand")
                    : t(
                        task.kind === "subagent"
                          ? "v019.backgroundSubagent"
                          : task.kind === "command"
                            ? "v019.backgroundCommandKind"
                            : task.kind === "monitor"
                              ? "v019.backgroundMonitor"
                              : "v019.backgroundTaskKind",
                      );
              const itemId =
                task.itemId ?? (item?.type === "command_execution" ? item.id : undefined);
              const childThreadId = task.kind === "subagent" ? task.childThreadId : undefined;
              return (
                <section key={task.taskId} className="space-y-2 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-medium">{title}</h3>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {t(task.awaited ? "v019.backgroundWaiting" : "v019.backgroundRunning")}
                    </span>
                  </div>
                  {command ? (
                    <div className="rounded-md border border-border bg-muted/20 p-3 font-mono text-xs whitespace-pre-wrap break-words">
                      <ShellCommandBlock command={command} />
                    </div>
                  ) : null}
                  {itemId && streamsOutput && item?.status === "running" ? (
                    <div className="font-mono text-xs whitespace-pre-wrap break-words">
                      <CommandOutputPanel
                        environmentId={props.environmentId}
                        threadId={task.sourceThreadId ?? item?.threadId ?? props.threadId}
                        itemId={itemId}
                      />
                    </div>
                  ) : null}
                  {childThreadId ? (
                    <InlineButton
                      onClick={() => {
                        setOpen(false);
                        props.onOpenThread(childThreadId);
                      }}
                    >
                      {t("v019.backgroundOpen")}
                    </InlineButton>
                  ) : null}
                </section>
              );
            })}
          </div>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
