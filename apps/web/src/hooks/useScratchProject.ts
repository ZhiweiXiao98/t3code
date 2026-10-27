import { RegistryContext } from "@effect/atom-react";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { availableScratchWorkspaceRoot } from "@t3tools/client-runtime/operations/projects";
import {
  isAtomCommandInterrupted,
  runAtomCommand,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import type { EnvironmentId } from "@t3tools/contracts";
import type { AtomRegistry } from "effect/reactivity";
import { useContext } from "react";

import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import { type EnvironmentPresentation, useEnvironments } from "~/state/environments";
import { projectEnvironment } from "~/state/projects";
import type { WebTranslate } from "~/i18n/WebI18nContext";
import { readWebI18n } from "~/i18n/readWebI18n";
import { type NewThreadHandler, useNewThreadHandler } from "./useHandleNewThread";

function reportScratchFailure(title: string, error: unknown, t: WebTranslate) {
  toastManager.add(
    stackedThreadToast({
      type: "error",
      title,
      description: error instanceof Error ? error.message : t("common.error"),
    }),
  );
}

type ScratchEnvironment = Pick<EnvironmentPresentation, "connection" | "serverConfig"> & {
  readonly environmentId: EnvironmentId;
};

export function createScratchProjectActions(input: {
  readonly environments: () => Iterable<ScratchEnvironment>;
  readonly registry: AtomRegistry.AtomRegistry;
  readonly handleNewThread: NewThreadHandler;
}) {
  const { t } = readWebI18n();
  const scratchWorkspaceRootFor = (environmentId: EnvironmentId | null): string | null => {
    let environment: ScratchEnvironment | undefined;
    for (const entry of input.environments()) {
      if (entry.environmentId === environmentId) environment = entry;
    }
    return availableScratchWorkspaceRoot(environment?.connection.phase, environment?.serverConfig);
  };

  const scratchEnvironmentId = (current: EnvironmentId | null): EnvironmentId | null => {
    if (current !== null) return scratchWorkspaceRootFor(current) !== null ? current : null;
    const offering = [...input.environments()].filter(
      (entry) => scratchWorkspaceRootFor(entry.environmentId) !== null,
    );
    return offering.length === 1 ? (offering[0]?.environmentId ?? null) : null;
  };

  const openScratchProject = async (
    environmentId: EnvironmentId,
    failureTitle = t("newProject.scratchError"),
  ): Promise<EnvironmentProject | null> => {
    const command = projectEnvironment.openScratch;
    const result = await runAtomCommand(
      input.registry,
      command,
      { environmentId, input: {} },
      { label: command.label, reportFailure: false, reportDefect: true },
    );
    if (result._tag === "Success") return result.value;
    if (!isAtomCommandInterrupted(result)) {
      reportScratchFailure(failureTitle, squashAtomCommandFailure(result), t);
    }
    return null;
  };

  const startScratchThread = async (environmentId: EnvironmentId) => {
    const project = await openScratchProject(environmentId);
    if (project) {
      await input
        .handleNewThread(scopeProjectRef(project.environmentId, project.id))
        .catch((error: unknown) => reportScratchFailure(t("newProject.scratchError"), error, t));
    }
  };

  return { scratchWorkspaceRootFor, scratchEnvironmentId, openScratchProject, startScratchThread };
}

export function useScratchProject() {
  const { environments } = useEnvironments();
  const registry = useContext(RegistryContext);
  const handleNewThread = useNewThreadHandler();
  return createScratchProjectActions({
    environments: () => environments,
    registry,
    handleNewThread,
  });
}
