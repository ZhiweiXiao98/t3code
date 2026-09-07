import { connectionStatusText } from "@t3tools/client-runtime/connection";

import {
  useClientSettings,
  useClientSettingsHydrated,
  useUpdateClientSettings,
} from "~/hooks/useSettings";
import type { EnvironmentPresentation } from "~/state/environments";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { SettingsRow, SettingsSection } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { useI18n } from "../../i18n/WebI18nProvider";
import { translateWebSource } from "../../i18n/messages";

const preferences = [
  { value: 100, label: "Prefer" },
  { value: 50, label: "Normal" },
  { value: 25, label: "Less often" },
  { value: 0, label: "Manual only" },
];

export function LoadBalancingSettings({
  environments,
}: {
  environments: ReadonlyArray<EnvironmentPresentation>;
}) {
  const settings = useClientSettings();
  const settingsHydrated = useClientSettingsHydrated();
  const updateSettings = useUpdateClientSettings();
  const { locale } = useI18n();
  const translate = (source: string) => translateWebSource(locale, source);

  if (environments.length < 2) {
    return (
      <SettingsSection {...searchableSetting("load-balancing")} variant="plain">
        <p className="px-3 text-sm text-muted-foreground sm:px-4">
          {translate("Connect another machine to automatically balance load across environments.")}
        </p>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection {...searchableSetting("load-balancing")}>
      <SettingsRow
        title="Automatically balance load"
        description="Choose a machine automatically for new threads in shared projects."
        control={
          <Switch
            aria-label={translate("Automatically balance load")}
            checked={settings.loadBalancingEnabled}
            disabled={!settingsHydrated}
            onCheckedChange={(loadBalancingEnabled) => updateSettings({ loadBalancingEnabled })}
          />
        }
      />
      {environments.map((environment) => {
        const weight = settings.loadBalancingWeights[environment.environmentId] ?? 50;
        // Keep saved slider weights until the user chooses a different preference.
        const preference = weight === 0 ? 0 : weight < 50 ? 25 : weight === 50 ? 50 : 100;

        return (
          <SettingsRow
            key={environment.environmentId}
            title={environment.label}
            description={translate(connectionStatusText(environment.connection))}
            control={
              <Select
                items={preferences}
                value={preference}
                disabled={!settingsHydrated || !settings.loadBalancingEnabled}
                onValueChange={(value) => {
                  if (value !== null) {
                    updateSettings({
                      loadBalancingWeights: {
                        ...settings.loadBalancingWeights,
                        [environment.environmentId]: value,
                      },
                    });
                  }
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="w-full sm:w-40"
                  aria-label={`${environment.label} ${translate("load preference")}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  {preferences.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {translate(label)}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            }
          />
        );
      })}
    </SettingsSection>
  );
}
