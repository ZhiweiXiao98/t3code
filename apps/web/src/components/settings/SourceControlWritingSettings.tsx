import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import type {
  ProviderInstanceId,
  ServerSettings,
  SourceControlWritingStyleMode,
} from "@t3tools/contracts";
import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";
import { createModelSelection } from "@t3tools/shared/model";
import { resolveSourceControlWriterModelSelection } from "@t3tools/shared/serverSettings";

import type { WebMessageKey } from "../../i18n/messages";
import { useI18n } from "../../i18n/WebI18nProvider";
import {
  useScopedSettings,
  useScopedSettingsMixed,
  useUpdateScopedSettings,
} from "./useScopedSettings";
import { useScopedModelDisabledReason } from "./useScopedModelAvailability";
import { useSettingsScope } from "./SettingsScopeContext";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  sortProviderInstanceEntries,
} from "../../providerInstances";
import {
  getCustomModelOptionsByInstance,
  resolveAppModelSelectionState,
} from "../../modelSelection";
import { EMPTY_SERVER_PROVIDERS } from "../../state/server";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";
import { Button } from "../ui/button";
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
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const navigate = useNavigate();
  const { environment, connectedEnvironments, targets } = useSettingsScope();
  // The representative supplies the provider list; a model choice is checked
  // against every target before it fans out.
  const environmentId = environment?.environmentId ?? null;
  const hasServerTargets = connectedEnvironments.length > 0;
  const serverProviders = environment?.serverConfig?.providers ?? EMPTY_SERVER_PROVIDERS;
  // The writing style is one object; each control only cares about its own field.
  const styleFieldMixed = (field: keyof ServerSettings["sourceControlWritingStyle"]) => {
    const first = targets[0];
    return (
      first !== undefined &&
      targets.some(
        (candidate) =>
          candidate.settings.sourceControlWritingStyle[field] !==
          first.settings.sourceControlWritingStyle[field],
      )
    );
  };
  const modeMixed = styleFieldMixed("mode");
  const instructionsMixed = styleFieldMixed("customInstructions");
  const templatesMixed = styleFieldMixed("followChangeRequestTemplates");
  const writingStyleMixed = modeMixed || instructionsMixed;
  const mixedWriterModel = useScopedSettingsMixed(["sourceControlWriterModelSelection"]);
  const customInstructionsRef = useRef<HTMLTextAreaElement>(null);
  const [editingAllInstructions, setEditingAllInstructions] = useState(false);
  const [allInstructions, setAllInstructions] = useState<string | null>(null);
  const style = settings.sourceControlWritingStyle;
  const defaults = DEFAULT_UNIFIED_SETTINGS.sourceControlWritingStyle;
  const isSourceControlWritingStyleDirty =
    writingStyleMixed ||
    style.mode !== defaults.mode ||
    style.customInstructions !== defaults.customInstructions;

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
  const writerModelDisabledReason = useScopedModelDisabledReason(settings, instanceEntries);

  return (
    <SettingsSection id="source-control-text-generation" title={t("sourceControl.textGeneration")}>
      <SettingsRow
        serverScoped
        settingKeys={["sourceControlWritingStyle"]}
        mixed={writingStyleMixed}
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
            value={modeMixed ? null : style.mode}
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
              <SelectValue>
                {(value: SourceControlWritingStyleMode | null) =>
                  value === null ? "Mixed" : t(MODE_OPTION_MESSAGE_KEYS[value].label)
                }
              </SelectValue>
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
        {writingStyleMixed ? (
          <div className="mt-3 max-w-2xl space-y-2 pb-3.5">
            {editingAllInstructions ? (
              <>
                <Textarea
                  value={allInstructions ?? ""}
                  onChange={(event) => setAllInstructions(event.target.value)}
                  rows={4}
                  aria-label="Custom source control instructions for all selected environments"
                  placeholder="Write the instructions each selected environment should use."
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={allInstructions === null}
                  onClick={() => {
                    if (allInstructions === null) return;
                    updateSettings({
                      sourceControlWritingStyle: {
                        mode: "custom",
                        customInstructions: allInstructions.trim(),
                      },
                    });
                    setEditingAllInstructions(false);
                  }}
                >
                  Apply instructions to all
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setAllInstructions(null);
                  setEditingAllInstructions(true);
                }}
              >
                Write custom instructions for all
              </Button>
            )}
          </div>
        ) : style.mode === "custom" ? (
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
        settingKeys={["sourceControlWritingStyle"]}
        mixed={templatesMixed}
        {...searchableSetting("follow-change-request-templates")}
        title={t("sourceControl.followTemplates.title")}
        description={t("sourceControl.followTemplates.description")}
        resetAction={
          templatesMixed ||
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
            mixed={templatesMixed}
            checked={templatesMixed ? false : style.followChangeRequestTemplates}
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
        settingKeys={["sourceControlWriterModelSelection"]}
        {...searchableSetting("source-control-writer-model")}
        description="Model for source control text and branch or bookmark names. Off uses the environment's text generation model."
        control={
          !hasServerTargets ? (
            <span className="text-sm text-muted-foreground">
              Connect an environment to choose its source control writer model.
            </span>
          ) : (
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
                  triggerClassName={SETTINGS_PICKER_TRIGGER_CLASSNAME}
                  triggerAriaLabel={t("sourceControl.writerModel.title")}
                  {...(mixedWriterModel ? { triggerLabel: "Mixed" } : {})}
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
                  getModelDisabledReason={writerModelDisabledReason}
                  onInstanceModelChange={(instanceId, model) => {
                    const reason = writerModelDisabledReason(instanceId, model);
                    if (reason) {
                      toastManager.add({
                        type: "error",
                        title: "Source control writer model not saved",
                        description: reason,
                      });
                      return;
                    }
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
                aria-label="Use a separate source control writer model"
              />
            </div>
          )
        }
      />
    </SettingsSection>
  );
}
