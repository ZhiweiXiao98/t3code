import { useI18n } from "../../i18n/WebI18nContext";
import { translateWebSource } from "../../i18n/messages";
import {
  isModifierPairShortcut,
  type DesktopCaptureConfigApplied,
  type DesktopCaptureConfigPreview,
  type DesktopSnapShotState,
} from "@t3tools/contracts";
import { parseKeybindingShortcut } from "@t3tools/shared/keybindings";
import { FileDiff } from "@pierre/diffs/react";
import { parseDiffFromFile } from "@pierre/diffs";
import { settlePromise } from "@t3tools/client-runtime/state/runtime";
import * as Cause from "effect/Cause";
import { useState } from "react";
import { getDesktopSnapShotBridge } from "../../lib/desktopSnapShot";
import { resolveDiffThemeName } from "../../lib/diffRendering";
import { PREFERRED_HIGHLIGHTER } from "../../lib/syntaxHighlighting";
import { useRenderedAppearance } from "../../hooks/useTheme";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { shortcutToKeybindingInput } from "./KeybindingsSettings.logic";
import {
  useSnapShotShortcutRecorder,
  formatSnapShotShortcutError,
  type SnapShotShortcutError,
} from "./useSnapShotShortcutRecorder";

const CONFIG_ERRORS = {
  prepare: "Couldn't prepare the changes. Check Advanced for help.",
  save: "Couldn't save your shortcut. Review the changes and try again.",
} as const;
type ConfigError = ({ code: keyof typeof CONFIG_ERRORS } | { message: SnapShotShortcutError }) & {
  detail?: string;
};

const DEFAULT_SHORTCUT = parseKeybindingShortcut("Ctrl+Shift+2")!;

export function CaptureShortcutConfig({
  state,
  disabled = false,
  onBusyChange,
  onSaved,
  onComplete,
}: {
  state: DesktopSnapShotState;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onSaved?: () => Promise<unknown>;
  onComplete?: () => Promise<void>;
}) {
  const { locale, t } = useI18n();
  const bridge = getDesktopSnapShotBridge();
  const resolvedTheme = useRenderedAppearance();
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const [preview, setPreview] = useState<DesktopCaptureConfigPreview | null>(null);
  const [result, setResult] = useState<DesktopCaptureConfigApplied | null>(null);
  const [error, setError] = useState<ConfigError | null>(null);
  const [working, setWorking] = useState<"reading" | "writing" | null>(null);
  const [keys, setKeys] = useState<string | null>(null);
  const [customFile, setCustomFile] = useState(false);
  const busy = disabled || working !== null;
  const changed = preview !== null && preview.before !== preview.after;
  const niri = state.linuxBackend === "niri";
  const desktop = niri ? "Niri" : "Hyprland";
  const shortcutKeys = (keys ?? preview?.shortcut)?.trim();
  const recorder = useSnapShotShortcutRecorder({
    shortcut: shortcutKeys
      ? (parseKeybindingShortcut(shortcutKeys.replace(/super/gi, "meta")) ?? DEFAULT_SHORTCUT)
      : DEFAULT_SHORTCUT,
    disabled: busy,
    allowModifierPairs: false,
    onStart: () => setError(null),
    onError: (message) => setError({ message }),
    onRecord: (shortcut) => {
      if (isModifierPairShortcut(shortcut)) return;
      setKeys(
        shortcutToKeybindingInput({
          ...shortcut,
          ctrlKey: shortcut.ctrlKey || shortcut.modKey,
          modKey: false,
        }),
      );
      setPreview(null);
      setError(null);
    },
  });
  const actionBusy = busy || recorder.recording;
  const diff =
    preview && changed
      ? parseDiffFromFile(
          { name: preview.path, contents: preview.before },
          { name: preview.path, contents: preview.after },
        )
      : null;
  const begin = (phase: "reading" | "writing") => {
    setWorking(phase);
    onBusyChange?.(true);
    setError(null);
  };
  const end = () => {
    setWorking(null);
    onBusyChange?.(false);
  };
  const read = async (chooseFile = customFile, operation: "install" | "remove" = "install") => {
    if (actionBusy || !bridge) return;
    begin("reading");
    setPreview(null);
    setResult(null);
    setCustomFile(chooseFile);
    const previewed = await settlePromise(() =>
      bridge.previewSnapShotConfig({
        operation,
        chooseFile,
        ...(keys?.trim() ? { shortcut: keys.trim() } : {}),
      }),
    );
    if (previewed._tag === "Success") {
      setPreview(previewed.value);
    } else {
      const cause = Cause.squash(previewed.cause);
      setError({
        code: "prepare",
        ...(cause instanceof Error ? { detail: cause.message } : {}),
      });
    }
    end();
  };
  const apply = async () => {
    if (actionBusy || !preview || !bridge) return;
    begin("writing");
    const saved = await settlePromise(async () => {
      const applied = await bridge.applySnapShotConfig(preview.id);
      setResult(applied);
      await onSaved?.();
      if (!applied.warning && preview.operation === "install" && onComplete) {
        toastManager.add({
          type: "success",
          title: translateWebSource(locale, "Shortcut saved"),
          description: t("settingsResidual.shortcutUse", { shortcut: preview.shortcut }),
        });
        await onComplete();
      }
    });
    if (saved._tag === "Failure") {
      const cause = Cause.squash(saved.cause);
      setError({
        code: "save",
        ...(cause instanceof Error ? { detail: cause.message } : {}),
      });
      setPreview(null);
    }
    end();
  };

  return (
    <div className="space-y-4 text-sm">
      {!result ? (
        <div className="flex items-center justify-between gap-3">
          <span>{translateWebSource(locale, "Shortcut")}</span>
          {recorder.input}
        </div>
      ) : null}
      {recorder.recording ? (
        <p role="status" className="text-xs text-muted-foreground">
          {translateWebSource(locale, "Press your shortcut. Esc cancels.")}
        </p>
      ) : null}
      {result ? (
        <p role="status">
          {result.warning
            ? translateWebSource(
                locale,
                "Saved, but the shortcut needs attention. Check Advanced for help.",
              )
            : preview?.operation === "remove"
              ? translateWebSource(locale, "Shortcut removed.")
              : t("settingsResidual.shortcutCapture", { shortcut: preview?.shortcut ?? "" })}
        </p>
      ) : preview ? (
        <>
          <p className="text-muted-foreground">
            {changed
              ? preview.operation === "remove"
                ? translateWebSource(locale, "Review the change below to remove your shortcut.")
                : translateWebSource(locale, "Review the change below, then save your shortcut.")
              : preview.operation === "remove"
                ? translateWebSource(locale, "There's no capture shortcut to remove.")
                : translateWebSource(locale, "This shortcut is already set up.")}
          </p>
          {diff ? (
            <div
              className="max-h-80 overflow-auto rounded-lg border text-xs"
              aria-label={translateWebSource(locale, "Shortcut changes")}
            >
              <FileDiff
                fileDiff={diff}
                options={{
                  diffStyle: "unified",
                  theme: resolveDiffThemeName(resolvedTheme),
                  overflow: "wrap",
                  preferredHighlighter: PREFERRED_HIGHLIGHTER,
                }}
              />
            </div>
          ) : null}
          {changed ? (
            <p className="text-xs text-muted-foreground">
              {translateWebSource(locale, "Only these changes will be saved. We'll keep a backup.")}
            </p>
          ) : null}
          <div className="flex gap-2">
            {changed || preview.operation === "install" ? (
              <Button
                disabled={
                  actionBusy ||
                  (preview.operation === "install" && state.shortcutActionRegistered === false)
                }
                aria-busy={working === "writing"}
                onClick={() => void apply()}
              >
                {working === "writing"
                  ? translateWebSource(locale, "Saving…")
                  : changed
                    ? preview.operation === "install"
                      ? translateWebSource(locale, "Save shortcut")
                      : translateWebSource(locale, "Remove shortcut")
                    : translateWebSource(locale, "Done")}
              </Button>
            ) : null}
            <Button variant="ghost" disabled={actionBusy} onClick={() => setPreview(null)}>
              {translateWebSource(locale, "Cancel")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-muted-foreground">
            {translateWebSource(
              locale,
              "Allow T3 Code to read your desktop settings. You'll review any changes here before saving.",
            )}
          </p>
          <Button
            disabled={actionBusy || !bridge}
            aria-busy={working === "reading"}
            onClick={() => void read()}
          >
            {working === "reading"
              ? translateWebSource(locale, "Preparing changes…")
              : translateWebSource(locale, "Review changes")}
          </Button>
        </>
      )}
      {error ? (
        <p role="alert" className="text-destructive">
          {"code" in error
            ? translateWebSource(locale, CONFIG_ERRORS[error.code])
            : formatSnapShotShortcutError(locale, error.message)}
        </p>
      ) : null}
      {state.shortcutActionRegistered === false && state.shortcutMessage ? (
        <p role="status" className="text-muted-foreground">
          {state.shortcutPending
            ? translateWebSource(locale, "Connecting to your desktop…")
            : translateWebSource(locale, "Restart T3 Code to finish connecting your shortcut.")}
        </p>
      ) : null}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">{translateWebSource(locale, "Advanced")}</summary>
        <div className="mt-3 space-y-3">
          {error?.detail || result?.warning ? (
            <div className="space-y-1">
              <p className="font-medium text-foreground">
                {translateWebSource(locale, "Troubleshooting")}
              </p>
              <p className="break-words">{error?.detail ?? result?.warning}</p>
            </div>
          ) : null}
          <div className="space-y-1">
            <p className="font-medium text-foreground">
              {translateWebSource(locale, "Settings file")}
            </p>
            <p className="break-all font-mono">
              {preview?.path ??
                state.shortcutConfigPath ??
                (niri ? "~/.config/niri/config.kdl" : "~/.config/hypr/hyprland.conf")}
            </p>
            {niri ? (
              <p>
                {translateWebSource(locale, "T3 Code also reads any files included by this file.")}
              </p>
            ) : null}
            {preview && preview.resolvedPath !== preview.path ? (
              <p className="break-all">
                {t("settingsResidual.linkedFile", { path: preview.resolvedPath })}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={actionBusy || !bridge}
              onClick={() => void read(true)}
            >
              {translateWebSource(locale, "Choose a different file…")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={actionBusy || !bridge}
              onClick={() => void read(customFile, "remove")}
            >
              {translateWebSource(locale, "Remove shortcut…")}
            </Button>
            {result ? (
              <Button
                size="sm"
                variant="outline"
                disabled={actionBusy || !bridge}
                onClick={() => void read()}
              >
                {translateWebSource(locale, "Review changes")}
              </Button>
            ) : null}
          </div>
          <p>
            {translateWebSource(locale, "Use your desktop's shortcut settings file.")}{" "}
            {niri
              ? translateWebSource(
                  locale,
                  "A custom --config or NIRI_CONFIG can change its location.",
                )
              : translateWebSource(
                  locale,
                  "On Omarchy, use your own bindings file, not its defaults.",
                )}
          </p>
          {result?.backupPath ? (
            <p className="break-all">
              {t("settingsResidual.backupFile", { path: result.backupPath })}
            </p>
          ) : null}
          <p className="font-medium text-foreground">
            {translateWebSource(locale, "Manual setup")}
          </p>
          <p>
            {niri
              ? translateWebSource(
                  locale,
                  "Paste this inside binds { … } in your Niri config, then save.",
                )
              : translateWebSource(
                  locale,
                  "Add this binding to your Hyprland config, then save.",
                )}{" "}
            {translateWebSource(locale, "Change the keys if needed.")}
          </p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-muted/50 p-3">
            {state.shortcutBinding}
          </pre>
          <Button
            size="sm"
            variant="outline"
            disabled={actionBusy || !state.shortcutBinding}
            onClick={() => {
              if (state.shortcutBinding) copyToClipboard(state.shortcutBinding);
            }}
          >
            {isCopied
              ? translateWebSource(locale, "Copied")
              : translateWebSource(locale, "Copy shortcut")}
          </Button>
          <p>{t("settingsResidual.removeDesktopShortcut", { desktop })}</p>
          {state.shortcutActionRegistered === false ? (
            <p role="status">{state.shortcutMessage}</p>
          ) : null}
          {onComplete ? (
            <Button
              size="sm"
              variant="outline"
              disabled={actionBusy || state.shortcutActionRegistered === false}
              onClick={() => void onComplete()}
            >
              {translateWebSource(locale, "I've added the shortcut")}
            </Button>
          ) : null}
        </div>
      </details>
    </div>
  );
}
