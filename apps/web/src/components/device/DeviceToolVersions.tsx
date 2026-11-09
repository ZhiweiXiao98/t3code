import { useI18n } from "~/i18n/WebI18nContext";
import { translateWebMessage, translateWebSource } from "~/i18n/messages";
import type { ReactNode } from "react";
import type { DeviceToolVersions as ToolVersions } from "@t3tools/contracts";
import { InlineButton } from "~/components/ui/button";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "~/components/ui/popover";

export function DeviceToolVersions({
  tools,
  action,
  kind,
  owner,
  error,
}: {
  tools: ToolVersions | undefined;
  action?: ReactNode;
  kind?: keyof ToolVersions;
  owner?: string | undefined;
  error?: string | undefined;
}) {
  const { locale: devicePreviewLocale } = useI18n();
  const selected = kind ? tools?.[kind] : undefined;
  const version =
    selected?.runningVersion ??
    (selected?.installedVersions.includes(selected.requiredVersion)
      ? selected.requiredVersion
      : selected?.installedVersions
          .toSorted((a, b) => a.localeCompare(b, undefined, { numeric: true }))
          .at(-1));
  const label = kind === "hub" ? "Device hub" : "Agent device";
  return (
    <Popover>
      <PopoverTrigger
        aria-label={
          kind
            ? translateWebMessage(
                devicePreviewLocale,
                version
                  ? "device.tools.versionDetails"
                  : selected
                    ? "device.tools.uninstalledDetails"
                    : "device.tools.unknownVersionDetails",
                { label: translateWebSource(devicePreviewLocale, label), version: version ?? "" },
              )
            : undefined
        }
        render={<InlineButton tone="muted" />}
      >
        {kind
          ? version
            ? `v${version}`
            : selected
              ? translateWebSource(devicePreviewLocale, "Not installed")
              : translateWebSource(devicePreviewLocale, "Version unknown")
          : error
            ? translateWebSource(devicePreviewLocale, "Versions unavailable")
            : translateWebSource(devicePreviewLocale, "Versions")}
      </PopoverTrigger>
      <PopoverPopup align="end" width="md">
        <PopoverTitle>
          {kind
            ? translateWebSource(devicePreviewLocale, label)
            : translateWebSource(devicePreviewLocale, "Device tools")}
        </PopoverTitle>
        {tools ? (
          <div className="mt-4 divide-y divide-border/50">
            {(
              [
                ["Device hub", tools.hub],
                ["Agent device", tools.agent],
              ] as const
            )
              .filter(([name]) => !kind || name === label)
              .map(([name, tool]) => (
                <div key={name} className="space-y-2 py-3 first:pt-0 last:pb-0">
                  {!kind ? (
                    <p className="text-xs font-medium">
                      {translateWebSource(devicePreviewLocale, name)}
                    </p>
                  ) : null}
                  <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">
                      {translateWebSource(devicePreviewLocale, "Running")}
                    </dt>
                    <dd className="text-right font-mono">
                      {tool.runningVersion ??
                        translateWebSource(devicePreviewLocale, "Not running")}
                    </dd>
                    <dt className="text-muted-foreground">
                      {translateWebSource(devicePreviewLocale, "Required")}
                    </dt>
                    <dd className="text-right font-mono">{tool.requiredVersion}</dd>
                    <dt className="text-muted-foreground">
                      {translateWebSource(devicePreviewLocale, "Installed")}
                    </dt>
                    <dd className="text-right font-mono break-words">
                      {tool.installedVersions.join(", ") ||
                        translateWebSource(devicePreviewLocale, "None")}
                    </dd>
                  </dl>
                </div>
              ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            {translateWebSource(devicePreviewLocale, "Versions have not been checked.")}
          </p>
        )}
        <p className="mt-4 border-t border-border/50 pt-3 text-xs text-muted-foreground">
          {owner ? (
            <>{translateWebMessage(devicePreviewLocale, "device.tools.managedBy", { owner })} </>
          ) : null}
          {translateWebSource(
            devicePreviewLocale,
            "Tools update automatically on this host when needed.",
          )}
        </p>
        {error ? (
          <p role="status" className="mt-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </PopoverPopup>
    </Popover>
  );
}
