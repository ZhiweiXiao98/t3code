import { useI18n } from "~/i18n/WebI18nContext";
import { translateWebSource } from "~/i18n/messages";
import type { DeviceHubAccess } from "@t3tools/client-runtime/state/deviceHubAccess";
import type { DevicePermission, DeviceSummary, DeviceTextSize } from "@t3tools/contracts";
import { ChevronDown, X } from "lucide-react";
import { useAtomValue } from "@effect/atom-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "~/components/ui/collapsible";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Spinner } from "~/components/ui/spinner";
import { Switch } from "~/components/ui/switch";
import { Toggle, ToggleGroup } from "~/components/ui/toggle-group";
import { cn } from "~/lib/utils";
import type { DeviceControls } from "./useDeviceControls";
import { deviceEventLogAtom } from "./deviceHubAtoms";

const TEXT_SIZES: ReadonlyArray<{ value: DeviceTextSize; label: string }> = [
  { value: "small", label: "Small" },
  { value: "default", label: "Default" },
  { value: "large", label: "Large" },
  { value: "extra-large", label: "Extra large" },
];

const COLOR_FILTERS = [
  { value: "none", label: "None" },
  { value: "grayscale", label: "Grayscale" },
  { value: "red-green", label: "Red / green (protanopia)" },
  { value: "green-red", label: "Green / red (deuteranopia)" },
  { value: "blue-yellow", label: "Blue / yellow (tritanopia)" },
] as const;

const ORIENTATIONS = [
  { value: "portrait", label: "Portrait" },
  { value: "landscape_left", label: "Landscape left" },
  { value: "portrait_upside_down", label: "Upside down" },
  { value: "landscape_right", label: "Landscape right" },
] as const;

const IOS_PERMISSIONS: ReadonlyArray<{ value: DevicePermission; label: string }> = [
  { value: "camera", label: "Camera" },
  { value: "microphone", label: "Microphone" },
  { value: "photos", label: "Photos" },
  { value: "contacts", label: "Contacts" },
  { value: "calendar", label: "Calendar" },
  { value: "reminders", label: "Reminders" },
  { value: "location", label: "Location" },
  { value: "notifications", label: "Notifications" },
  { value: "motion", label: "Motion" },
  { value: "media-library", label: "Media library" },
  { value: "faceid", label: "Face ID" },
];

const ANDROID_PERMISSIONS: ReadonlyArray<{ value: DevicePermission; label: string }> = [
  { value: "camera", label: "Camera" },
  { value: "microphone", label: "Microphone" },
  { value: "photos", label: "Photos" },
  { value: "contacts", label: "Contacts" },
  { value: "calendar", label: "Calendar" },
  { value: "location", label: "Location" },
  { value: "notifications", label: "Notifications" },
  { value: "motion", label: "Physical activity" },
];

const LOCATION_PRESETS = [
  { label: "San Francisco", latitude: 37.7749, longitude: -122.4194 },
  { label: "New York", latitude: 40.7128, longitude: -74.006 },
  { label: "London", latitude: 51.5074, longitude: -0.1278 },
  { label: "Stockholm", latitude: 59.3293, longitude: 18.0686 },
  { label: "Tokyo", latitude: 35.6762, longitude: 139.6503 },
] as const;

export function DeviceToolsPanel(props: {
  readonly controls: DeviceControls;
  readonly hostDiagnostics: string | undefined;
  readonly device: DeviceSummary;
  readonly access: DeviceHubAccess | null;
  readonly axOverlay: boolean;
  readonly onAxOverlayChange: (enabled: boolean) => void;
  readonly onClose: () => void;
  readonly className?: string;
}) {
  const { locale: devicePreviewLocale, t } = useI18n();
  const { device, controls } = props;
  const { detail, pending, error, foregroundApp, disabled, act } = controls;
  const settings = detail?.settings;
  const isIos = device.platform === "ios";

  return (
    <div
      className={cn("flex min-h-0 flex-col border-border bg-background text-sm", props.className)}
    >
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <span className="font-medium">{translateWebSource(devicePreviewLocale, "Tools")}</span>
        {pending ? <Spinner size="sm" /> : null}
        <Button
          size="icon-xs"
          variant="ghost-muted"
          aria-label={translateWebSource(devicePreviewLocale, "Close tools")}
          className="ml-auto"
          onClick={props.onClose}
        >
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <p className="border-b bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
        ) : null}
        {detail === null && !error ? (
          <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
            <Spinner size="sm" />
            {translateWebSource(devicePreviewLocale, "Reading device settings…")}
          </div>
        ) : null}

        {props.hostDiagnostics ? (
          <Section title={translateWebSource(devicePreviewLocale, "Host diagnostics")}>
            <p className="whitespace-pre-line text-xs text-muted-foreground">
              {props.hostDiagnostics}
            </p>
          </Section>
        ) : null}

        <Section title={translateWebSource(devicePreviewLocale, "App")}>
          <Row label={translateWebSource(devicePreviewLocale, "Foreground")}>
            <span className="truncate font-mono text-xs">{foregroundApp?.id ?? "-"}</span>
          </Row>
          {foregroundApp ? (
            <div className="flex gap-1.5">
              <Button
                size="xs"
                variant="outline"
                disabled={disabled}
                onClick={() => void act({ type: "terminateApp", appId: foregroundApp.id })}
              >
                {translateWebSource(devicePreviewLocale, "Terminate")}
              </Button>
              <Button
                size="xs"
                variant="outline"
                disabled={disabled}
                onClick={() => void act({ type: "launchApp", appId: foregroundApp.id })}
              >
                {translateWebSource(devicePreviewLocale, "Relaunch")}
              </Button>
            </div>
          ) : null}
          <SubmitRow
            placeholder={translateWebSource(devicePreviewLocale, "https://… or myapp://")}
            action={translateWebSource(devicePreviewLocale, "Open")}
            disabled={disabled}
            onSubmit={(url) => act({ type: "openUrl", url })}
          />
          <SubmitRow
            placeholder={
              isIos
                ? translateWebSource(devicePreviewLocale, "Bundle ID to launch")
                : translateWebSource(devicePreviewLocale, "Package name to launch")
            }
            action={translateWebSource(devicePreviewLocale, "Launch")}
            disabled={disabled}
            onSubmit={(appId) => act({ type: "launchApp", appId })}
          />
        </Section>

        <Section
          title={
            isIos
              ? translateWebSource(devicePreviewLocale, "Simulator")
              : translateWebSource(devicePreviewLocale, "Emulator")
          }
        >
          <Row label={translateWebSource(devicePreviewLocale, "Appearance")}>
            <ToggleGroup
              aria-label={translateWebSource(devicePreviewLocale, "Appearance")}
              value={settings?.appearance ? [settings.appearance] : []}
              disabled={disabled}
              onValueChange={(value) => {
                const next = value[0];
                if (next === "light" || next === "dark")
                  void act({ type: "setAppearance", value: next });
              }}
            >
              <Toggle value="light">{translateWebSource(devicePreviewLocale, "Light")}</Toggle>
              <Toggle value="dark">{translateWebSource(devicePreviewLocale, "Dark")}</Toggle>
            </ToggleGroup>
          </Row>
          <Row label={translateWebSource(devicePreviewLocale, "Text size")}>
            <ChoiceSelect
              ariaLabel={translateWebSource(devicePreviewLocale, "Text size")}
              value={settings?.textSize ?? null}
              options={TEXT_SIZES}
              disabled={disabled}
              onChange={(value) => act({ type: "setTextSize", value })}
            />
          </Row>
          {isIos ? (
            <>
              <Row label={translateWebSource(devicePreviewLocale, "Liquid Glass")}>
                <ToggleGroup
                  aria-label={translateWebSource(devicePreviewLocale, "Liquid Glass")}
                  value={settings?.liquidGlass ? [settings.liquidGlass] : []}
                  disabled={disabled || settings?.liquidGlass === undefined}
                  onValueChange={(value) => {
                    const next = value[0];
                    if (next === "clear" || next === "tinted") {
                      void act({ type: "setLiquidGlass", value: next });
                    }
                  }}
                >
                  <Toggle value="clear">{t("device.glass.clear")}</Toggle>
                  <Toggle value="tinted">
                    {translateWebSource(devicePreviewLocale, "Tinted")}
                  </Toggle>
                </ToggleGroup>
              </Row>
              <Row label={translateWebSource(devicePreviewLocale, "Color filter")}>
                <ChoiceSelect
                  ariaLabel={translateWebSource(devicePreviewLocale, "Color filter")}
                  value={settings?.colorFilter ?? null}
                  options={COLOR_FILTERS}
                  disabled={disabled}
                  onChange={(value) => act({ type: "setColorFilter", value })}
                />
              </Row>
            </>
          ) : (
            <Row label={translateWebSource(devicePreviewLocale, "Orientation")}>
              <ChoiceSelect
                ariaLabel={translateWebSource(devicePreviewLocale, "Orientation")}
                value={null}
                placeholder={translateWebSource(devicePreviewLocale, "Rotate to…")}
                options={ORIENTATIONS}
                disabled={disabled}
                onChange={(value) => act({ type: "setOrientation", value })}
              />
            </Row>
          )}
          <SwitchRow
            label={translateWebSource(devicePreviewLocale, "Reduce Motion")}
            checked={settings?.reduceMotion}
            disabled={disabled}
            onChange={(value) => act({ type: "setToggle", setting: "reduceMotion", value })}
          />
          {isIos ? (
            <>
              <SwitchRow
                label={translateWebSource(devicePreviewLocale, "Increase Contrast")}
                checked={settings?.increaseContrast}
                disabled={disabled}
                onChange={(value) => act({ type: "setToggle", setting: "increaseContrast", value })}
              />
              <SwitchRow
                label={translateWebSource(devicePreviewLocale, "Reduce Transparency")}
                checked={settings?.reduceTransparency}
                disabled={disabled}
                onChange={(value) =>
                  act({ type: "setToggle", setting: "reduceTransparency", value })
                }
              />
              <SwitchRow
                label={translateWebSource(devicePreviewLocale, "Show Borders")}
                checked={settings?.showBorders}
                disabled={disabled}
                onChange={(value) => act({ type: "setToggle", setting: "showBorders", value })}
              />
              <SwitchRow
                label={translateWebSource(devicePreviewLocale, "VoiceOver")}
                checked={settings?.voiceOver}
                disabled={disabled}
                onChange={(value) => act({ type: "setToggle", setting: "voiceOver", value })}
              />
            </>
          ) : (
            <SwitchRow
              label={translateWebSource(devicePreviewLocale, "Network")}
              checked={settings?.networkEnabled}
              disabled={disabled}
              onChange={(value) => act({ type: "setToggle", setting: "networkEnabled", value })}
            />
          )}
        </Section>

        <Section title={translateWebSource(devicePreviewLocale, "Accessibility")}>
          <SwitchRow
            label={translateWebSource(devicePreviewLocale, "Overlay element frames")}
            checked={props.axOverlay}
            disabled={props.access === null}
            onChange={(value) => {
              props.onAxOverlayChange(value);
              return Promise.resolve();
            }}
          />
        </Section>

        <LocationSection
          disabled={disabled}
          canClear={isIos}
          onSet={(latitude, longitude) => act({ type: "setLocation", latitude, longitude })}
          onClear={() => act({ type: "clearLocation" })}
        />

        <PermissionsSection
          permissions={isIos ? IOS_PERMISSIONS : ANDROID_PERMISSIONS}
          canReset={isIos}
          defaultAppId={foregroundApp?.id ?? ""}
          disabled={disabled}
          onDecide={(appId, permission, decision) =>
            act({ type: "setPermission", appId, permission, decision })
          }
        />

        {isIos ? (
          <Section title={translateWebSource(devicePreviewLocale, "Push notification")}>
            <SubmitRow
              placeholder={translateWebSource(devicePreviewLocale, "Alert text")}
              action={translateWebSource(devicePreviewLocale, "Send")}
              disabled={disabled || !foregroundApp}
              onSubmit={(payload) =>
                foregroundApp
                  ? act({ type: "sendPush", appId: foregroundApp.id, payload })
                  : Promise.resolve(false)
              }
            />
            {!foregroundApp ? (
              <p className="text-xs text-muted-foreground">
                {translateWebSource(devicePreviewLocale, "Open an app first.")}
              </p>
            ) : null}
          </Section>
        ) : null}

        {isIos && props.access ? <EventLogSection access={props.access} device={device} /> : null}
      </div>
    </div>
  );
}

function Section(props: { readonly title: string; readonly children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-b px-3 py-2.5 last:border-b-0">
      <h3 className="text-xs font-medium text-muted-foreground">{props.title}</h3>
      {props.children}
    </section>
  );
}

function Row(props: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-3">
      <span className="shrink-0 text-xs text-muted-foreground">{props.label}</span>
      <div className="flex min-w-0 items-center justify-end">{props.children}</div>
    </div>
  );
}

function SwitchRow(props: {
  readonly label: string;
  readonly checked: boolean | undefined;
  readonly disabled: boolean;
  readonly onChange: (value: boolean) => Promise<unknown>;
}) {
  return (
    <Row label={props.label}>
      <Switch
        size="sm"
        aria-label={props.label}
        checked={props.checked ?? false}
        disabled={props.disabled || props.checked === undefined}
        onCheckedChange={(checked) => void props.onChange(checked)}
      />
    </Row>
  );
}

function ChoiceSelect<V extends string>(props: {
  readonly ariaLabel: string;
  readonly value: V | null;
  readonly options: ReadonlyArray<{ readonly value: V; readonly label: string }>;
  readonly disabled: boolean;
  readonly placeholder?: string;
  readonly onChange: (value: V) => Promise<unknown>;
}) {
  const { locale: devicePreviewLocale } = useI18n();
  const current = props.options.find((option) => option.value === props.value);
  return (
    <Select
      value={props.value}
      disabled={props.disabled}
      onValueChange={(value) => {
        if (value !== null && value !== props.value) void props.onChange(value as V);
      }}
    >
      <SelectTrigger size="xs" className="w-40" aria-label={props.ariaLabel}>
        <SelectValue>
          {current ? (
            translateWebSource(devicePreviewLocale, current.label)
          ) : (
            <span className="text-muted-foreground">
              {props.placeholder ?? translateWebSource(devicePreviewLocale, "Unknown")}
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectPopup align="end" alignItemWithTrigger={false}>
        {props.options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {translateWebSource(devicePreviewLocale, option.label)}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}

function SubmitRow(props: {
  readonly placeholder: string;
  readonly action: string;
  readonly disabled: boolean;
  readonly onSubmit: (value: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState("");
  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    void props.onSubmit(trimmed).then((sent) => {
      if (sent) setValue("");
    });
  };
  return (
    <form
      className="flex gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Input
        size="compact"
        font="mono"
        className="min-w-0 flex-1"
        placeholder={props.placeholder}
        value={value}
        disabled={props.disabled}
        onChange={(event) => setValue(event.target.value)}
      />
      <Button
        type="submit"
        size="xs"
        variant="outline"
        disabled={props.disabled || value.trim().length === 0}
      >
        {props.action}
      </Button>
    </form>
  );
}

function LocationSection(props: {
  readonly disabled: boolean;
  readonly canClear: boolean;
  readonly onSet: (latitude: number, longitude: number) => Promise<unknown>;
  readonly onClear: () => Promise<unknown>;
}) {
  const { locale: devicePreviewLocale } = useI18n();
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const parsed = { latitude: Number(latitude), longitude: Number(longitude) };
  const valid =
    latitude.trim() !== "" &&
    longitude.trim() !== "" &&
    Math.abs(parsed.latitude) <= 90 &&
    Math.abs(parsed.longitude) <= 180;
  return (
    <Section title={translateWebSource(devicePreviewLocale, "Location")}>
      <div className="flex gap-1.5">
        <Input
          size="compact"
          font="mono"
          className="min-w-0 flex-1"
          placeholder={translateWebSource(devicePreviewLocale, "Latitude")}
          inputMode="decimal"
          value={latitude}
          disabled={props.disabled}
          onChange={(event) => setLatitude(event.target.value)}
        />
        <Input
          size="compact"
          font="mono"
          className="min-w-0 flex-1"
          placeholder={translateWebSource(devicePreviewLocale, "Longitude")}
          inputMode="decimal"
          value={longitude}
          disabled={props.disabled}
          onChange={(event) => setLongitude(event.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Select<string | null>
          value={null}
          disabled={props.disabled}
          onValueChange={(value) => {
            const preset = LOCATION_PRESETS.find((candidate) => candidate.label === value);
            if (!preset) return;
            setLatitude(String(preset.latitude));
            setLongitude(String(preset.longitude));
            void props.onSet(preset.latitude, preset.longitude);
          }}
        >
          <SelectTrigger
            size="xs"
            className="w-32"
            aria-label={translateWebSource(devicePreviewLocale, "Location preset")}
          >
            <SelectValue>
              <span className="text-muted-foreground">
                {translateWebSource(devicePreviewLocale, "Preset…")}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectPopup align="start" alignItemWithTrigger={false}>
            {LOCATION_PRESETS.map((preset) => (
              <SelectItem key={preset.label} value={preset.label}>
                {translateWebSource(devicePreviewLocale, preset.label)}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <Button
          size="xs"
          variant="outline"
          disabled={props.disabled || !valid}
          onClick={() => void props.onSet(parsed.latitude, parsed.longitude)}
        >
          {translateWebSource(devicePreviewLocale, "Set")}
        </Button>
        {props.canClear ? (
          <Button
            size="xs"
            variant="ghost"
            disabled={props.disabled}
            onClick={() => {
              setLatitude("");
              setLongitude("");
              void props.onClear();
            }}
          >
            {translateWebSource(devicePreviewLocale, "Clear")}
          </Button>
        ) : null}
      </div>
    </Section>
  );
}

function PermissionsSection(props: {
  readonly permissions: ReadonlyArray<{ value: DevicePermission; label: string }>;
  readonly canReset: boolean;
  readonly defaultAppId: string;
  readonly disabled: boolean;
  readonly onDecide: (
    appId: string,
    permission: DevicePermission,
    decision: "grant" | "revoke" | "reset",
  ) => Promise<unknown>;
}) {
  const { locale: devicePreviewLocale } = useI18n();
  const [appId, setAppId] = useState("");
  const [permission, setPermission] = useState<DevicePermission>("camera");
  const resolvedAppId = appId.trim() || props.defaultAppId;
  const decide = (decision: "grant" | "revoke" | "reset") =>
    void props.onDecide(resolvedAppId, permission, decision);
  return (
    <Section title={translateWebSource(devicePreviewLocale, "Permissions")}>
      <Input
        size="compact"
        font="mono"
        placeholder={props.defaultAppId || translateWebSource(devicePreviewLocale, "App ID")}
        value={appId}
        disabled={props.disabled}
        onChange={(event) => setAppId(event.target.value)}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <ChoiceSelect
          ariaLabel={translateWebSource(devicePreviewLocale, "Permission")}
          value={permission}
          options={props.permissions}
          disabled={props.disabled}
          onChange={(value) => {
            setPermission(value);
            return Promise.resolve();
          }}
        />
        <Button
          size="xs"
          variant="outline"
          disabled={props.disabled || !resolvedAppId}
          onClick={() => decide("grant")}
        >
          {translateWebSource(devicePreviewLocale, "Grant")}
        </Button>
        <Button
          size="xs"
          variant="outline"
          disabled={props.disabled || !resolvedAppId}
          onClick={() => decide("revoke")}
        >
          {translateWebSource(devicePreviewLocale, "Revoke")}
        </Button>
        {props.canReset ? (
          <Button
            size="xs"
            variant="ghost"
            disabled={props.disabled || !resolvedAppId}
            onClick={() => decide("reset")}
          >
            {translateWebSource(devicePreviewLocale, "Reset")}
          </Button>
        ) : null}
      </div>
    </Section>
  );
}

function EventLogSection(props: {
  readonly access: DeviceHubAccess;
  readonly device: DeviceSummary;
}) {
  const { locale: devicePreviewLocale } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 border-b px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">
        {translateWebSource(devicePreviewLocale, "Event log")}
        <ChevronDown
          className={cn("ml-auto size-3.5 transition-transform", open && "rotate-180")}
        />
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <EventLogEntries access={props.access} device={props.device} />
      </CollapsiblePanel>
    </Collapsible>
  );
}

// The panel unmounts while closed, so the log streams only while it is open.
function EventLogEntries(props: {
  readonly access: DeviceHubAccess;
  readonly device: DeviceSummary;
}) {
  const { locale: devicePreviewLocale } = useI18n();
  const entries = useAtomValue(
    deviceEventLogAtom({
      access: props.access,
      platform: props.device.platform,
      deviceId: props.device.id,
    }),
  );
  return (
    <ol className="max-h-64 overflow-y-auto px-3 py-2 font-mono text-2xs leading-relaxed">
      {entries.length === 0 ? (
        <li className="text-muted-foreground">
          {translateWebSource(devicePreviewLocale, "No events yet.")}
        </li>
      ) : (
        entries.map((entry) => (
          <li key={entry.id} className="flex gap-2">
            <span className="shrink-0 text-muted-foreground">{entry.timestamp.slice(11, 19)}</span>
            <span className="truncate">{entry.summary}</span>
          </li>
        ))
      )}
    </ol>
  );
}
