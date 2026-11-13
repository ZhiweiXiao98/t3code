import { projectCloneProgressSummary, type ProjectCloneSnapshot } from "@t3tools/contracts";
import { formatMobileMessage } from "./mobileDisplayStrings";
import { localizeMobileString, MOBILE_LOCALE, type MobileLocale } from "./mobileStrings";

export function mobileCloneProgress(
  snapshot: Pick<ProjectCloneSnapshot, "stage" | "percent" | "detail" | "stalled">,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  const parts = [
    localizeMobileString(
      projectCloneProgressSummary({
        stage: snapshot.stage,
        percent: null,
        detail: null,
        stalled: false,
      }),
      locale,
    ),
  ];
  if (snapshot.percent !== null) parts.push(`${snapshot.percent}%`);
  if (snapshot.stalled) parts.push(localizeMobileString("Stalled", locale));
  else if (snapshot.detail) parts.push(snapshot.detail);
  return parts.join(" · ");
}

export function mobileOutputFailure(error: string, locale: MobileLocale = MOBILE_LOCALE): string {
  return formatMobileMessage("Couldn't load output: {0}", [error], locale);
}

export function mobileSharedContentPrompt(
  attachments: ReadonlyArray<{ readonly type: string }>,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  if (attachments.length === 0)
    return localizeMobileString("Choose a project for what you shared", locale);
  const images = attachments.every((attachment) => attachment.type === "image");
  if (attachments.length === 1)
    return localizeMobileString(
      images
        ? "Choose a project for the image you shared"
        : "Choose a project for the file you shared",
      locale,
    );
  return formatMobileMessage(
    images
      ? "Choose a project for the {0} images you shared"
      : "Choose a project for the {0} files you shared",
    [attachments.length],
    locale,
  );
}

export function mobileSkippedThreadWarning(
  titles: readonly string[],
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  return formatMobileMessage(
    titles.length === 1 ? "{0} is on another machine." : "{0} are on another machine.",
    [titles.map((title) => `"${title}"`).join(", ")],
    locale,
  );
}
