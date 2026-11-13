import { settingsProjectMenuDisplay } from "../settingsAccountDisplay";
import { formatMobileMessage } from "../../../i18n/mobileDisplayStrings";
import { localizeMobileString } from "../../../i18n/mobileStrings";
import { resolveEnvironmentMachineKind } from "@t3tools/contracts";

import type { AppBarMenu } from "../../../components/ui/AppBar.types";
import { ENVIRONMENT_MACHINE_SYMBOLS } from "../../../components/EnvironmentMachineSymbol";
import { useSettingsEnvironmentFilter } from "../settings-environment-filter";

/** The settings scope filter, as an `AppBar` menu. */
export function useSettingsEnvironmentMenu(): AppBarMenu {
  const {
    availableTargets,
    selectedTargets,
    selectedIds,
    selectAll,
    toggleEnvironment,
    selectableProjectGroups,
    selectedProjectKey,
    selectProject,
  } = useSettingsEnvironmentFilter();
  return {
    title: "Filter settings environments and projects",
    icon:
      selectedIds === null && selectedProjectKey === null
        ? "line.3.horizontal.decrease"
        : "line.3.horizontal.decrease.circle.fill",
    items: [
      {
        id: "environments",
        title:
          selectedIds === null
            ? "All environments"
            : formatMobileMessage(
                selectedTargets.length === 1 ? "{0} environment" : "{0} environments",
                [selectedTargets.length],
              ),
        items: [
          {
            id: "all",
            title: "All connected environments",
            selected: selectedIds === null,
            onPress: selectAll,
          },
          ...availableTargets.map((entry) => ({
            id: `environment:${entry.environmentId}`,
            title: entry.label,
            localize: false,
            icon: ENVIRONMENT_MACHINE_SYMBOLS[resolveEnvironmentMachineKind(entry.serverConfig)],
            subtitle: entry.displayUrl ?? undefined,
            selected: selectedIds === null || selectedIds.has(entry.environmentId),
            onPress: () => toggleEnvironment(entry.environmentId),
          })),
        ],
      },
      {
        id: "projects",
        localize: false,
        title:
          selectableProjectGroups.find((group) => group.key === selectedProjectKey)?.label ??
          localizeMobileString(
            selectedProjectKey === null ? "All projects" : "Unavailable project",
          ),
        items: [
          {
            id: "project:all",
            title: "All projects",
            selected: selectedProjectKey === null,
            onPress: () => selectProject(null),
          },
          ...selectableProjectGroups.map((group) => ({
            id: `project:${group.key}`,
            ...settingsProjectMenuDisplay(group),
            selected: selectedProjectKey === group.key,
            onPress: () => selectProject(group.key),
          })),
        ],
      },
    ],
  };
}
