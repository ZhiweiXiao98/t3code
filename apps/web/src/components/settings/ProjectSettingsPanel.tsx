import { useAtomValue } from "@effect/atom-react";
import {
  isAtomCommandInterrupted,
  mapAtomCommandResult,
  settlePromise,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { AsyncResult } from "effect/unstable/reactivity";
import {
  deriveProjectGroupingOverrideKey,
  selectProjectGroupingSettings,
} from "../../logicalProject";
import type {
  ContextMenuItem,
  ModelSelection,
  ProjectIconOverride,
  ProviderDriverKind,
  SidebarProjectGroupingMode,
  T3ProjectFileScript,
  ThreadEnvMode,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { useCanGoBack, useNavigate } from "@tanstack/react-router";
import * as Cause from "effect/Cause";
import { ChevronDownIcon, CopyIcon, PlusIcon, SettingsIcon, Trash2Icon } from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { useComposerDraftStore } from "../../composerDraftStore";
import { isElectron } from "../../env";
import {
  useClientSettings,
  useEnvironmentSettings,
  useUpdateClientSettings,
  usePrimarySettings,
} from "../../hooks/useSettings";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { useT3ProjectFileState } from "../../hooks/useT3ProjectFileScripts";
import { shortcutLabelForCommand } from "../../keybindings";
import { keybindingValueForCommand } from "../../lib/projectScriptKeybindings";
import { releaseProjectDraftUploads } from "../../lib/composerDraftUploads";
import { readLocalApi } from "../../localApi";
import {
  buildProjectScript,
  commandForProjectScript,
  nextProjectScriptId,
} from "../../projectScripts";
import { decodeProjectScriptKeybindingRule } from "../../lib/projectScriptKeybindings";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  resolveDefaultProviderModelSelection,
  sortProviderInstanceEntries,
} from "../../providerInstances";
import { getCustomModelOptionsByInstance } from "../../modelSelection";
import {
  buildSidebarProjectSnapshots,
  type SidebarProjectGroupMember,
  type SidebarProjectSnapshot,
} from "../../sidebarProjectGrouping";
import { useEnvironments, usePrimaryEnvironmentId } from "../../state/environments";
import { useProjects, useThreadShells } from "../../state/entities";
import { projectEnvironment } from "../../state/projects";
import { EMPTY_SERVER_PROVIDERS, serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import { TraitsPicker } from "../chat/TraitsPicker";
import { ProjectFavicon } from "../ProjectFavicon";
import {
  EMPTY_PROJECT_SCRIPT_INPUT,
  editorRequestForScript,
  ProjectScriptEditorDialog,
  ScriptIcon,
  type NewProjectScriptInput,
  type ProjectScriptEditorRequest,
} from "../projectScriptEditor";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SidebarInset } from "../ui/sidebar";
import { Switch } from "../ui/switch";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  WorkspaceBreadcrumb,
  WorkspaceBreadcrumbItem,
  WorkspaceBreadcrumbSeparator,
} from "../WorkspaceBreadcrumb";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import {
  SETTINGS_PICKER_TRIGGER_CLASSNAME,
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";
import {
  canPickExternalProjectFavicon,
  ProjectFaviconPickerDialog,
} from "./ProjectFaviconPickerDialog";
import { projectGroupTitleNeedsUpdate } from "./ProjectSettingsPanel.logic";
import { useI18n } from "../../i18n/WebI18nProvider";

const ProjectIconPickerDialog = lazy(() =>
  import("./ProjectIconPickerDialog").then((module) => ({
    default: module.ProjectIconPickerDialog,
  })),
);

export const PROJECT_GROUPING_MODE_LABELS: Record<SidebarProjectGroupingMode, string> = {
  repository: "Group by repository",
  repository_path: "Group by repository path",
  separate: "Keep separate",
};

/** Logical project groups for the settings page, sorted by display name. */
export function useSettingsProjectGroups(): SidebarProjectSnapshot[] {
  const projects = useProjects();
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { environments } = useEnvironments();
  const environmentLabelById = useMemo(
    () =>
      new Map(
        environments.map((environment) => [environment.environmentId, environment.label] as const),
      ),
    [environments],
  );
  return useMemo(
    () =>
      buildSidebarProjectSnapshots({
        projects,
        settings: projectGroupingSettings,
        primaryEnvironmentId,
        resolveEnvironmentLabel: (environmentId) => environmentLabelById.get(environmentId) ?? null,
      }).sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [environmentLabelById, primaryEnvironmentId, projectGroupingSettings, projects],
  );
}

function memberKey(member: { environmentId: string; id: string }): string {
  return `${member.environmentId}:${member.id}`;
}

export function ProjectSettingsPage({ projectKey }: { projectKey: string }) {
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  const navigateBackWithinApp = useCallback(() => {
    if (canGoBack) {
      window.history.back();
      return;
    }
    void navigate({ to: "/" });
  }, [canGoBack, navigate]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key !== "Escape") return;
      event.preventDefault();
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement) {
        activeElement.blur();
      }
      navigateBackWithinApp();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigateBackWithinApp]);

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground isolate">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
        <WorkspacePageHeader electron={isElectron}>
          <ProjectSettingsBreadcrumb projectKey={projectKey} />
        </WorkspacePageHeader>
        <ProjectSettingsPanel projectKey={projectKey} />
      </div>
    </SidebarInset>
  );
}

function ProjectSettingsBreadcrumb({ projectKey }: { projectKey: string }) {
  const { t } = useI18n();
  const groups = useSettingsProjectGroups();
  const navigate = useNavigate();
  const selected = groups.find((group) => group.projectKey === projectKey) ?? null;
  const openProjectMenu = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const api = readLocalApi();
    if (!api) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const items: ContextMenuItem<string>[] = groups.map((group) => ({
      id: group.projectKey,
      label: group.displayName,
    }));
    void settlePromise(() =>
      api.contextMenu.show(items, { x: rect.left, y: rect.bottom + 4 }),
    ).then((clicked) => {
      if (clicked._tag === "Failure" || clicked.value === null) return;
      void navigate({
        to: "/projects/$projectKey",
        params: { projectKey: clicked.value },
        replace: true,
        hashScrollIntoView: false,
      });
    });
  };

  return (
    <WorkspaceBreadcrumb ariaLabel={t("projectSettings.breadcrumb")}>
      <WorkspaceBreadcrumbItem>{t("projectSettings.projects")}</WorkspaceBreadcrumbItem>
      <WorkspaceBreadcrumbSeparator />
      <WorkspaceBreadcrumbItem current>
        {selected ? (
          <button
            type="button"
            aria-haspopup="menu"
            aria-label={t("projectSettings.switchProject")}
            onClick={openProjectMenu}
            className="group/project-title inline-flex min-w-0 max-w-64 cursor-pointer items-center gap-1 rounded-sm text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="min-w-0 truncate">{selected.displayName}</span>
            <ChevronDownIcon
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/project-title:opacity-100 group-focus-visible/project-title:opacity-100"
            />
          </button>
        ) : (
          <span className="truncate text-muted-foreground">{t("projectSettings.unavailable")}</span>
        )}
      </WorkspaceBreadcrumbItem>
    </WorkspaceBreadcrumb>
  );
}

export function ProjectSettingsPanel({ projectKey }: { projectKey: string }) {
  const { t } = useI18n();
  const groups = useSettingsProjectGroups();
  const navigate = useNavigate();

  const selected = groups.find((group) => group.projectKey === projectKey) ?? null;

  // Remember the members of the last rendered group so a grouping-rule change
  // (which changes the group key) can follow the project to its new group.
  const lastSelectionRef = useRef<{ key: string; memberKeys: string[] } | null>(null);
  useEffect(() => {
    if (!selected) return;
    lastSelectionRef.current = {
      key: selected.projectKey,
      memberKeys: selected.memberProjects.map((member) => member.physicalProjectKey),
    };
  }, [selected]);

  // A grouping-rule change replaces the group key mid-visit; follow the
  // project to its new key instead of parking on the not-found state.
  useEffect(() => {
    if (selected !== null) return;
    const last = lastSelectionRef.current;
    if (last?.key !== projectKey) return;
    const successor = groups.find((group) =>
      group.memberProjects.some((member) => last.memberKeys.includes(member.physicalProjectKey)),
    );
    if (successor) {
      void navigate({
        to: "/projects/$projectKey",
        params: { projectKey: successor.projectKey },
        replace: true,
        hashScrollIntoView: false,
      });
    }
  }, [groups, navigate, projectKey, selected]);

  if (!selected) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        {groups.length === 0 ? t("projectSettings.empty") : t("projectSettings.removed")}
      </div>
    );
  }
  return <ProjectDetail key={selected.projectKey} group={selected} />;
}

function ProjectDetail({ group }: { group: SidebarProjectSnapshot }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const representative =
    group.memberProjects.find(
      (member) => member.environmentId === group.environmentId && member.id === group.id,
    ) ?? group.memberProjects[0]!;
  const settings = usePrimarySettings();
  // Provider instances and model options belong to the environment that runs
  // the project's threads. The hosted app has no primary environment, so
  // reading them from there would show "No providers available" everywhere.
  const projectSettings = useEnvironmentSettings(representative.environmentId);
  const serverProviders =
    useAtomValue(serverEnvironment.providersValueAtom(representative.environmentId)) ??
    EMPTY_SERVER_PROVIDERS;
  const updateClientSettings = useUpdateClientSettings();
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  const threads = useThreadShells();
  const updateProject = useAtomCommand(projectEnvironment.update, { reportFailure: false });
  const deleteProject = useAtomCommand(projectEnvironment.delete, { reportFailure: false });
  const upsertKeybinding = useAtomCommand(serverEnvironment.upsertKeybinding, {
    reportFailure: false,
  });
  const removeKeybinding = useAtomCommand(serverEnvironment.removeKeybinding, {
    reportFailure: false,
  });
  const projectNameEditedRef = useRef(false);
  const { copyToClipboard: copyPathToClipboard } = useCopyToClipboard<{ path: string }>({
    onCopy: ({ path }) => {
      toastManager.add({
        type: "success",
        title: t("projectSettings.pathCopied"),
        description: path,
      });
    },
    onError: (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: t("projectSettings.copyPathFailed"),
          description: error instanceof Error ? error.message : t("common.error"),
        }),
      );
    },
  });

  const faviconPath = representative.faviconPath ?? null;
  const projectIcon = representative.projectIcon ?? null;
  const pickProjectFavicon =
    typeof window !== "undefined" &&
    group.memberProjects.every(
      (member) =>
        member.environmentId === primaryEnvironmentId &&
        canPickExternalProjectFavicon(member.workspaceRoot, navigator.platform),
    )
      ? window.desktopBridge?.pickProjectFavicon
      : undefined;

  const threadCountByMember = useMemo(() => {
    const counts = new Map<string, number>();
    for (const thread of threads) {
      const key = `${thread.environmentId}:${thread.projectId}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [threads]);
  const reportFailure = useCallback(
    (title: string, result: AtomCommandResult<void, unknown>) => {
      if (result._tag !== "Failure" || isAtomCommandInterrupted(result)) return;
      const error = squashAtomCommandFailure(result);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title,
          description: error instanceof Error ? error.message : t("common.error"),
        }),
      );
    },
    [t],
  );

  // Group-shared fields live on each physical project record, so a
  // group-level edit fans out to every member.
  const updateAllMembers = useCallback(
    async (
      input: Partial<{
        title: string;
        defaultModelSelection: ModelSelection | null;
        defaultThreadEnvMode: ThreadEnvMode | null;
        autoPull: boolean;
        faviconPath: string | null;
        projectIcon: ProjectIconOverride | null;
      }>,
      failureTitle: string,
    ): Promise<AtomCommandResult<void, unknown>> => {
      for (const member of group.memberProjects) {
        const result = mapAtomCommandResult(
          await updateProject({
            environmentId: member.environmentId,
            input: { projectId: member.id, ...input },
          }),
          () => undefined,
        );
        if (result._tag === "Failure") {
          // A partial fan-out is possible: earlier members already took the
          // write. Name the environment so the user knows where it stopped.
          reportFailure(
            group.memberProjects.length > 1
              ? t("projectSettings.failureOnEnvironment", {
                  failure: failureTitle,
                  environment: member.environmentLabel ?? t("projectSettings.currentEnvironment"),
                })
              : failureTitle,
            result,
          );
          return result;
        }
      }
      return AsyncResult.success(undefined);
    },
    [group.memberProjects, reportFailure, t, updateProject],
  );

  const renameGroup = useCallback(
    async (nextTitle: string, wasEdited: boolean) => {
      const title = nextTitle.trim();
      if (!title) {
        toastManager.add({ type: "warning", title: t("projectSettings.titleEmpty") });
        return;
      }
      if (
        !projectGroupTitleNeedsUpdate(
          group.memberProjects.map((member) => member.title),
          title,
          wasEdited,
        )
      ) {
        return;
      }
      await updateAllMembers({ title }, t("projectSettings.renameFailed"));
    },
    [group.memberProjects, t, updateAllMembers],
  );

  // ----- default model -----
  const storedSelection = representative.defaultModelSelection;
  const resolvedSelection = resolveDefaultProviderModelSelection(serverProviders, storedSelection);
  const resolvedInstanceId = resolvedSelection?.instanceId ?? null;
  const resolvedModel = resolvedSelection?.model ?? null;
  const instanceEntries = useMemo(
    () =>
      sortProviderInstanceEntries(
        applyProviderInstanceSettings(
          deriveProviderInstanceEntries(serverProviders),
          projectSettings,
        ),
      ),
    [serverProviders, projectSettings],
  );
  const modelOptionsByInstance = useMemo(
    () =>
      getCustomModelOptionsByInstance(
        projectSettings,
        serverProviders,
        resolvedInstanceId,
        resolvedModel,
      ),
    [resolvedInstanceId, resolvedModel, serverProviders, projectSettings],
  );
  const activeEntry = instanceEntries.find((entry) => entry.instanceId === resolvedInstanceId);
  const setDefaultModel = useCallback(
    (selection: ModelSelection | null) =>
      void updateAllMembers(
        { defaultModelSelection: selection },
        t("projectSettings.modelUpdateFailed"),
      ),
    [t, updateAllMembers],
  );

  // ----- new-thread workspace mode -----
  const storedEnvMode = representative.defaultThreadEnvMode ?? null;
  const setDefaultThreadEnvMode = useCallback(
    (mode: ThreadEnvMode | null) =>
      void updateAllMembers(
        { defaultThreadEnvMode: mode },
        t("projectSettings.workspaceUpdateFailed"),
      ),
    [t, updateAllMembers],
  );

  const autoPull = representative.autoPull ?? false;
  const setAutoPull = useCallback(
    (enabled: boolean) =>
      void updateAllMembers({ autoPull: enabled }, t("projectSettings.autoPullUpdateFailed")),
    [t, updateAllMembers],
  );

  // ----- project icon -----
  const [faviconPickerOpen, setFaviconPickerOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [isSavingFavicon, setIsSavingFavicon] = useState(false);
  const savingFaviconRef = useRef(false);
  const setProjectIcon = useCallback(
    async (input: { faviconPath: string | null; projectIcon: ProjectIconOverride | null }) => {
      if (savingFaviconRef.current) return;
      savingFaviconRef.current = true;
      setIsSavingFavicon(true);
      try {
        await updateAllMembers(input, t("projectSettings.iconUpdateFailed"));
      } finally {
        savingFaviconRef.current = false;
        setIsSavingFavicon(false);
      }
    },
    [t, updateAllMembers],
  );

  // ----- checkout selection and scripts -----
  const [selectedCheckoutKey, setSelectedCheckoutKey] = useState(representative.physicalProjectKey);
  const selectedCheckout =
    group.memberProjects.find((member) => member.physicalProjectKey === selectedCheckoutKey) ??
    representative;
  const selectedServerConfig = useAtomValue(
    serverEnvironment.configValueAtom(selectedCheckout.environmentId),
  );
  const keybindings = selectedServerConfig?.keybindings ?? DEFAULT_RESOLVED_KEYBINDINGS;
  const scripts = selectedCheckout.scripts;
  const [editorRequest, setEditorRequest] = useState<ProjectScriptEditorRequest | null>(null);
  // Script writes replace the whole array, so two overlapping writes computed
  // from the same snapshot would drop each other's changes. One at a time.
  const [isSavingScripts, setIsSavingScripts] = useState(false);
  const savingScriptsRef = useRef(false);
  const t3File = useT3ProjectFileState(
    selectedCheckout.environmentId,
    selectedCheckout.workspaceRoot,
  );
  // What the "Default" option resolves to while no override is set: the
  // repo's t3.json value when present, otherwise the global setting.
  const inheritedEnvMode = t3File.file?.defaultThreadEnvMode ?? settings.defaultThreadEnvMode;
  const inheritedEnvModeSource = t3File.file?.defaultThreadEnvMode != null ? "t3.json" : "global";
  const importableScripts = useMemo(
    () =>
      t3File.scripts.filter(
        (fileScript) =>
          !scripts.some(
            (script) =>
              script.command === fileScript.command ||
              script.name.toLowerCase() === fileScript.name.toLowerCase(),
          ),
      ),
    [scripts, t3File.scripts],
  );

  const persistScripts = useCallback(
    async (
      nextScripts: ReadonlyArray<ReturnType<typeof buildProjectScript>>,
      keybinding: string | null | undefined,
      keybindingCommand: ReturnType<typeof commandForProjectScript>,
    ): Promise<AtomCommandResult<void, unknown>> => {
      if (savingScriptsRef.current) {
        return AsyncResult.failure(Cause.fail(new Error(t("projectSettings.scriptSaving"))));
      }
      savingScriptsRef.current = true;
      setIsSavingScripts(true);
      try {
        // Captured before the write so a cleared or deleted binding can be
        // removed from the keybindings config afterwards.
        const previousKeybinding = keybindingValueForCommand(keybindings, keybindingCommand);
        const updateResult = mapAtomCommandResult(
          await updateProject({
            environmentId: selectedCheckout.environmentId,
            input: { projectId: selectedCheckout.id, scripts: nextScripts },
          }),
          () => undefined,
        );
        if (updateResult._tag === "Failure") {
          reportFailure(t("projectSettings.scriptsSaveFailed"), updateResult);
          return updateResult;
        }

        const keybindingRule = decodeProjectScriptKeybindingRule({
          keybinding,
          command: keybindingCommand,
        });
        if (!isElectron) return updateResult;
        const environmentIds = [selectedCheckout.environmentId];
        const previousTarget = previousKeybinding
          ? decodeProjectScriptKeybindingRule({
              keybinding: previousKeybinding,
              command: keybindingCommand,
            })
          : null;
        if (keybindingRule) {
          // `replace` swaps the command's previous rule instead of appending a
          // second one that would keep the old shortcut alive.
          const input =
            previousTarget && previousTarget.key !== keybindingRule.key
              ? { ...keybindingRule, replace: previousTarget }
              : keybindingRule;
          for (const environmentId of environmentIds) {
            const result = mapAtomCommandResult(
              await upsertKeybinding({ environmentId, input }),
              () => undefined,
            );
            if (result._tag === "Failure") {
              reportFailure(t("projectSettings.keybindingSaveFailed"), result);
              return result;
            }
          }
        } else if (previousTarget) {
          for (const environmentId of environmentIds) {
            const result = mapAtomCommandResult(
              await removeKeybinding({ environmentId, input: previousTarget }),
              () => undefined,
            );
            if (result._tag === "Failure") {
              reportFailure(t("projectSettings.keybindingRemoveFailed"), result);
              return result;
            }
          }
        }
        return updateResult;
      } finally {
        savingScriptsRef.current = false;
        setIsSavingScripts(false);
      }
    },
    [
      keybindings,
      removeKeybinding,
      reportFailure,
      selectedCheckout.environmentId,
      selectedCheckout.id,
      t,
      updateProject,
      upsertKeybinding,
    ],
  );

  const submitScript = useCallback(
    async (
      scriptId: string | null,
      input: NewProjectScriptInput,
    ): Promise<AtomCommandResult<void, unknown>> => {
      if (scriptId === null) {
        const nextId = nextProjectScriptId(
          input.name,
          scripts.map((script) => script.id),
        );
        const nextScript = buildProjectScript(nextId, input);
        const nextScripts = input.runOnWorktreeCreate
          ? [
              ...scripts.map((script) =>
                script.runOnWorktreeCreate ? { ...script, runOnWorktreeCreate: false } : script,
              ),
              nextScript,
            ]
          : [...scripts, nextScript];
        return persistScripts(nextScripts, input.keybinding, commandForProjectScript(nextId));
      }

      const updatedScript = buildProjectScript(scriptId, input);
      const nextScripts = scripts.map((script) =>
        script.id === scriptId
          ? updatedScript
          : input.runOnWorktreeCreate
            ? { ...script, runOnWorktreeCreate: false }
            : script,
      );
      return persistScripts(nextScripts, input.keybinding, commandForProjectScript(scriptId));
    },
    [persistScripts, scripts],
  );

  const deleteScript = useCallback(
    (scriptId: string) => {
      const nextScripts = scripts.filter((script) => script.id !== scriptId);
      void persistScripts(nextScripts, null, commandForProjectScript(scriptId));
    },
    [persistScripts, scripts],
  );

  const importFileScript = useCallback(
    async (fileScript: T3ProjectFileScript) => {
      const payload: NewProjectScriptInput = {
        name: fileScript.name,
        command: fileScript.command,
        icon: fileScript.icon ?? "play",
        runOnWorktreeCreate: fileScript.runOnWorktreeCreate ?? false,
        keybinding: null,
        previewUrl: fileScript.previewUrl ?? null,
        autoOpenPreview: fileScript.previewUrl ? (fileScript.autoOpenPreview ?? false) : false,
      };
      const result = await submitScript(null, payload);
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        setEditorRequest({
          scriptId: null,
          initial: payload,
          error: error instanceof Error ? error.message : t("projectSettings.importFailed"),
        });
      }
    },
    [submitScript, t],
  );

  // ----- checkouts -----
  const updateGroupingPreference = useCallback(
    (member: SidebarProjectGroupMember, selection: SidebarProjectGroupingMode | "inherit") => {
      const overrideKey = deriveProjectGroupingOverrideKey(member);
      const nextOverrides = { ...projectGroupingSettings.sidebarProjectGroupingOverrides };
      if (selection === "inherit") {
        delete nextOverrides[overrideKey];
      } else {
        nextOverrides[overrideKey] = selection;
      }
      updateClientSettings({ sidebarProjectGroupingOverrides: nextOverrides });
    },
    [projectGroupingSettings.sidebarProjectGroupingOverrides, updateClientSettings],
  );

  const removeMembers = useCallback(
    async (members: ReadonlyArray<SidebarProjectGroupMember>) => {
      const api = readLocalApi();
      if (!api) return;

      const memberKeys = new Set(members.map(memberKey));
      const projectThreads = threads.filter((thread) =>
        memberKeys.has(`${thread.environmentId}:${thread.projectId}`),
      );
      const isWholeGroup = members.length === group.memberProjects.length;
      const singleMember = members.length === 1 ? members[0]! : null;
      const targetLabel = singleMember?.title ?? group.displayName;
      const confirmed = await settlePromise(() =>
        api.dialogs.confirm(
          [
            projectThreads.length > 0
              ? t("projectSettings.removeConfirmWithThreads", {
                  name: targetLabel,
                  count: projectThreads.length,
                })
              : t("projectSettings.removeConfirm", { name: targetLabel }),
            ...(singleMember
              ? [
                  t("projectSettings.path", { path: singleMember.workspaceRoot }),
                  ...(singleMember.environmentLabel
                    ? [
                        t("projectSettings.environment", {
                          environment: singleMember.environmentLabel,
                        }),
                      ]
                    : []),
                ]
              : [t("projectSettings.removeGroupedEntries", { count: members.length })]),
            ...(projectThreads.length > 0
              ? [t("projectSettings.clearHistoryWithArchived")]
              : [t("projectSettings.clearArchivedHistory")]),
            isWholeGroup
              ? t("projectSettings.removeEntriesOnly")
              : t("projectSettings.otherEntriesUnaffected"),
            t("projectSettings.cannotUndo"),
          ].join("\n"),
          { variant: "destructive" },
        ),
      );
      if (confirmed._tag === "Failure" || !confirmed.value) return;

      const draftStore = useComposerDraftStore.getState();
      for (const member of members) {
        const memberThreads = projectThreads.filter(
          (thread) =>
            thread.environmentId === member.environmentId && thread.projectId === member.id,
        );
        const result = mapAtomCommandResult(
          await deleteProject({
            environmentId: member.environmentId,
            input: {
              projectId: member.id,
              force: true,
            },
          }),
          () => undefined,
        );
        if (result._tag === "Failure") {
          reportFailure(t("projectSettings.removeFailed", { name: member.title }), result);
          return;
        }
        const projectRef = scopeProjectRef(member.environmentId, member.id);
        releaseProjectDraftUploads(
          projectRef,
          memberThreads.map((thread) => scopeThreadRef(thread.environmentId, thread.id)),
        );
        const projectDraftThread = draftStore.getDraftThreadByProjectRef(projectRef);
        if (projectDraftThread) {
          draftStore.clearDraftThread(projectDraftThread.draftId);
        }
        draftStore.clearProjectDraftThreadId(projectRef);
      }

      // The project's settings page just deleted itself; there is no projects
      // listing to fall back to, so leave settings entirely.
      if (isWholeGroup) {
        void navigate({ to: "/", replace: true });
      }
    },
    [
      deleteProject,
      group.displayName,
      group.memberProjects.length,
      navigate,
      reportFailure,
      t,
      threads,
    ],
  );

  const selectedCheckoutThreadCount = threadCountByMember.get(memberKey(selectedCheckout)) ?? 0;
  const selectedCheckoutGrouping =
    projectGroupingSettings.sidebarProjectGroupingOverrides?.[
      deriveProjectGroupingOverrideKey(selectedCheckout)
    ] ?? "inherit";
  const selectedCheckoutLabel =
    selectedCheckout.environmentLabel ?? t("projectSettings.thisMachine");
  const groupingModeLabels: Record<SidebarProjectGroupingMode, string> = {
    repository: t("projectSettings.groupByRepository"),
    repository_path: t("projectSettings.groupByRepositoryPath"),
    separate: t("projectSettings.keepSeparate"),
  };
  const envModeLabel = (mode: ThreadEnvMode) =>
    mode === "worktree" ? t("projectSettings.worktree") : t("projectSettings.local");

  return (
    <>
      <SettingsPageContainer width="wide" className="gap-8">
        <SettingsSection title={t("projectSettings.section.project")}>
          <SettingsRow
            title={t("projectSettings.name")}
            description={t("projectSettings.nameDescription")}
            control={
              <Input
                key={`${group.projectKey}:${group.displayName}`}
                size="sm"
                className="w-full sm:w-64"
                aria-label={t("projectSettings.projectName")}
                defaultValue={group.displayName}
                onChange={() => {
                  projectNameEditedRef.current = true;
                }}
                onBlur={(event) => {
                  const wasEdited = projectNameEditedRef.current;
                  projectNameEditedRef.current = false;
                  void renameGroup(event.currentTarget.value, wasEdited);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
            }
          />
          <SettingsRow
            title={t("projectSettings.icon")}
            description={
              projectIcon?.kind === "lucide"
                ? `${projectIcon.name} · ${projectIcon.color}`
                : projectIcon?.kind === "emoji"
                  ? projectIcon.emoji
                  : (faviconPath ?? t("projectSettings.automatic"))
            }
            resetAction={
              faviconPath !== null || projectIcon !== null ? (
                <SettingResetButton
                  label="project icon"
                  disabled={isSavingFavicon}
                  onClick={() => void setProjectIcon({ faviconPath: null, projectIcon: null })}
                />
              ) : null
            }
            control={
              <div className="flex items-center gap-2">
                <ProjectFavicon
                  environmentId={representative.environmentId}
                  cwd={representative.workspaceRoot}
                  projectName={representative.title}
                  faviconPath={faviconPath}
                  projectIcon={projectIcon}
                  className="size-6"
                />
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  aria-label={t("projectSettings.chooseBuiltInIcon")}
                  disabled={isSavingFavicon}
                  onClick={() => setIconPickerOpen(true)}
                >
                  {t("projectSettings.chooseBuiltInIcon")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  aria-label={t("projectSettings.chooseIcon")}
                  disabled={isSavingFavicon}
                  onClick={() => setFaviconPickerOpen(true)}
                >
                  {t("projectSettings.chooseFile")}
                </Button>
              </div>
            }
          />
          <SettingsRow
            title={t("projectSettings.model")}
            description={t("projectSettings.modelDescription")}
            resetAction={
              storedSelection !== null ? (
                <SettingResetButton
                  label="project default model"
                  onClick={() => setDefaultModel(null)}
                />
              ) : null
            }
            control={
              resolvedSelection && activeEntry ? (
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <ProviderModelPicker
                    activeInstanceId={resolvedSelection.instanceId}
                    model={resolvedSelection.model}
                    lockedProvider={null}
                    instanceEntries={instanceEntries}
                    modelOptionsByInstance={modelOptionsByInstance}
                    triggerVariant="outline"
                    triggerClassName={SETTINGS_PICKER_TRIGGER_CLASSNAME}
                    onOpenProviderSetup={(instanceId) => {
                      void navigate({
                        to: "/settings/providers",
                        search: { environmentId: representative.environmentId, instanceId },
                      });
                    }}
                    onInstanceModelChange={(instanceId, model) => {
                      setDefaultModel(createModelSelection(instanceId, model));
                    }}
                  />
                  <TraitsPicker
                    provider={activeEntry.driverKind as ProviderDriverKind}
                    models={activeEntry.models}
                    model={resolvedSelection.model}
                    prompt=""
                    onPromptChange={() => {}}
                    modelOptions={resolvedSelection.options ?? []}
                    allowPromptInjectedEffort={false}
                    planModeEnabled={projectSettings.planModeEnabled}
                    triggerVariant="outline"
                    triggerClassName={SETTINGS_PICKER_TRIGGER_CLASSNAME}
                    onModelOptionsChange={(nextOptions) => {
                      setDefaultModel(
                        createModelSelection(
                          resolvedSelection.instanceId,
                          resolvedSelection.model,
                          nextOptions,
                        ),
                      );
                    }}
                  />
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">
                  {t("projectSettings.noProviders")}
                </span>
              )
            }
          />
          <SettingsRow
            title={t("projectSettings.workspace")}
            description={t("projectSettings.workspaceDescription")}
            resetAction={
              storedEnvMode !== null ? (
                <SettingResetButton
                  label="project workspace default"
                  onClick={() => setDefaultThreadEnvMode(null)}
                />
              ) : null
            }
            control={
              <Select
                value={storedEnvMode ?? "inherit"}
                onValueChange={(value) => {
                  if (value === "worktree" || value === "local") {
                    setDefaultThreadEnvMode(value);
                  } else if (value === "inherit") {
                    setDefaultThreadEnvMode(null);
                  }
                }}
              >
                <SelectTrigger size="sm" aria-label={t("projectSettings.newThreadWorkspace")}>
                  <SelectValue>
                    {storedEnvMode === null
                      ? group.memberProjects.length > 1
                        ? t("projectSettings.defaultPerCheckout")
                        : t("projectSettings.defaultValue", {
                            value: envModeLabel(inheritedEnvMode),
                          })
                      : envModeLabel(storedEnvMode)}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem value="inherit">
                    {group.memberProjects.length > 1
                      ? t("projectSettings.defaultEachCheckout")
                      : t("projectSettings.defaultSource", {
                          source:
                            inheritedEnvModeSource === "global"
                              ? t("projectSettings.global")
                              : inheritedEnvModeSource,
                          value: envModeLabel(inheritedEnvMode),
                        })}
                  </SelectItem>
                  <SelectItem value="worktree">{envModeLabel("worktree")}</SelectItem>
                  <SelectItem value="local">{envModeLabel("local")}</SelectItem>
                </SelectPopup>
              </Select>
            }
          />
          <SettingsRow
            title={t("projectSettings.autoPull")}
            description={t("projectSettings.autoPullDescription")}
            control={
              <Switch
                checked={autoPull}
                aria-label={t("projectSettings.autoPullAria")}
                onCheckedChange={setAutoPull}
              />
            }
          />
        </SettingsSection>

        <SettingsSection
          title={t("projectSettings.section.checkout")}
          headerAction={
            <Select
              value={selectedCheckout.physicalProjectKey}
              onValueChange={(value) => setSelectedCheckoutKey(String(value))}
            >
              <SelectTrigger
                size="sm"
                className="max-w-64"
                aria-label={t("projectSettings.selectedCheckout")}
              >
                <SelectValue>{selectedCheckoutLabel}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {group.memberProjects.map((member) => (
                  <SelectItem
                    key={member.physicalProjectKey}
                    hideIndicator
                    value={member.physicalProjectKey}
                  >
                    {member.environmentLabel ?? t("projectSettings.thisMachine")} ·{" "}
                    {member.workspaceRoot}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        >
          <div className="px-3 py-2 sm:px-4">
            <div className="flex min-w-0 items-center rounded-lg bg-muted/30 p-1 text-base text-muted-foreground sm:text-sm">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      aria-label={t("projectSettings.copyCheckoutPath")}
                      className="group flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left outline-none hover:bg-accent/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      type="button"
                      onClick={() =>
                        copyPathToClipboard(selectedCheckout.workspaceRoot, {
                          path: selectedCheckout.workspaceRoot,
                        })
                      }
                    >
                      <code className="min-w-0 flex-1 truncate font-mono">
                        {selectedCheckout.workspaceRoot}
                      </code>
                      <CopyIcon className="size-4 shrink-0 opacity-60 group-hover:opacity-100" />
                    </button>
                  }
                />
                <TooltipPopup side="top">{t("projectSettings.copyPath")}</TooltipPopup>
              </Tooltip>
              <div className="shrink-0 border-l border-border/60 px-2 tabular-nums">
                {t("projectSettings.threadCount", { count: selectedCheckoutThreadCount })}
              </div>
            </div>
          </div>
          <SettingsRow
            title={t("projectSettings.grouping")}
            description={t("projectSettings.groupingDescription")}
            control={
              <Select
                value={selectedCheckoutGrouping}
                onValueChange={(value) => {
                  if (
                    value === "inherit" ||
                    value === "repository" ||
                    value === "repository_path" ||
                    value === "separate"
                  ) {
                    updateGroupingPreference(selectedCheckout, value);
                  }
                }}
              >
                <SelectTrigger
                  size="sm"
                  aria-label={t("projectSettings.groupingRule", {
                    checkout: selectedCheckoutLabel,
                  })}
                >
                  <SelectValue>
                    {selectedCheckoutGrouping === "inherit"
                      ? t("projectSettings.defaultValue", {
                          value:
                            groupingModeLabels[projectGroupingSettings.sidebarProjectGroupingMode],
                        })
                      : groupingModeLabels[selectedCheckoutGrouping]}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem hideIndicator value="inherit">
                    {t("projectSettings.useGlobalDefault")}
                  </SelectItem>
                  <SelectItem hideIndicator value="repository">
                    {groupingModeLabels.repository}
                  </SelectItem>
                  <SelectItem hideIndicator value="repository_path">
                    {groupingModeLabels.repository_path}
                  </SelectItem>
                  <SelectItem hideIndicator value="separate">
                    {groupingModeLabels.separate}
                  </SelectItem>
                </SelectPopup>
              </Select>
            }
          />
          {group.memberProjects.length > 1 ? (
            <SettingsRow
              title={t("projectSettings.removeCheckout")}
              description={t("projectSettings.removeCheckoutDescription")}
              control={
                <Button
                  size="sm"
                  variant="destructive-outline"
                  onClick={() => void removeMembers([selectedCheckout])}
                >
                  <Trash2Icon className="size-3.5" />
                  {t("projectSettings.removeCheckout")}
                </Button>
              }
            />
          ) : null}
          <div className="flex min-h-8 flex-col items-start gap-3 px-3 pt-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-foreground">
                {t("projectSettings.actions")}
              </h3>
              <p className="text-pretty text-sm text-muted-foreground">
                {t("projectSettings.actionsDescription", { checkout: selectedCheckoutLabel })}
              </p>
            </div>
            <div className="flex w-full flex-wrap gap-1.5 sm:w-auto sm:shrink-0 sm:justify-end">
              {importableScripts.length > 0 ? (
                <Menu>
                  <MenuTrigger
                    render={
                      <Button size="xs" variant="ghost" disabled={isSavingScripts} type="button" />
                    }
                  >
                    {t("projectSettings.importScripts")}
                    <ChevronDownIcon className="size-3.5" />
                  </MenuTrigger>
                  <MenuPopup align="end" className="w-72">
                    <MenuGroup>
                      <MenuGroupLabel>{t("projectSettings.importFromT3")}</MenuGroupLabel>
                      <p className="px-2 pb-2 text-pretty text-sm text-muted-foreground">
                        {t("projectSettings.importDescription")}
                      </p>
                    </MenuGroup>
                    <MenuSeparator />
                    {importableScripts.map((fileScript) => (
                      <MenuItem
                        key={`${fileScript.name} ${fileScript.command}`}
                        onClick={() => void importFileScript(fileScript)}
                      >
                        <ScriptIcon icon={fileScript.icon ?? "play"} className="size-4 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{fileScript.name}</div>
                          <div className="truncate font-mono text-muted-foreground">
                            {fileScript.command}
                          </div>
                        </div>
                      </MenuItem>
                    ))}
                  </MenuPopup>
                </Menu>
              ) : null}
              <Button
                size="xs"
                variant="outline"
                disabled={isSavingScripts}
                onClick={() =>
                  setEditorRequest({ scriptId: null, initial: EMPTY_PROJECT_SCRIPT_INPUT })
                }
              >
                <PlusIcon className="size-3.5" />
                {t("projectSettings.addAction")}
              </Button>
            </div>
          </div>
          {scripts.length === 0 ? (
            <p className="px-3 py-2 text-base text-muted-foreground sm:px-4 sm:text-sm">
              {t("projectSettings.noActions")}
            </p>
          ) : (
            scripts.map((script) => {
              const shortcutLabel = shortcutLabelForCommand(
                keybindings,
                commandForProjectScript(script.id),
              );
              return (
                <SettingsRow
                  key={script.id}
                  className="group py-2"
                  title={
                    <span className="flex min-w-0 items-center gap-2">
                      <ScriptIcon
                        icon={script.icon}
                        className="size-4 shrink-0 text-muted-foreground"
                      />
                      <span className="min-w-0 truncate">{script.name}</span>
                      {script.runOnWorktreeCreate ? (
                        <span className="shrink-0 rounded-sm border border-border/60 px-1.5 py-px text-[11px] font-normal text-muted-foreground">
                          {t("projectSettings.setupBadge")}
                        </span>
                      ) : null}
                      {script.previewUrl ? (
                        <span className="shrink-0 rounded-sm border border-border/60 px-1.5 py-px text-[11px] font-normal text-muted-foreground max-sm:hidden">
                          {t("projectSettings.previewBadge")}
                        </span>
                      ) : null}
                    </span>
                  }
                  description={
                    <code className="block max-w-full truncate font-mono">{script.command}</code>
                  }
                  control={
                    <>
                      {shortcutLabel ? (
                        <span className="text-xs text-muted-foreground">{shortcutLabel}</span>
                      ) : null}
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        className="shrink-0 text-muted-foreground opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                        aria-label={t("projectSettings.editAction", { name: script.name })}
                        disabled={isSavingScripts}
                        onClick={() =>
                          setEditorRequest(editorRequestForScript(script, keybindings))
                        }
                      >
                        <SettingsIcon className="size-3.5" />
                      </Button>
                    </>
                  }
                />
              );
            })
          )}
          {t3File.status === "invalid" ? (
            <SettingsRow
              title={t("projectSettings.invalidT3")}
              description={t("projectSettings.invalidT3Description")}
              className="text-warning"
            />
          ) : null}
        </SettingsSection>

        <SettingsSection title={t("projectSettings.section.danger")}>
          <SettingsRow
            title={
              group.memberProjects.length > 1
                ? t("projectSettings.removeEverywhere")
                : t("projectSettings.removeProject")
            }
            description={
              group.memberProjects.length > 1
                ? t("projectSettings.removeEverywhereDescription", {
                    count: group.memberProjects.length,
                  })
                : t("projectSettings.removeDescription")
            }
            control={
              <Button
                size="sm"
                variant="destructive-outline"
                onClick={() => void removeMembers(group.memberProjects)}
              >
                <Trash2Icon />
                {group.memberProjects.length > 1
                  ? t("projectSettings.removeAllEntries")
                  : t("projectSettings.removeProject")}
              </Button>
            }
          />
        </SettingsSection>
      </SettingsPageContainer>

      <ProjectScriptEditorDialog
        request={editorRequest}
        scripts={scripts}
        onSubmit={submitScript}
        onDelete={deleteScript}
        onClose={() => setEditorRequest(null)}
      />
      <ProjectFaviconPickerDialog
        key={`${representative.environmentId}:${representative.workspaceRoot}:${faviconPickerOpen}`}
        cwd={representative.workspaceRoot}
        environmentId={representative.environmentId}
        onOpenChange={setFaviconPickerOpen}
        {...(pickProjectFavicon
          ? { onPickExternal: () => pickProjectFavicon(representative.workspaceRoot) }
          : {})}
        onSelect={(path) => void setProjectIcon({ faviconPath: path, projectIcon: null })}
        open={faviconPickerOpen}
        projectName={group.displayName}
      />
      {iconPickerOpen ? (
        <Suspense fallback={null}>
          <ProjectIconPickerDialog
            current={projectIcon}
            open
            onOpenChange={setIconPickerOpen}
            onSelect={(icon) => void setProjectIcon({ faviconPath: null, projectIcon: icon })}
          />
        </Suspense>
      ) : null}
    </>
  );
}
