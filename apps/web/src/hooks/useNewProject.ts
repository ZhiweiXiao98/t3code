import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { getNewProjectGitHubRepository } from "@t3tools/client-runtime/operations/projects";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { useCallback } from "react";

import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import { waitForProject } from "~/state/entities";
import { projectEnvironment } from "~/state/projects";
import { sourceControlEnvironment } from "~/state/sourceControl";
import { useAtomCommand } from "~/state/use-atom-command";
import { useNewThreadHandler } from "./useHandleNewThread";
import { useI18n, type WebTranslate } from "~/i18n/WebI18nProvider";

function errorMessage(error: unknown, t: WebTranslate): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : t("common.error");
}

/**
 * Starts a project from just a name. The server makes a folder under its
 * `newProjectsRoot` with a README, an icon, and a first commit; this then
 * opens a new thread draft in it. With `github`, it also publishes the
 * repository as private, without holding up the draft.
 *
 * Resolves to whether the project was created.
 */
export function useNewProject() {
  const { t } = useI18n();
  const createNew = useAtomCommand(projectEnvironment.createNew, { reportFailure: false });
  const publishRepository = useAtomCommand(sourceControlEnvironment.publishRepository, {
    reportFailure: false,
  });
  const handleNewThread = useNewThreadHandler();

  const publishToGitHub = useCallback(
    async (input: {
      readonly environmentId: EnvironmentId;
      readonly workspaceRoot: string;
      readonly account: string | null;
    }) => {
      const result = await publishRepository({
        environmentId: input.environmentId,
        input: {
          cwd: input.workspaceRoot,
          provider: "github",
          repository: getNewProjectGitHubRepository(input, input.workspaceRoot),
          visibility: "private",
        },
      });
      if (result._tag === "Failure") {
        if (!isAtomCommandInterrupted(result)) {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: t("newProject.gitHubError"),
              description: t("newProject.gitHubErrorDescription", {
                error: errorMessage(squashAtomCommandFailure(result), t),
              }),
            }),
          );
        }
        return;
      }
      toastManager.add(
        stackedThreadToast({
          type: "success",
          title: t("newProject.publishedGitHub"),
          description: result.value.repository.nameWithOwner,
        }),
      );
    },
    [publishRepository, t],
  );

  return useCallback(
    async (input: {
      readonly environmentId: EnvironmentId;
      readonly name: string;
      readonly github: { readonly account: string | null } | null;
    }): Promise<boolean> => {
      const result = await createNew({
        environmentId: input.environmentId,
        input: { name: input.name },
      });
      if (result._tag === "Failure") {
        if (!isAtomCommandInterrupted(result)) {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: t("newProject.createError"),
              description: errorMessage(squashAtomCommandFailure(result), t),
            }),
          );
        }
        return false;
      }

      const { projectId, workspaceRoot, commitError } = result.value;
      // The folder sits in T3 Code's data directory, so always say where.
      toastManager.add(
        stackedThreadToast(
          commitError === undefined
            ? {
                type: "success",
                title: t("newProject.created", { name: input.name }),
                description: workspaceRoot,
              }
            : {
                type: "warning",
                title: t("newProject.createdWithoutCommit", { name: input.name }),
                description: t("newProject.commitErrorDescription", {
                  error: commitError,
                  path: workspaceRoot,
                }),
              },
        ),
      );
      if (input.github) {
        void publishToGitHub({
          environmentId: input.environmentId,
          workspaceRoot,
          account: input.github.account,
        });
      }

      const projectRef = scopeProjectRef(input.environmentId, projectId);
      // Drafts key off the project's stored path, so wait for the create event
      // to reach the store before opening one.
      const project = await waitForProject(projectRef).catch((error: unknown) => {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: t("newProject.openError"),
            description: t("newProject.openErrorDescription", { error: errorMessage(error, t) }),
          }),
        );
        return null;
      });
      if (project === null) return true;
      await handleNewThread(projectRef).catch((error: unknown) => {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: t("newProject.openError"),
            description: errorMessage(error, t),
          }),
        );
      });
      return true;
    },
    [createNew, handleNewThread, publishToGitHub, t],
  );
}
