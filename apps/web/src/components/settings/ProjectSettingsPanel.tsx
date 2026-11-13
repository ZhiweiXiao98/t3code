import { projectRemovalMessage } from "../../i18n/confirmationMessages";
import { useComposerMenuState } from "../chat/useComposerMenuState";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { AuthOrchestrationOperateScope } from "@t3tools/contracts";
import { useEnvironmentsWithScope } from "../../state/session";
import { mapAtomCommandResult, settlePromise } from "@t3tools/client-runtime/state/runtime";
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { planProjectRemoval } from "@t3tools/client-runtime/state/projects";
import { type EnvironmentId, type SidebarProjectGroupingMode } from "@t3tools/contracts";
import {
  checkProjectAccess,
  reportProjectFailure,
  useProjectGroupUpdate,
  type ProjectGroupUpdate,
} from "../../hooks/useProjectGroupUpdate";
import { Navigate, useLocation, useNavigate } from "@tanstack/react-router";
import { InfoIcon, Trash2Icon } from "lucide-react";
import { lazy, Suspense, useRef, useState, type ReactNode } from "react";

import { useComposerDraftStore } from "../../composerDraftStore";
import { releaseProjectDraftUploads } from "../../lib/composerDraftUploads";
import { persistClientSettingsUpdate, useClientSettings } from "../../hooks/useSettings";
import { readLocalApi } from "../../localApi";
import { derivePhysicalProjectKey } from "@t3tools/client-runtime/state/project-grouping";
import {
  PROJECT_GROUPING_MODE_LABELS,
  withProjectGroupingOverride,
  type SidebarProjectGroupMember,
  type SidebarProjectSnapshot,
} from "../../sidebarProjectGrouping";
import { useEnvironments, usePrimaryEnvironmentId } from "../../state/environments";
import { useThreadShells, waitForProjectRemoval } from "../../state/entities";
import { projectEnvironment } from "../../state/projects";
import { ProjectFavicon } from "../ProjectFavicon";
import { Alert, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";
import {
  canPickExternalProjectFavicon,
  ProjectFaviconPickerDialog,
} from "./ProjectFaviconPickerDialog";
import { ProjectActionsSettings } from "./ProjectActionsSettings";
import { ProjectDefaultsSettings } from "./ProjectDefaultsSettings";
import {
  defaultProjectIcon,
  hasDefaultProjectIcon,
  projectGroupTitleNeedsUpdate,
  SCRATCH_PROJECT_TITLE,
} from "./ProjectSettingsPanel.logic";
import { translateWebSource } from "../../i18n/messages";
import { useI18n } from "../../i18n/WebI18nContext";
import { useSettingsProjectGroups } from "./useSettingsProjectGroups";
import { readUnloadedThreadCount } from "../../state/olderSettledShelf";
import { settingsScopeEnvironmentLabels } from "./settingsScopeAxis";

const ProjectIconPickerDialog = lazy(() =>
  import("./ProjectIconPickerDialog").then((module) => ({
    default: module.ProjectIconPickerDialog,
  })),
);

function isGroupingSelection(value: unknown): value is SidebarProjectGroupingMode | "inherit" {
  return (
    value === "inherit" ||
    value === "repository" ||
    value === "repository_path" ||
    value === "separate"
  );
}

// Grouping overrides are client settings, so they stay editable without project write access.
function CheckoutGroupingSelect({ member }: { member: SidebarProjectGroupMember }) {
  const { locale, t } = useI18n();
  const overrideKey = derivePhysicalProjectKey(member);
  const globalMode = useClientSettings((settings) => settings.sidebarProjectGroupingMode);
  const selection = useClientSettings(
    (settings) => settings.sidebarProjectGroupingOverrides?.[overrideKey] ?? "inherit",
  );
  return (
    <Select
      value={selection}
      onValueChange={(value) => {
        if (!isGroupingSelection(value)) return;
        persistClientSettingsUpdate((current) => ({
          ...current,
          sidebarProjectGroupingOverrides: withProjectGroupingOverride(
            current.sidebarProjectGroupingOverrides,
            overrideKey,
            value,
          ),
        })).catch((error) => {
          console.error("Failed to save checkout grouping rule", error);
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: translateWebSource(locale, "Could not save grouping rule"),
              description:
                error instanceof Error
                  ? error.message
                  : translateWebSource(locale, "An error occurred."),
            }),
          );
        });
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label={t("settings.v017.groupingRuleForEnvironment", {
          checkout: member.workspaceRoot,
          environment: member.environmentLabel
            ? `${member.environmentLabel} (${member.environmentId})`
            : member.environmentId,
        })}
      >
        <SelectValue>
          {selection === "inherit"
            ? t("projectSettings.defaultValue", {
                value: translateWebSource(locale, PROJECT_GROUPING_MODE_LABELS[globalMode]),
              })
            : translateWebSource(locale, PROJECT_GROUPING_MODE_LABELS[selection])}
        </SelectValue>
      </SelectTrigger>
      <SelectPopup align="end" alignItemWithTrigger={false}>
        <SelectItem hideIndicator value="inherit">
          {t("projectSettings.useGlobalDefault")}
        </SelectItem>
        <SelectItem hideIndicator value="repository">
          {translateWebSource(locale, PROJECT_GROUPING_MODE_LABELS.repository)}
        </SelectItem>
        <SelectItem hideIndicator value="repository_path">
          {translateWebSource(locale, PROJECT_GROUPING_MODE_LABELS.repository_path)}
        </SelectItem>
        <SelectItem hideIndicator value="separate">
          {translateWebSource(locale, PROJECT_GROUPING_MODE_LABELS.separate)}
        </SelectItem>
      </SelectPopup>
    </Select>
  );
}

export type ProjectSettingsCategory = "general" | "source-control" | "project";

interface ProjectSelection {
  readonly key: string;
  readonly environmentId: EnvironmentId | null;
  readonly checkoutKey: string | null;
  readonly memberKeys: ReadonlyArray<string>;
}

function sameProjectSelection(a: ProjectSelection | null, b: ProjectSelection): boolean {
  return (
    a !== null &&
    a.key === b.key &&
    a.environmentId === b.environmentId &&
    a.checkoutKey === b.checkoutKey &&
    a.memberKeys.length === b.memberKeys.length &&
    a.memberKeys.every((key, index) => key === b.memberKeys[index])
  );
}

export function ProjectSettingsPanel({
  projectKey,
  environmentId = null,
  checkoutKey = null,
  unavailable,
}: {
  projectKey: string;
  environmentId?: EnvironmentId | null;
  checkoutKey?: string | null;
  unavailable?: ReactNode;
}) {
  const { locale, t } = useI18n();
  const groups = useSettingsProjectGroups();
  const pathname = useLocation({ select: (location) => location.pathname });

  const selected = groups.find((group) => group.projectKey === projectKey) ?? null;
  const members =
    selected?.memberProjects.filter(
      (member) =>
        (environmentId === null || member.environmentId === environmentId) &&
        (checkoutKey === null || member.physicalProjectKey === checkoutKey),
    ) ?? [];

  // Retain group members so grouping-rule changes can follow the project to its new group.
  const [lastSelection, setLastSelection] = useState<ProjectSelection | null>(null);
  if (selected && members.length > 0) {
    const current: ProjectSelection = {
      key: selected.projectKey,
      environmentId,
      checkoutKey,
      memberKeys: members.map((member) => member.physicalProjectKey),
    };
    if (!sameProjectSelection(lastSelection, current)) setLastSelection(current);
  }

  const successor =
    members.length === 0 &&
    lastSelection?.key === projectKey &&
    lastSelection.environmentId === environmentId &&
    lastSelection.checkoutKey === checkoutKey
      ? groups.find((group) =>
          group.memberProjects.some((member) =>
            lastSelection.memberKeys.includes(member.physicalProjectKey),
          ),
        )
      : undefined;
  if (successor) {
    return (
      <Navigate
        to={pathname}
        search={{
          project: successor.projectKey,
          machine: environmentId ?? undefined,
          checkout: checkoutKey ?? undefined,
        }}
        replace
        hashScrollIntoView={false}
      />
    );
  }

  if ((!selected || members.length === 0) && unavailable != null) return unavailable;

  if (!selected) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        {groups.length === 0 ? t("projectSettings.empty") : t("projectSettings.removed")}
      </div>
    );
  }
  if (members.length === 0)
    return (
      <p className="p-8 text-sm text-muted-foreground">
        {translateWebSource(
          locale,
          "This checkout is no longer available in the selected project and environment.",
        )}
      </p>
    );
  const scopedGroup = {
    ...selected,
    memberProjects: members,
    environmentId: members[0]!.environmentId,
    id: members[0]!.id,
  };
  return (
    <ProjectDetail
      key={`${selected.projectKey}:${environmentId ?? "all"}:${checkoutKey ?? "all"}`}
      group={scopedGroup}
      allMembers={selected.memberProjects}
      hasOtherMembers={members.length < selected.memberProjects.length}
    />
  );
}

function ProjectDetail({
  group,
  allMembers,
  hasOtherMembers,
}: {
  group: SidebarProjectSnapshot;
  /** Pin and archive belong to the whole project, even when one machine is picked. */
  allMembers: ReadonlyArray<SidebarProjectGroupMember>;
  hasOtherMembers: boolean;
}) {
  const { t, locale } = useI18n();
  const tx = (source: string) => translateWebSource(locale, source);
  const navigate = useNavigate({ from: "/settings" });
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { environments } = useEnvironments();
  const environmentById = new Map(
    environments.map((environment) => [environment.environmentId, environment]),
  );
  const editableIds = useEnvironmentsWithScope(allMembers, AuthOrchestrationOperateScope);
  const canEditGroup = group.memberProjects.every((member) =>
    editableIds.has(member.environmentId),
  );
  const representative =
    group.memberProjects.find(
      (member) => environmentById.get(member.environmentId)?.serverConfig != null,
    ) ?? group.memberProjects[0]!;
  const threads = useThreadShells();
  const deleteProject = useOrchestrationCommand(projectEnvironment.delete, {
    reportFailure: false,
  });
  const projectNameEditedRef = useRef(false);

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

  const { updateProjectGroup, canOrganizeProjectGroup } = useProjectGroupUpdate();
  const updateAllMembers = (
    input: ProjectGroupUpdate | ((member: SidebarProjectGroupMember) => ProjectGroupUpdate),
    failureTitle: string,
  ) => updateProjectGroup(group.memberProjects, input, failureTitle);
  const canOrganize =
    allMembers.every((member) => editableIds.has(member.environmentId)) &&
    canOrganizeProjectGroup(allMembers);
  const [isOrganizing, setIsOrganizing] = useState(false);
  const organize = async (input: ProjectGroupUpdate, failureTitle: string) => {
    setIsOrganizing(true);
    await updateProjectGroup(allMembers, input, failureTitle);
    setIsOrganizing(false);
  };

  const renameGroup = async (nextTitle: string, wasEdited: boolean) => {
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
  };

  const [faviconPickerOpen, setFaviconPickerOpen] = useComposerMenuState(!canEditGroup);
  const [iconPickerOpen, setIconPickerOpen] = useComposerMenuState(!canEditGroup);
  const [isSavingFavicon, setIsSavingFavicon] = useState(false);
  const savingFaviconRef = useRef(false);
  const setProjectIcon = async (input: Parameters<typeof updateAllMembers>[0]) => {
    if (savingFaviconRef.current) return;
    savingFaviconRef.current = true;
    setIsSavingFavicon(true);
    await updateAllMembers(input, t("projectSettings.iconUpdateFailed"));
    savingFaviconRef.current = false;
    setIsSavingFavicon(false);
  };

  const hasMultipleCheckouts = group.memberProjects.length > 1;
  const canResetScratchTitle =
    group.memberProjects.every((member) => member.isScratch) &&
    group.memberProjects.some((member) => member.title !== SCRATCH_PROJECT_TITLE);

  const removeMembers = async (members: ReadonlyArray<SidebarProjectGroupMember>) => {
    if (checkProjectAccess(members, tx("Failed to remove project"))) return;
    const api = readLocalApi();
    if (!api) return;

    const removalPlan = planProjectRemoval({
      members,
      groupMemberCount: group.memberProjects.length,
      hasOtherMembers,
      displayName: group.displayName,
      threads,
      unloadedThreadCount: readUnloadedThreadCount(members, threads),
    });
    const { projectThreads, isWholeGroup } = removalPlan;
    const confirmationMessage = projectRemovalMessage(
      locale,
      removalPlan,
      members,
      hasOtherMembers,
    );
    const confirmed = await settlePromise(() =>
      api.dialogs.confirm(confirmationMessage, { variant: "destructive" }),
    );
    if (confirmed._tag === "Failure" || !confirmed.value) return;
    if (checkProjectAccess(members, tx("Failed to remove project"))) return;

    const draftStore = useComposerDraftStore.getState();
    for (const member of members) {
      if (checkProjectAccess([member], tx("Failed to remove project"))) return;
      const memberThreads = projectThreads.filter(
        (thread) => thread.environmentId === member.environmentId && thread.projectId === member.id,
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
        reportProjectFailure(t("projectSettings.removeFailed", { name: member.title }), result);
        return;
      }
      const projectRef = scopeProjectRef(member.environmentId, member.id);
      await waitForProjectRemoval(projectRef);
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

    if (isWholeGroup && !hasOtherMembers) {
      void navigate({
        to: "/settings/projects",
        search: ({ machine }) => ({ project: undefined, machine, checkout: undefined }),
        replace: true,
      });
    }
  };

  const checkoutsByEnvironment = new Map<EnvironmentId, SidebarProjectGroupMember[]>();
  for (const member of group.memberProjects) {
    const members = checkoutsByEnvironment.get(member.environmentId);
    if (members) members.push(member);
    else checkoutsByEnvironment.set(member.environmentId, [member]);
  }
  // A lone checkout is removed from the Danger section, but it still needs its grouping
  // rule here so "Keep separate" can be undone.
  const checkoutControls = (member: SidebarProjectGroupMember) => (
    <div className="flex w-full min-w-0 items-center gap-2 @min-[32rem]/settings-row:w-auto">
      <div className="min-w-0 flex-1 @min-[32rem]/settings-row:w-72 @min-[32rem]/settings-row:flex-none">
        <CheckoutGroupingSelect member={member} />
      </div>
      {hasMultipleCheckouts ? (
        <Button
          size="sm"
          variant="outline"
          disabled={!editableIds.has(member.environmentId)}
          onClick={() => void removeMembers([member])}
          aria-label={t("settingsControls.removeCheckout", { path: member.workspaceRoot })}
        >
          {translateWebSource(locale, "Remove")}
        </Button>
      ) : null}
    </div>
  );
  const checkoutChoices = (
    <SettingsSection title={translateWebSource(locale, "Checkouts")}>
      <p className="px-3 py-2.5 text-xs text-muted-foreground sm:px-4">
        {translateWebSource(
          locale,
          "Grouping rule decides how each checkout joins project groups in the sidebar. Changing it can move a checkout to a different project.",
        )}
      </p>
      {Array.from(checkoutsByEnvironment, ([environmentId, members]) => {
        if (checkoutsByEnvironment.size === 1) {
          return members.map((member) => (
            <SettingsRow
              key={member.physicalProjectKey}
              title={member.environmentLabel ?? "Environment"}
              description={member.workspaceRoot}
              control={checkoutControls(member)}
            />
          ));
        }
        const firstMember = members[0]!;
        const hasMultiple = members.length > 1;
        const environment = environmentById.get(environmentId);
        const labels = environment
          ? settingsScopeEnvironmentLabels(environment, environments)
          : { primary: firstMember.environmentLabel ?? "Environment", secondary: environmentId };
        return (
          <SettingsRow
            key={environmentId}
            title={labels.primary}
            description={
              <>
                {labels.secondary ? (
                  <span className="block truncate">{labels.secondary}</span>
                ) : null}
                {!hasMultiple ? (
                  <Tooltip>
                    <TooltipTrigger render={<span className="block truncate" />}>
                      {firstMember.workspaceRoot}
                    </TooltipTrigger>
                    <TooltipPopup>{firstMember.workspaceRoot}</TooltipPopup>
                  </Tooltip>
                ) : null}
              </>
            }
            control={hasMultiple ? undefined : checkoutControls(firstMember)}
          >
            {hasMultiple ? (
              <div className="space-y-3 pb-2 pt-1">
                {members.map((member) => (
                  <div
                    key={member.physicalProjectKey}
                    className="flex min-w-0 flex-col gap-1.5 @min-[36rem]/settings-row:flex-row @min-[36rem]/settings-row:items-center @min-[36rem]/settings-row:justify-between @min-[36rem]/settings-row:gap-3"
                  >
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span className="min-w-0 max-w-full truncate text-xs text-muted-foreground/80" />
                        }
                      >
                        {member.workspaceRoot}
                      </TooltipTrigger>
                      <TooltipPopup>{member.workspaceRoot}</TooltipPopup>
                    </Tooltip>
                    <div className="shrink-0">{checkoutControls(member)}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </SettingsRow>
        );
      })}
    </SettingsSection>
  );

  return (
    <>
      <SettingsPageContainer className="gap-6">
        <Alert variant="info">
          <InfoIcon aria-hidden />
          <AlertDescription>
            {tx(
              "Can't find a setting? Keep this project picked above and hop to any other settings page.",
            )}
          </AlertDescription>
        </Alert>
        <SettingsSection
          id="project-overview"
          title={translateWebSource(locale, "Project")}
          hideTitle
        >
          {!canEditGroup ? (
            <p className="px-3 py-2 text-sm text-muted-foreground sm:px-4">
              {group.memberProjects.length > 1
                ? tx("Shared settings require permission to change every checkout in this group.")
                : tx("This connection cannot change this project.")}
            </p>
          ) : null}
          <SettingsRow
            title={t("projectSettings.name")}
            description={t("projectSettings.nameDescription")}
            resetAction={
              canResetScratchTitle ? (
                <SettingResetButton
                  label={translateWebSource(locale, "project name")}
                  disabled={!canEditGroup}
                  onClick={() =>
                    void updateAllMembers(
                      { title: SCRATCH_PROJECT_TITLE },
                      t("projectSettings.renameFailed"),
                    )
                  }
                />
              ) : null
            }
            control={
              <Input
                key={`${group.projectKey}:${group.displayName}`}
                size="sm"
                className="w-full sm:w-64"
                aria-label={t("projectSettings.projectName")}
                disabled={!canEditGroup}
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
                  if (event.nativeEvent.isComposing || event.keyCode === 229) return;
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
                : projectIcon?.kind === "monogram"
                  ? `${projectIcon.text} · ${projectIcon.color}`
                  : projectIcon?.kind === "emoji"
                    ? projectIcon.emoji
                    : (faviconPath ?? t("projectSettings.automatic"))
            }
            resetAction={
              group.memberProjects.some((member) => !hasDefaultProjectIcon(member)) ? (
                <SettingResetButton
                  label={translateWebSource(locale, "project icon")}
                  disabled={isSavingFavicon || !canEditGroup}
                  onClick={() => void setProjectIcon(defaultProjectIcon)}
                />
              ) : null
            }
            control={
              <div className="flex items-center gap-2">
                <ProjectFavicon project={representative} className="size-6" />
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  aria-label={t("projectSettings.chooseBuiltInIcon")}
                  disabled={isSavingFavicon || !canEditGroup}
                  onClick={() => setIconPickerOpen(true)}
                >
                  {t("projectSettings.chooseBuiltInIcon")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  aria-label={t("projectSettings.chooseIcon")}
                  disabled={isSavingFavicon || !canEditGroup}
                  onClick={() => setFaviconPickerOpen(true)}
                >
                  {t("projectSettings.chooseFile")}
                </Button>
              </div>
            }
          />
          {canOrganize ? (
            <>
              <SettingsRow
                title={translateWebSource(locale, "Pin")}
                description={translateWebSource(
                  locale,
                  "Pinned projects come first in project pickers.",
                )}
                control={
                  <Switch
                    checked={group.pinned}
                    disabled={isOrganizing}
                    onCheckedChange={(checked) =>
                      void organize(
                        { pinned: Boolean(checked) },
                        tx(checked ? "Failed to pin project" : "Failed to unpin project"),
                      )
                    }
                    aria-label={tx("Pin project")}
                  />
                }
              />
              <SettingsRow
                title={translateWebSource(locale, "Archive")}
                description={
                  group.archived
                    ? translateWebSource(
                        locale,
                        "Hidden from project pickers. Threads and files are kept.",
                      )
                    : translateWebSource(
                        locale,
                        "Hides the project from project pickers. Threads and files are kept.",
                      )
                }
                control={
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isOrganizing}
                    onClick={() =>
                      void organize(
                        { archived: !group.archived },
                        group.archived
                          ? tx("Failed to unarchive project")
                          : tx("Failed to archive project"),
                      )
                    }
                  >
                    {tx(group.archived ? "Unarchive" : "Archive")}
                  </Button>
                }
              />
            </>
          ) : null}
        </SettingsSection>
        <ProjectDefaultsSettings category="project" />
        <ProjectActionsSettings />
        {checkoutChoices}
        <SettingsSection title={t("projectSettings.section.danger")}>
          <SettingsRow
            title={
              hasOtherMembers
                ? tx("Remove checkout")
                : group.memberProjects.length > 1
                  ? tx("Remove this project everywhere")
                  : tx("Remove project")
            }
            description={
              hasOtherMembers
                ? translateWebSource(
                    locale,
                    "Deletes the selected machine's checkout entries and their threads. Other machines and files on disk are not touched.",
                  )
                : group.memberProjects.length > 1
                  ? locale === "zh-CN"
                    ? `删除所有设备上的 ${group.memberProjects.length} 个检出条目及其会话，不影响磁盘文件。`
                    : `Deletes all ${group.memberProjects.length} checkout entries and their threads on every machine. Files on disk are not touched.`
                  : translateWebSource(
                      locale,
                      "Deletes the project entry and its threads. Files on disk are not touched.",
                    )
            }
            control={
              <Button
                size="sm"
                variant="destructive-outline"
                disabled={!canEditGroup}
                onClick={() => void removeMembers(group.memberProjects)}
              >
                <Trash2Icon />
                {hasOtherMembers
                  ? tx("Remove checkout")
                  : group.memberProjects.length > 1
                    ? tx("Remove all entries")
                    : tx("Remove project")}
              </Button>
            }
          />
        </SettingsSection>
      </SettingsPageContainer>

      <ProjectFaviconPickerDialog
        key={`${representative.environmentId}:${representative.workspaceRoot}:${faviconPickerOpen}`}
        cwd={representative.workspaceRoot}
        environmentId={representative.environmentId}
        onOpenChange={setFaviconPickerOpen}
        {...(pickProjectFavicon
          ? { onPickExternal: () => pickProjectFavicon(representative.workspaceRoot) }
          : {})}
        onSelect={(path) => void setProjectIcon({ faviconPath: path, projectIcon: null })}
        open={faviconPickerOpen && canEditGroup}
        projectName={group.displayName}
      />
      {iconPickerOpen && canEditGroup ? (
        <Suspense fallback={null}>
          <ProjectIconPickerDialog
            current={projectIcon}
            projectName={representative.title}
            open
            onOpenChange={setIconPickerOpen}
            onSelect={(icon) => void setProjectIcon({ faviconPath: null, projectIcon: icon })}
          />
        </Suspense>
      ) : null}
    </>
  );
}
