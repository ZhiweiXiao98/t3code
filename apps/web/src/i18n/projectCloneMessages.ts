import type { ProjectCloneSnapshot } from "@t3tools/contracts";
import type { WebTranslate } from "./WebI18nContext";

export function localizedProjectCloneProgressSummary(
  snapshot: Pick<ProjectCloneSnapshot, "stage" | "percent" | "detail" | "stalled">,
  t: WebTranslate,
): string {
  const parts = [t(`projectClone.${snapshot.stage}`)];
  if (snapshot.percent !== null) parts.push(`${snapshot.percent}%`);
  if (snapshot.stalled) parts.push(t("projectClone.stalled"));
  else if (snapshot.detail) parts.push(snapshot.detail);
  return parts.join(" · ");
}
