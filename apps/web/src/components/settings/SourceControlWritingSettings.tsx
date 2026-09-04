import { useAtomValue } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import { useRef } from "react";
import type { ProviderInstanceId, SourceControlWritingStyleMode } from "@t3tools/contracts";
import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";
import { createModelSelection } from "@t3tools/shared/model";
import { resolveSourceControlWriterModelSelection } from "@t3tools/shared/serverSettings";

import { usePrimarySettings, useUpdatePrimarySettings } from "../../hooks/useSettings";
import { useI18n } from "../../i18n/WebI18nProvider";
import type { WebMessageKey } from "../../i18n/messages";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  sortProviderInstanceEntries,
} from "../../providerInstances";
import {
  getCustomModelOptionsByInstance,
  resolveAppModelSelectionState,
} from "../../modelSelection";
import { primaryServerProvidersAtom } from "../../state/server";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import {
  SETTINGS_PICKER_TRIGGER_CLASSNAME,
  SettingResetButton,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

const MODE_OPTION_MESSAGE_KEYS = {
  repo_conventions: {
    label: "sourceControl.writingStyle.repoConventions",
    description: "sourceControl.writingStyle.repoConventionsDescription",
  },
  conventional_commits: {
    label: "sourceControl.writingStyle.conventionalCommits",
    description: "sourceControl.writingStyle.conventionalCommitsDescription",
  },
  custom: {
    label: "sourceControl.writingStyle.custom",
    description: "sourceControl.writingStyle.customDescription",
  },
} as const satisfies Record<
  SourceControlWritingStyleMode,
  { readonly label: WebMessageKey; readonly description: WebMessageKey }
>;

export function SourceControlWritingSettingsSection() {
  const { t } = useI18n();
  const settings = usePrimarySettings();
  const updateSettings = useUpdatePrimarySettings();
  const navigate = useNavigate();
  const environmentId = usePrimaryEnvironmentId();
  const serverProviders = useAtomValue(primaryServerProvidersAtom);
  const customInstructionsRef = useRef<HTMLTextAreaElement>(null);
  const style = settings.sourceControlWritingStyle;
  const defaults = DEFAULT_UNIFIED_SETTINGS.sourceControlWritingStyle;
  const isSourceControlWritingStyleDirty =
    style.mode !== defaults.mode || style.customInstructions !== defaults.customInstructions;

  const textGenerationProviders = serverProviders.filter(
    (provider) => provider.supportsTextGeneration !== false,
  );
  const defaultModelSelection = resolveAppModelSelectionState(settings, textGenerationProviders);
  const usesDedicatedModel = settings.sourceControlWriterModelSelection !== null;
  const activeSelection = resolveAppModelSelectionState(
    {
      ...settings,
      textGenerationModelSelection: resolveSourceControlWriterModelSelection(
        settings,
        textGenerationProviders,
      ),
    },
    textGenerationProviders,
  );
  const instanceEntries = sortProviderInstanceEntries(
    applyProviderInstanceSettings(deriveProviderInstanceEntries(textGenerationProviders), settings),
  );
  const canEnableDedicatedModel = instanceEntries.some(
    (entry) =>
      entry.instanceId === defaultModelSelection.instanceId && entry.enabled && entry.isAvailable,
  );
  const modelOptionsByInstance = getCustomModelOptionsByInstance(
    settings,
    textGenerationProviders,
    activeSelection.instanceId,
    activeSelection.model,
  );

  return (
    <SettingsSection id="source-control-text-generation" title={t("sourceControl.textGeneration")}>
      <SettingsRow
        serverScoped
        {...searchableSetting("source-control-writing-style")}
        title={t("sourceControl.writingStyle.title")}
        description={t(MODE_OPTION_MESSAGE_KEYS[style.mode].description)}
        resetAction={
          isSourceControlWritingStyleDirty ? (
            <SettingResetButton
              label={t("sourceControl.writingStyle.title")}
              onClick={() =>
                updateSettings({
                  sourceControlWritingStyle: {
                    mode: defaults.mode,
                    customInstructions: defaults.customInstructions,
                  },
                })
              }
            />
          ) : null
        }
        control={
          <Select
            value={style.mode}
            onValueChange={(value) => {
              const customInstructions = customInstructionsRef.current?.value.trim();
              updateSettings({
                sourceControlWritingStyle: {
                  mode: value as SourceControlWritingStyleMode,
                  ...(customInstructions !== undefined ? { customInstructions } : {}),
                },
              });
            }}
          >
            <SelectTrigger
              size="sm"
              className="w-full sm:w-56"
              aria-label={t("sourceControl.writingStyle.title")}
            >
              <SelectValue>{t(MODE_OPTION_MESSAGE_KEYS[style.mode].label)}</SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {(Object.keys(MODE_OPTION_MESSAGE_KEYS) as SourceControlWritingStyleMode[]).map(
                (mode) => (
                  <SelectItem key={mode} hideIndicator value={mode}>
                    {t(MODE_OPTION_MESSAGE_KEYS[mode].label)}
                  </SelectItem>
                ),
              )}
            </SelectPopup>
          </Select>
        }
      >
        {style.mode === "custom" ? (
          <div className="mt-3 max-w-2xl pb-3.5">
            <Textarea
              key={style.customInstructions}
              ref={customInstructionsRef}
              defaultValue={style.customInstructions}
              onBlur={(event) => {
                const customInstructions = event.target.value.trim();
                if (customInstructions !== style.customInstructions) {
                  updateSettings({ sourceControlWritingStyle: { customInstructions } });
                }
              }}
              rows={4}
              placeholder={t("sourceControl.writingStyle.customPlaceholder")}
              aria-label={t("sourceControl.writingStyle.custom")}
            />
          </div>
        ) : null}
      </SettingsRow>

      <SettingsRow
        serverScoped
        {...searchableSetting("follow-change-request-templates")}
        title={t("sourceControl.followTemplates.title")}
        description={t("sourceControl.followTemplates.description")}
        resetAction={
          style.followChangeRequestTemplates !== defaults.followChangeRequestTemplates ? (
            <SettingResetButton
              label={t("sourceControl.followTemplates.title")}
              onClick={() =>
                updateSettings({
                  sourceControlWritingStyle: {
                    followChangeRequestTemplates: defaults.followChangeRequestTemplates,
                  },
                })
              }
            />
          ) : null
        }
        control={
          <Switch
            checked={style.followChangeRequestTemplates}
            onCheckedChange={(checked) =>
              updateSettings({
                sourceControlWritingStyle: {
                  followChangeRequestTemplates: Boolean(checked),
                },
              })
            }
            aria-label={t("sourceControl.followTemplates.title")}
          />
        }
      />

      <SettingsRow
        serverScoped
        {...searchableSetting("source-control-writer-model")}
        title={t("sourceControl.writerModel.title")}
        description={t("sourceControl.writerModel.description")}
        control={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {usesDedicatedModel && !canEnableDedicatedModel ? (
              <span className="text-sm text-muted-foreground">
                {t("sourceControl.writerModel.none")}
              </span>
            ) : null}
            {usesDedicatedModel && canEnableDedicatedModel ? (
              <ProviderModelPicker
                activeInstanceId={activeSelection.instanceId}
                model={activeSelection.model}
                lockedProvider={null}
                instanceEntries={instanceEntries}
                modelOptionsByInstance={modelOptionsByInstance}
                triggerVariant="outline"
                triggerClassName={SETTINGS_PICKER_TRIGGER_CLASSNAME}
                triggerAriaLabel={t("sourceControl.writerModel.title")}
                {...(environmentId
                  ? {
                      onOpenProviderSetup: (instanceId: ProviderInstanceId) => {
                        void navigate({
                          to: "/settings/providers",
                          search: { environmentId, instanceId },
                        });
                      },
                    }
                  : {})}
                onInstanceModelChange={(instanceId, model) => {
                  updateSettings({
                    sourceControlWriterModelSelection: createModelSelection(instanceId, model),
                  });
                }}
              />
            ) : null}
            <Switch
              checked={usesDedicatedModel}
              disabled={!usesDedicatedModel && !canEnableDedicatedModel}
              onCheckedChange={(checked) =>
                updateSettings({
                  sourceControlWriterModelSelection: checked
                    ? createModelSelection(
                        defaultModelSelection.instanceId,
                        defaultModelSelection.model,
                        defaultModelSelection.options,
                      )
                    : null,
                })
              }
              aria-label={t("sourceControl.writerModel.title")}
            />
          </div>
        }
      />
    </SettingsSection>
  );
}
