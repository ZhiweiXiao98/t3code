import {
  DEFAULT_CLIENT_SETTINGS,
  DEFAULT_SERVER_SETTINGS,
  type EnvironmentId,
  type ModelSelection,
  type ProviderInstanceId,
  type ServerSettingsPatch,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Trash2Icon } from "lucide-react";

import { useClientSettings, useUpdateClientSettings } from "../../hooks/useSettings";
import { getCustomModelOptionsByInstance } from "../../modelSelection";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  resolveDefaultProviderModelSelection,
  sortProviderInstanceEntries,
} from "../../providerInstances";
import { useEnvironments, usePrimaryEnvironmentId } from "../../state/environments";
import { EMPTY_SERVER_PROVIDERS, serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { resolveEnvModeLabel } from "../BranchToolbar.logic";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import { TraitsPicker } from "../chat/TraitsPicker";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { toastManager } from "../ui/toast";
import { Switch } from "../ui/switch";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { PROJECT_GROUPING_MODE_LABELS } from "./ProjectSettingsPanel";
import { ProjectDefaultActionsSettings } from "./ProjectDefaultActionsSettings";
import { useI18n } from "../../i18n/WebI18nProvider";
import { translateWebSource } from "../../i18n/messages";
import { searchableSetting } from "./settingsSearch";
import {
  SETTINGS_PICKER_TRIGGER_CLASSNAME,
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";

/** Defaults are written only to the machines selected on the projects settings page. */
export function ProjectDefaultsSettings({
  environmentId,
}: {
  environmentId: EnvironmentId | null;
}) {
  const { locale } = useI18n();
  const translate = (source: string) => translateWebSource(locale, source);
  const { environments } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const clientSettings = useClientSettings();
  const updateClientSettings = useUpdateClientSettings();
  const navigate = useNavigate();
  const updateSettings = useAtomCommand(
    serverEnvironment.updateSettings,
    "project defaults update",
  );
  const savingRef = useRef(new Set<string>());
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());
  const scoped = environments.filter(
    (environment) => environmentId === null || environment.environmentId === environmentId,
  );
  const targets = scoped.filter(
    (environment) =>
      environment.connection.phase === "connected" && environment.serverConfig !== null,
  );
  const representative =
    targets.find((environment) => environment.environmentId === primaryEnvironmentId) ?? targets[0];
  const serverSettings = representative?.serverConfig?.settings ?? DEFAULT_SERVER_SETTINGS;
  const providers = representative?.serverConfig?.providers ?? EMPTY_SERVER_PROVIDERS;
  const settings = { ...serverSettings, ...clientSettings };
  const storedSelection = serverSettings.defaultModelSelection;
  const selection = resolveDefaultProviderModelSelection(providers, storedSelection);
  const entries = sortProviderInstanceEntries(
    applyProviderInstanceSettings(deriveProviderInstanceEntries(providers), settings),
  );
  const modelOptions = getCustomModelOptionsByInstance(
    settings,
    providers,
    selection?.instanceId,
    selection?.model,
  );
  const activeEntry = entries.find((entry) => entry.instanceId === selection?.instanceId);
  const mixedModel = targets.some(
    (target) =>
      JSON.stringify(target.serverConfig?.settings.defaultModelSelection) !==
      JSON.stringify(storedSelection),
  );
  const mixedWorkspace = targets.some(
    (target) =>
      target.serverConfig?.settings.defaultThreadEnvMode !== serverSettings.defaultThreadEnvMode,
  );
  const mixedBrowser = targets.some(
    (target) =>
      target.serverConfig?.settings.enableAgentBrowserAccess !==
      serverSettings.enableAgentBrowserAccess,
  );
  const disabled = (key: keyof ServerSettingsPatch) => targets.length === 0 || saving.has(key);
  const mixedAutoPull = targets.some(
    (target) => target.serverConfig?.settings.defaultAutoPull !== serverSettings.defaultAutoPull,
  );

  function modelDisabledReason(instanceId: ProviderInstanceId, model: string): string | null {
    const sourceEntry = entries.find((entry) => entry.instanceId === instanceId);
    for (const target of targets) {
      const config = target.serverConfig;
      if (!config) continue;
      const entry = applyProviderInstanceSettings(
        deriveProviderInstanceEntries(config.providers),
        config.settings,
      ).find((candidate) => candidate.instanceId === instanceId);
      const options = getCustomModelOptionsByInstance(
        { ...config.settings, ...clientSettings },
        config.providers,
      ).get(instanceId);
      if (
        !entry?.enabled ||
        !entry.isAvailable ||
        entry.driverKind !== sourceEntry?.driverKind ||
        !options?.some((option) => option.slug === model && !option.isUnavailable)
      ) {
        return locale === "zh-CN"
          ? `此模型在 ${target.label} 上不可用。请选择该设备并单独设置其默认模型。`
          : `This model is unavailable on ${target.label}. Select that machine to choose its default separately.`;
      }
    }
    return null;
  }

  async function save(patch: ServerSettingsPatch) {
    const keys = Object.keys(patch);
    if (targets.length === 0 || keys.some((key) => savingRef.current.has(key))) return;
    const nextModel = patch.defaultModelSelection;
    const reason = nextModel ? modelDisabledReason(nextModel.instanceId, nextModel.model) : null;
    if (reason) {
      toastManager.add({
        type: "error",
        title: translate("Default model not saved"),
        description: reason,
      });
      return;
    }
    for (const key of keys) savingRef.current.add(key);
    setSaving(new Set(savingRef.current));
    try {
      const results = await Promise.all(
        targets.map((target) =>
          updateSettings({ environmentId: target.environmentId, input: { patch } }),
        ),
      );
      const failedTargets = targets.filter((_, index) => results[index]?._tag === "Failure");
      if (failedTargets.length > 0) {
        toastManager.add({
          type: "error",
          title: translate("Project defaults not saved on every machine"),
          description:
            locale === "zh-CN"
              ? `无法更新 ${failedTargets.map((target) => target.label).join("、")}。其他设备可能已保存此更改。`
              : `Could not update ${failedTargets.map((target) => target.label).join(", ")}. Other machines may have saved the change.`,
        });
      }
    } finally {
      for (const key of keys) savingRef.current.delete(key);
      setSaving(new Set(savingRef.current));
    }
  }

  const setModel = (value: ModelSelection | null) => void save({ defaultModelSelection: value });
  return (
    <SettingsPageContainer>
      <SettingsSection
        id={searchableSetting("project-defaults").id}
        title="Project defaults"
        hideTitle
      >
        <SettingsRow
          title="Name"
          aria-disabled
          description="Select a project to change its name."
          control={
            <Input
              size="sm"
              className="w-full sm:w-64"
              aria-label={translate("Project name")}
              placeholder={translate("Select a project")}
              disabled
            />
          }
        />
        <SettingsRow
          title="Project icon"
          aria-disabled
          description="Select a project to change its icon."
          control={
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled>
                {translate("Choose icon")}
              </Button>
              <Button size="sm" variant="outline" disabled>
                {translate("Choose file")}
              </Button>
            </div>
          }
        />
        {scoped.length > targets.length || targets.length === 0 ? (
          <p role="status" className="px-4 py-3 text-sm text-muted-foreground">
            {targets.length === 0
              ? translate("Connect a machine to change its project defaults.")
              : translate(
                  "Changes apply to connected machines only. Offline machines keep their current defaults.",
                )}
          </p>
        ) : null}
        <SettingsRow
          title="Model"
          description="Default model for new threads. Projects can override it."
          status={
            targets.length === 0
              ? undefined
              : mixedModel
                ? translate("Differs by machine")
                : storedSelection === null
                  ? translate("Automatic")
                  : undefined
          }
          resetAction={
            storedSelection !== null || mixedModel ? (
              <SettingResetButton
                label="default model"
                disabled={disabled("defaultModelSelection")}
                onClick={() => setModel(null)}
              />
            ) : null
          }
          control={
            selection && activeEntry ? (
              <fieldset
                disabled={disabled("defaultModelSelection")}
                className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 disabled:opacity-50"
              >
                <ProviderModelPicker
                  activeInstanceId={selection.instanceId}
                  model={selection.model}
                  lockedProvider={null}
                  instanceEntries={entries}
                  modelOptionsByInstance={modelOptions}
                  disabled={disabled("defaultModelSelection")}
                  triggerVariant="outline"
                  triggerClassName={SETTINGS_PICKER_TRIGGER_CLASSNAME}
                  getModelDisabledReason={modelDisabledReason}
                  onOpenProviderSetup={(instanceId) => {
                    if (representative)
                      void navigate({
                        to: "/settings/providers",
                        search: { environmentId: representative.environmentId, instanceId },
                      });
                  }}
                  onInstanceModelChange={(instanceId, model) =>
                    setModel(createModelSelection(instanceId, model))
                  }
                />
                {!mixedModel ? (
                  <TraitsPicker
                    provider={activeEntry.driverKind}
                    models={activeEntry.models}
                    model={selection.model}
                    prompt=""
                    onPromptChange={() => {}}
                    modelOptions={selection.options ?? []}
                    allowPromptInjectedEffort={false}
                    planModeEnabled={settings.planModeEnabled}
                    triggerVariant="outline"
                    triggerClassName={SETTINGS_PICKER_TRIGGER_CLASSNAME}
                    onModelOptionsChange={(options) =>
                      setModel(createModelSelection(selection.instanceId, selection.model, options))
                    }
                  />
                ) : null}
              </fieldset>
            ) : (
              <span className="text-sm text-muted-foreground">
                {translate("No providers available")}
              </span>
            )
          }
        />
        <SettingsRow
          id={searchableSetting("new-threads").id}
          title="Workspace"
          description="Where new threads start, unless overridden by the project or t3.json."
          resetAction={
            mixedWorkspace ||
            serverSettings.defaultThreadEnvMode !== DEFAULT_SERVER_SETTINGS.defaultThreadEnvMode ? (
              <SettingResetButton
                label="default workspace"
                disabled={disabled("defaultThreadEnvMode")}
                onClick={() =>
                  void save({ defaultThreadEnvMode: DEFAULT_SERVER_SETTINGS.defaultThreadEnvMode })
                }
              />
            ) : null
          }
          control={
            <Select
              disabled={disabled("defaultThreadEnvMode")}
              value={mixedWorkspace ? "mixed" : serverSettings.defaultThreadEnvMode}
              onValueChange={(value) => {
                if (value === "local" || value === "worktree")
                  void save({ defaultThreadEnvMode: value });
              }}
            >
              <SelectTrigger size="sm" aria-label={translate("Default workspace")}>
                <SelectValue>
                  {targets.length === 0
                    ? translate("Unavailable")
                    : mixedWorkspace
                      ? translate("Differs by machine")
                      : translate(resolveEnvModeLabel(serverSettings.defaultThreadEnvMode))}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem value="local">{translate(resolveEnvModeLabel("local"))}</SelectItem>
                <SelectItem value="worktree">
                  {translate(resolveEnvModeLabel("worktree"))}
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />
        <SettingsRow
          title="Automatically pull"
          description="Keeps the default branch current when the checkout has no local changes or commits. Projects can override it."
          status={mixedAutoPull ? translate("Differs by machine") : undefined}
          resetAction={
            serverSettings.defaultAutoPull || mixedAutoPull ? (
              <SettingResetButton
                label="default automatic pull"
                tooltip="Reset automatic pull to off"
                disabled={disabled("defaultAutoPull")}
                onClick={() => void save({ defaultAutoPull: false })}
              />
            ) : null
          }
          control={
            <Switch
              aria-label={translate("Default automatic pull")}
              checked={serverSettings.defaultAutoPull}
              disabled={disabled("defaultAutoPull")}
              onCheckedChange={(enabled) => void save({ defaultAutoPull: enabled })}
            />
          }
        />
        <SettingsRow
          id={searchableSetting("agent-browser-access").id}
          title="Agent browser access"
          description="Allow agents to use the shared browser. Projects can override it."
          resetAction={
            mixedBrowser ||
            serverSettings.enableAgentBrowserAccess !==
              DEFAULT_SERVER_SETTINGS.enableAgentBrowserAccess ? (
              <SettingResetButton
                label="default browser access"
                disabled={disabled("enableAgentBrowserAccess")}
                onClick={() =>
                  void save({
                    enableAgentBrowserAccess: DEFAULT_SERVER_SETTINGS.enableAgentBrowserAccess,
                  })
                }
              />
            ) : null
          }
          control={
            <Select
              disabled={disabled("enableAgentBrowserAccess")}
              value={
                mixedBrowser
                  ? "mixed"
                  : serverSettings.enableAgentBrowserAccess
                    ? "enabled"
                    : "disabled"
              }
              onValueChange={(value) => {
                if (value === "enabled" || value === "disabled")
                  void save({ enableAgentBrowserAccess: value === "enabled" });
              }}
            >
              <SelectTrigger size="sm" aria-label={translate("Default agent browser access")}>
                <SelectValue>
                  {targets.length === 0
                    ? translate("Unavailable")
                    : mixedBrowser
                      ? translate("Differs by machine")
                      : serverSettings.enableAgentBrowserAccess
                        ? translate("Enabled")
                        : translate("Disabled")}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem value="enabled">{translate("Enabled")}</SelectItem>
                <SelectItem value="disabled">{translate("Disabled")}</SelectItem>
              </SelectPopup>
            </Select>
          }
        />
      </SettingsSection>
      <SettingsSection title="Checkout">
        <SettingsRow
          title="Checkout"
          aria-disabled
          description="Select a project to choose one of its checkouts."
          control={
            <Select disabled>
              <SelectTrigger size="sm" aria-label={translate("Checkout")}>
                <SelectValue placeholder={translate("Select a project")} />
              </SelectTrigger>
            </Select>
          }
        />
        <SettingsRow
          title="Project grouping"
          description="Default grouping across all machines in this client. Individual checkout overrides are preserved."
          resetAction={
            clientSettings.sidebarProjectGroupingMode !==
            DEFAULT_CLIENT_SETTINGS.sidebarProjectGroupingMode ? (
              <SettingResetButton
                label="default project grouping"
                onClick={() =>
                  void updateClientSettings({
                    sidebarProjectGroupingMode: DEFAULT_CLIENT_SETTINGS.sidebarProjectGroupingMode,
                  })
                }
              />
            ) : null
          }
          control={
            <Select
              value={clientSettings.sidebarProjectGroupingMode}
              onValueChange={(value) => {
                if (value === "repository" || value === "repository_path" || value === "separate")
                  void updateClientSettings({ sidebarProjectGroupingMode: value });
              }}
            >
              <SelectTrigger size="sm" aria-label={translate("Default project grouping")}>
                <SelectValue>
                  {translate(
                    PROJECT_GROUPING_MODE_LABELS[clientSettings.sidebarProjectGroupingMode],
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem value="repository">
                  {translate(PROJECT_GROUPING_MODE_LABELS.repository)}
                </SelectItem>
                <SelectItem value="repository_path">
                  {translate(PROJECT_GROUPING_MODE_LABELS.repository_path)}
                </SelectItem>
                <SelectItem value="separate">
                  {translate(PROJECT_GROUPING_MODE_LABELS.separate)}
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />
        <SettingsRow
          title="Remove checkout"
          aria-disabled
          description="Select a project to remove one of its checkouts."
          control={
            <Button size="sm" variant="destructive-outline" disabled>
              <Trash2Icon className="size-3.5" />
              {translate("Remove checkout")}
            </Button>
          }
        />
      </SettingsSection>
      <ProjectDefaultActionsSettings environmentId={environmentId} />
      <SettingsSection title="Danger">
        <SettingsRow
          title="Remove project"
          aria-disabled
          description="Select a project to remove its entries and threads. Files on disk are not touched."
          control={
            <Button size="sm" variant="destructive-outline" disabled>
              <Trash2Icon />
              {translate("Remove project")}
            </Button>
          }
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}
