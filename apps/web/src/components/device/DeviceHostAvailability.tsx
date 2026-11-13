import { deviceAvailabilityReason } from "~/i18n/deviceAvailabilityMessages";
import { useI18n } from "~/i18n/WebI18nContext";
import { translateWebSource } from "~/i18n/messages";
import type { DevicePlatformAvailability } from "@t3tools/contracts";
import { Check, Minus } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";

export function DeviceHostAvailability({
  platforms,
}: {
  platforms: ReadonlyArray<DevicePlatformAvailability>;
}) {
  const { locale: devicePreviewLocale } = useI18n();
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {platforms.map((platform) => (
        <Tooltip key={platform.platform}>
          <TooltipTrigger render={<span tabIndex={0} className="inline-flex items-center gap-1" />}>
            {platform.available ? <Check className="size-3" /> : <Minus className="size-3" />}
            {platform.platform === "ios" ? "iOS" : "Android"}{" "}
            {platform.available
              ? translateWebSource(devicePreviewLocale, "available")
              : translateWebSource(devicePreviewLocale, "unavailable")}
          </TooltipTrigger>
          <TooltipPopup>
            {deviceAvailabilityReason(devicePreviewLocale, platform) ??
              (platform.platform === "ios"
                ? translateWebSource(devicePreviewLocale, "iOS available")
                : translateWebSource(devicePreviewLocale, "Android available"))}
          </TooltipPopup>
        </Tooltip>
      ))}
    </div>
  );
}
