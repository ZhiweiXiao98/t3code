import {
  addProjectRemoteSourceLabel,
  addProjectRemoteSourcePathHint,
  buildAddProjectRemoteSourceReadiness,
  sortAddProjectProviderSources,
  type AddProjectRemoteSource,
} from "@t3tools/client-runtime/operations/projects";
import type { SourceControlDiscoveryResult } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";
import { localizeMobileString, MOBILE_LOCALE, type MobileLocale } from "../../i18n/mobileStrings";

export function addProjectSourceRows(
  discovery: SourceControlDiscoveryResult | null,
  canCloneProject: boolean,
  locale: MobileLocale = MOBILE_LOCALE,
) {
  const readiness = buildAddProjectRemoteSourceReadiness(discovery);
  const providerByKind = new Map(
    (discovery?.sourceControlProviders ?? []).map((provider) => [provider.kind, provider]),
  );
  const sources: ReadonlyArray<AddProjectRemoteSource> = [
    "url",
    ...sortAddProjectProviderSources(readiness),
  ];
  return sources.map((source) => {
    const state = readiness(source);
    const label = addProjectRemoteSourceLabel(source);
    const ready = canCloneProject && state.ready;
    let subtitle: string;
    if (!canCloneProject) {
      subtitle = localizeMobileString("This connection cannot clone projects.", locale);
    } else if (state.ready) {
      subtitle =
        source === "url"
          ? localizeMobileString("Clone from a remote URL", locale)
          : formatMobileMessage(
              "Clone {0} {1}",
              [label, addProjectRemoteSourcePathHint(source)],
              locale,
            );
    } else {
      const provider = source === "url" ? undefined : providerByKind.get(source);
      if (provider === undefined) {
        subtitle = localizeMobileString(
          "Provider status unavailable. Open Source Control settings and rescan.",
          locale,
        );
      } else if (
        provider.status === "available" &&
        provider.auth.status === "unauthenticated" &&
        Option.isNone(provider.auth.detail)
      ) {
        subtitle = formatMobileMessage(
          "{0} is not authenticated. Open Source Control settings for setup guidance.",
          [provider.label],
          locale,
        );
      } else {
        // Remote install hints and auth details may contain paths or CLI diagnostics.
        subtitle = state.hint ?? "";
      }
    }
    return {
      source,
      ready,
      title:
        source === "url"
          ? localizeMobileString("Git URL", locale)
          : formatMobileMessage("{0} repository", [label], locale),
      subtitle,
    };
  });
}

export function addProjectConnectionFailureMessage(
  workspaceRoot: string,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  return formatMobileMessage(
    "This connection cannot add projects right now. Any existing files remain at {0}.",
    [workspaceRoot],
    locale,
  );
}

export function existingProjectMessage(
  title: string,
  unarchived: boolean,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  return unarchived
    ? title
    : formatMobileMessage("{0} is still archived. Try again later.", [title], locale);
}
