import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import {
  getNewProjectRepository,
  type NewProjectPublishTarget,
} from "@t3tools/client-runtime/operations/projects";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";

import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import { waitForProject } from "~/state/entities";
import { projectEnvironment } from "~/state/projects";
import { sourceControlEnvironment } from "~/state/sourceControl";
import { useAtomCommand } from "~/state/use-atom-command";
import { useNewThreadHandler } from "./useHandleNewThread";
import { useI18n, type WebTranslate } from "~/i18n/WebI18nContext";

function errorMessage(error: unknown, t: WebTranslate): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : t("common.error");
}

export function useNewProject() {
  const { t } = useI18n();
  const createNew = useAtomCommand(projectEnvironment.createNew, { reportFailure: false });
  const publishRepository = useAtomCommand(sourceControlEnvironment.publishRepository, {
    reportFailure: false,
  });
  const handleNewThread = useNewThreadHandler();

  const publishNewRepository = async (input: {
    readonly environmentId: EnvironmentId;
    readonly workspaceRoot: string;
    readonly target: NewProjectPublishTarget;
  }) => {
    const { label } = input.target.definition;
    const result = await publishRepository({
      environmentId: input.environmentId,
      input: {
        cwd: input.workspaceRoot,
        provider: input.target.definition.kind,
        repository: getNewProjectRepository(input.target, input.workspaceRoot),
        visibility: "private",
      },
    });
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: t("newProject.repositoryError", { provider: label }),
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
        title: t("newProject.publishedRepository", { provider: label }),
        description: result.value.repository.nameWithOwner,
      }),
    );
  };

  return async (input: {
    readonly environmentId: EnvironmentId;
    readonly name: string;
    readonly publishTo: NewProjectPublishTarget | null;
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
    if (input.publishTo) {
      void publishNewRepository({
        environmentId: input.environmentId,
        workspaceRoot,
        target: input.publishTo,
      });
    }

    const projectRef = scopeProjectRef(input.environmentId, projectId);
    // Wait for the stored project path; drafts use it as their key.
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
  };
}
