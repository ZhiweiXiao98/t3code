import {
  pullRequestLinkProject,
  resolveLinkPullRequestInput,
} from "@t3tools/client-runtime/pull-request-link-input";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import { planThreadPullRequestMutation } from "@t3tools/client-runtime/thread-pull-request-compatibility";
import {
  capitalizeTerm,
  sourceControlClients,
} from "@t3tools/client-runtime/source-control-clients";
import { AuthOrchestrationOperateScope, type ThreadPullRequestLink } from "@t3tools/contracts";
import * as Clipboard from "expo-clipboard";

import * as Dialog from "../../components/ui/Dialog";
import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";
import { localizeMobileString } from "../../i18n/mobileStrings";
import { tryOpenExternalUrl } from "../../lib/openExternalUrl";
import type { MenuProps } from "../../components/ui/Menu.types";
import type { EnvironmentRuntimeState } from "../../state/remote-runtime-types";
import { useEnvironmentScope } from "../../state/session";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";

type MenuAction = MenuProps["actions"][number];

export function useLinkedPullRequestActions(input: {
  readonly thread: EnvironmentThreadShell | null;
  readonly project: EnvironmentProject | null;
  readonly runtime: EnvironmentRuntimeState | null;
}) {
  const { thread, project, runtime } = input;
  const terminology = sourceControlClients.get(project?.repositoryIdentity?.provider).changeRequest;
  const capabilities = runtime?.serverConfig?.environment.capabilities;
  const canOperate = useEnvironmentScope(
    thread?.environmentId ?? null,
    AuthOrchestrationOperateScope,
  );
  const canEdit = canOperate && capabilities !== undefined;
  const canWatch = canOperate && capabilities?.threadPullRequestWatch === true;
  const canStartWatch =
    canWatch &&
    thread !== null &&
    thread.archivedAt === null &&
    thread.settledAt === null &&
    thread.settledOverride !== "settled" &&
    thread.lineage.relationshipToParent !== "subagent";
  const link = useAtomCommand(threadEnvironment.linkPullRequest, { reportFailure: false });
  const unlink = useAtomCommand(threadEnvironment.unlinkPullRequest, { reportFailure: false });
  const watch = useAtomCommand(threadEnvironment.watchPullRequest, { reportFailure: false });

  const run = async (
    failureTitle: string,
    pending: Promise<AtomCommandResult<unknown, unknown>>,
  ) => {
    const result = await pending;
    if (result._tag === "Success" || isAtomCommandInterrupted(result)) return;
    const cause = squashAtomCommandFailure(result);
    Dialog.alertWithLiteralMessage(
      failureTitle,
      cause instanceof Error ? cause.message : localizeMobileString("Try again."),
    );
  };

  const setLinked = (
    reference: { host: string; repository: string; number: number; url: string },
    linked: boolean,
  ) => {
    if (thread === null) return;
    const mutation = planThreadPullRequestMutation({
      capabilities,
      threadId: thread.id,
      reference,
      linked,
    });
    if (mutation === null) return;
    const environmentId = thread.environmentId;
    void run(
      formatMobileMessage(linked ? "Couldn't link this {0}" : "Couldn't unlink this {0}", [
        localizeMobileString(terminology.singular),
      ]),
      mutation.type === "thread.pull-request.link"
        ? link({ environmentId, input: mutation.input })
        : unlink({ environmentId, input: mutation.input }),
    );
  };

  const promptLink = () => {
    const { singular } = terminology;
    const term = localizeMobileString(singular);
    const failureTitle = formatMobileMessage("Couldn't link this {0}", [term]);
    Dialog.prompt({
      title: formatMobileMessage("Link {0}", [term]),
      message: formatMobileMessage(
        "Paste a {0} URL, or enter 123 / #123 for this thread's repository.",
        [term],
      ),
      placeholder: formatMobileMessage("{0} URL or #42", [
        localizeMobileString(capitalizeTerm(singular)),
      ]),
      initialValue: "",
      confirmText: "Link",
      onConfirm: (reference) => {
        const resolved = resolveLinkPullRequestInput({
          reference,
          project: pullRequestLinkProject(project?.repositoryIdentity),
          hasProject: () => true,
          formatError: (template, values) =>
            formatMobileMessage(
              template,
              template ===
                "Paste the full {0} URL; this thread has no repository to resolve the number against." ||
                template === "Paste a full URL; this project's host has no known {0} URL."
                ? [term]
                : values,
            ),
        });
        if (resolved === null) {
          Dialog.alertWithLiteralMessage(
            failureTitle,
            formatMobileMessage("Use a {0} URL, 123, or #123.", [term]),
          );
          return;
        }
        if ("error" in resolved) {
          Dialog.alertWithLiteralMessage(failureTitle, resolved.error);
          return;
        }
        setLinked(resolved.link, true);
      },
    });
  };

  const menuActions = (link: ThreadPullRequestLink): MenuAction[] => {
    const open = link.snapshot === null || link.snapshot.state === "open";
    const watching = link.watch !== undefined;
    return [
      { id: "copy", title: "Copy link", image: "link" },
      { id: "browser", title: "Open in browser", image: "safari" },
      ...((watching ? canWatch : canStartWatch) && open
        ? [
            {
              id: "watch",
              title: watching ? "Stop watching" : "Watch for changes",
              image: watching ? "eye.slash" : "eye",
            },
          ]
        : []),
      ...(canEdit
        ? [
            {
              id: "unlink",
              title: link.source === "stack" ? "Dismiss from thread" : "Unlink from thread",
              image: "xmark",
              attributes: { destructive: true },
            },
          ]
        : []),
    ];
  };

  const onMenuAction = (link: ThreadPullRequestLink, action: string) => {
    if (action === "copy") void Clipboard.setStringAsync(link.url);
    else if (action === "browser")
      void tryOpenExternalUrl(link.url, "pull-request").then((opened) => {
        if (!opened) {
          const { shortLabel, singular } = (
            sourceControlClients.findByChangeRequestUrl(link.url) ??
            sourceControlClients.get(undefined)
          ).changeRequest;
          Dialog.alertWithLiteralMessage(
            formatMobileMessage("Unable to open {0}", [shortLabel]),
            formatMobileMessage("The {0} could not be opened.", [localizeMobileString(singular)]),
          );
        }
      });
    else if (action === "watch" && thread !== null)
      void run(
        "Couldn't change watching",
        watch({
          environmentId: thread.environmentId,
          input: {
            threadId: thread.id,
            host: link.host,
            repository: link.repository,
            number: link.number,
            watching: link.watch === undefined,
          },
        }),
      );
    else if (action === "unlink") setLinked(link, false);
  };

  return { canLink: canEdit, terminology, promptLink, menuActions, onMenuAction };
}

export type LinkedPullRequestActions = ReturnType<typeof useLinkedPullRequestActions>;
