export { providerClients } from "@t3tools/client-runtime/provider-clients";

export function localizeProviderBadgeLabel(
  badgeLabel: string,
  labels: { readonly earlyAccess: string; readonly new: string },
): string {
  if (badgeLabel === "Early Access") return labels.earlyAccess;
  if (badgeLabel === "New") return labels.new;
  return badgeLabel;
}
