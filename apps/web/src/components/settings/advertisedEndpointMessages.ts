import type { AdvertisedEndpoint } from "@t3tools/contracts";
import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";

/** Localize only a producer-marked built-in label, never overwrite the raw preference-key label. */
export function advertisedEndpointLabel(
  endpoint: AdvertisedEndpoint,
  locale: ResolvedAppLocale,
): string {
  if (locale !== "zh-CN") return endpoint.label;
  const core =
    endpoint.source === "desktop-core" &&
    endpoint.provider.id === "desktop-core" &&
    endpoint.provider.kind === "core" &&
    !endpoint.provider.isAddon;
  const manual =
    endpoint.source === "user" &&
    endpoint.provider.id === "manual" &&
    endpoint.provider.kind === "manual" &&
    !endpoint.provider.isAddon;
  switch (endpoint.labelSource) {
    case "desktop.this-machine":
      return core && endpoint.label === "This machine" ? "本机" : endpoint.label;
    case "desktop.local-network":
      return core && endpoint.label === "Local network" ? "本地网络" : endpoint.label;
    case "desktop.custom-https":
      return manual && endpoint.label === "Custom HTTPS" ? "自定义 HTTPS" : endpoint.label;
    case "desktop.custom-endpoint":
      return manual && endpoint.label === "Custom endpoint" ? "自定义端点" : endpoint.label;
    default:
      return endpoint.label;
  }
}
