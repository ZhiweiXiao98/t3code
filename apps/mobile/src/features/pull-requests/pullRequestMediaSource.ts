import { localizeMobileString, MOBILE_LOCALE, type MobileLocale } from "../../i18n/mobileStrings";
import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import { SOURCE_CONTROL_MEDIA_ASSET, type EnvironmentId } from "@t3tools/contracts";
import type { FilePreviewItem } from "../../components/ui/FilePreviewModal.types";

export interface PullRequestMediaLocation {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly repository?: string;
}

/** Keep the original resource identity so previewers can resolve and renew its capability. */
export function pullRequestMediaSource(url: string, location: PullRequestMediaLocation | null) {
  const fetchUrl = sourceControlClients.mediaUrl(url)?.fetchUrl;
  return location && fetchUrl
    ? {
        environmentId: location.environmentId,
        resource: {
          _tag: SOURCE_CONTROL_MEDIA_ASSET,
          cwd: location.cwd,
          url: fetchUrl,
          ...(location.repository ? { repository: location.repository } : {}),
        },
      }
    : { uri: url };
}

export function pullRequestImageSource(
  url: string,
  location: PullRequestMediaLocation | null,
): FilePreviewItem {
  return { kind: "image", ...pullRequestMediaSource(url, location) };
}

export function pullRequestMediaName(
  url: string,
  caption: string | undefined,
  fallback: "Attachment" | "Image",
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  return (
    caption || new URL(url).pathname.split("/").pop() || localizeMobileString(fallback, locale)
  );
}

/** Track missing-name provenance before the fallback becomes indistinguishable from a real name. */
export function pullRequestImagePreviewMetadata(
  url: string,
  caption: string | undefined,
  fallback: "Attachment" | "Image",
  locale: MobileLocale = MOBILE_LOCALE,
): Pick<FilePreviewItem, "name" | "displayName"> {
  const name = caption || new URL(url).pathname.split("/").pop();
  return name ? { name } : { name: fallback, displayName: localizeMobileString(fallback, locale) };
}
