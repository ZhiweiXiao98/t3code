import { createFilesystemEnvironmentAtoms } from "@t3tools/client-runtime/state/filesystem";
import { useI18n } from "../i18n/WebI18nContext";
import { resolveLocalizedFilesystemReadAccess } from "../i18n/queryFailureMessages";
import type { EnvironmentId } from "@t3tools/contracts";

import { connectionAtomRuntime } from "../connection/runtime";
import { useEnvironmentPresentation } from "./presentation";
import { useEnvironmentQuery } from "./query";
import { environmentSession } from "./session";

export const filesystemEnvironment = createFilesystemEnvironmentAtoms(connectionAtomRuntime);

export function useFilesystemReadAccess(environmentId: EnvironmentId | null) {
  const { locale } = useI18n();
  const session = useEnvironmentQuery(
    environmentId === null ? null : environmentSession.sessionStateAtom(environmentId),
  );
  const environment = useEnvironmentPresentation(environmentId);
  return resolveLocalizedFilesystemReadAccess(locale, {
    isCatalogReady: environment.isReady,
    connection: environment.presentation?.connection ?? null,
    session: session.data,
    sessionError: session.error,
  });
}
