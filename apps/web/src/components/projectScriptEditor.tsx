import { translateWebSource } from "~/i18n/messages";
import type {
  ProjectScript,
  ProjectScriptIcon,
  ResolvedKeybindingsConfig,
} from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import {
  BugIcon,
  FlaskConicalIcon,
  HammerIcon,
  ListChecksIcon,
  PlayIcon,
  WrenchIcon,
} from "lucide-react";
import React, {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  keybindingValueForCommand,
  decodeProjectScriptKeybindingRule,
} from "~/lib/projectScriptKeybindings";
import { keybindingFromKeyboardEvent } from "~/components/settings/KeybindingsSettings.logic";
import { commandForProjectScript, nextProjectScriptId } from "~/projectScripts";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Popover, PopoverPopup, PopoverTrigger } from "./ui/popover";
import { Switch } from "./ui/switch";
import { Textarea } from "./ui/textarea";
import { useI18n } from "~/i18n/WebI18nProvider";
import type { WebMessageKey } from "~/i18n/messages";

export const SCRIPT_ICONS: Array<{ id: ProjectScriptIcon; labelKey: WebMessageKey }> = [
  { id: "play", labelKey: "projectAction.icon.play" },
  { id: "test", labelKey: "projectAction.icon.test" },
  { id: "lint", labelKey: "projectAction.icon.lint" },
  { id: "configure", labelKey: "projectAction.icon.configure" },
  { id: "build", labelKey: "projectAction.icon.build" },
  { id: "debug", labelKey: "projectAction.icon.debug" },
];

export function ScriptIcon({
  icon,
  className = "size-3.5",
}: {
  icon: ProjectScriptIcon;
  className?: string;
}) {
  if (icon === "test") return <FlaskConicalIcon className={className} />;
  if (icon === "lint") return <ListChecksIcon className={className} />;
  if (icon === "configure") return <WrenchIcon className={className} />;
  if (icon === "build") return <HammerIcon className={className} />;
  if (icon === "debug") return <BugIcon className={className} />;
  return <PlayIcon className={className} />;
}

export interface NewProjectScriptInput {
  name: string;
  command: string;
  icon: ProjectScriptIcon;
  runOnWorktreeCreate: boolean;
  /** Setup scripts only: hold the agent until the script exits. */
  waitForSetup: boolean;
  keybinding: string | null;
  /** Optional URL to open in the in-app preview when this script runs. */
  previewUrl: string | null;
  /** When true, automatically open the preview panel pointed at `previewUrl`. */
  autoOpenPreview: boolean;
}

export type ProjectScriptActionResult = AtomCommandResult<void, unknown>;

export const EMPTY_PROJECT_SCRIPT_INPUT: NewProjectScriptInput = {
  name: "",
  command: "",
  icon: "play",
  runOnWorktreeCreate: false,
  waitForSetup: false,
  keybinding: null,
  previewUrl: null,
  autoOpenPreview: false,
};

/** What the editor dialog should open with. `scriptId: null` means "add". */
export interface ProjectScriptEditorRequest {
  scriptId: string | null;
  initial: NewProjectScriptInput;
  /** Validation error to show immediately (e.g. a failed t3.json import). */
  error?: string;
}

export function editorRequestForScript(
  script: ProjectScript,
  keybindings: ResolvedKeybindingsConfig,
): ProjectScriptEditorRequest {
  return {
    scriptId: script.id,
    initial: {
      name: script.name,
      command: script.command,
      icon: script.icon,
      runOnWorktreeCreate: script.runOnWorktreeCreate,
      waitForSetup: script.runOnWorktreeCreate && script.async === false,
      keybinding: keybindingValueForCommand(keybindings, commandForProjectScript(script.id)),
      previewUrl: script.previewUrl ?? null,
      autoOpenPreview: script.autoOpenPreview ?? false,
    },
  };
}

/**
 * Add/edit dialog for a project script, shared by the chat-header scripts menu
 * and the project settings page. The parent owns which script (if any) is
 * being edited via `request`; the dialog owns the form state and validation.
 */
export function ProjectScriptEditorDialog({
  request,
  scripts,
  onSubmit,
  onDelete,
  onClose,
}: {
  request: ProjectScriptEditorRequest | null;
  /** Existing scripts, used to derive a unique id for new scripts. */
  scripts: ReadonlyArray<ProjectScript>;
  onSubmit: (
    scriptId: string | null,
    input: NewProjectScriptInput,
  ) => Promise<ProjectScriptActionResult>;
  onDelete: (scriptId: string) => void;
  onClose: () => void;
}) {
  const { locale: uiLocale } = useI18n();
  const { t } = useI18n();
  const formId = React.useId();
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [icon, setIcon] = useState<ProjectScriptIcon>("play");
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [runOnWorktreeCreate, setRunOnWorktreeCreate] = useState(false);
  const [waitForSetup, setWaitForSetup] = useState(false);
  const [keybinding, setKeybinding] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [autoOpenPreview, setAutoOpenPreview] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [savingRequest, setSavingRequest] = useState<ProjectScriptEditorRequest | null>(null);
  const pendingSubmissionRef = useRef<{ request: ProjectScriptEditorRequest } | null>(null);

  const isOpen = request !== null;
  const isEditing = request?.scriptId != null;
  const isSaving = request !== null && savingRequest === request;

  // A save completion must not affect a replacement request or an unmounted editor.
  useLayoutEffect(
    () => () => {
      if (pendingSubmissionRef.current?.request === request) {
        pendingSubmissionRef.current = null;
      }
    },
    [request],
  );

  // Hydrate the form whenever a new request opens the dialog.
  useEffect(() => {
    if (!request) return;
    setName(request.initial.name);
    setCommand(request.initial.command);
    setIcon(request.initial.icon);
    setIconPickerOpen(false);
    setRunOnWorktreeCreate(request.initial.runOnWorktreeCreate);
    setWaitForSetup(request.initial.waitForSetup);
    setKeybinding(request.initial.keybinding ?? "");
    setPreviewUrl(request.initial.previewUrl ?? "");
    setAutoOpenPreview(request.initial.autoOpenPreview);
    setValidationError(request.error ?? null);
    setSavingRequest(null);
  }, [request]);

  const close = () => {
    pendingSubmissionRef.current = null;
    setSavingRequest(null);
    setIconPickerOpen(false);
    onClose();
  };

  const captureKeybinding = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Tab") return;
    event.preventDefault();
    if (event.key === "Backspace" || event.key === "Delete") {
      setKeybinding("");
      return;
    }
    const next = keybindingFromKeyboardEvent(event, navigator.platform);
    if (!next) return;
    setKeybinding(next);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!request || pendingSubmissionRef.current !== null) return;
    const trimmedName = name.trim();
    const trimmedCommand = command.trim();
    if (trimmedName.length === 0) {
      setValidationError(t("projectAction.validation.nameRequired"));
      return;
    }
    if (trimmedCommand.length === 0) {
      setValidationError(t("projectAction.validation.commandRequired"));
      return;
    }

    setValidationError(null);
    let payload: NewProjectScriptInput;
    try {
      const scriptIdForValidation =
        request.scriptId ??
        nextProjectScriptId(
          trimmedName,
          scripts.map((script) => script.id),
        );
      const keybindingRule = decodeProjectScriptKeybindingRule({
        keybinding,
        command: commandForProjectScript(scriptIdForValidation),
      });
      const trimmedPreviewUrl = previewUrl.trim();
      payload = {
        name: trimmedName,
        command: trimmedCommand,
        icon,
        runOnWorktreeCreate,
        waitForSetup: runOnWorktreeCreate && waitForSetup,
        keybinding: keybindingRule?.key ?? null,
        previewUrl: trimmedPreviewUrl.length > 0 ? trimmedPreviewUrl : null,
        autoOpenPreview: trimmedPreviewUrl.length > 0 ? autoOpenPreview : false,
      } satisfies NewProjectScriptInput;
    } catch (error) {
      setValidationError(
        error instanceof Error ? error.message : t("projectAction.validation.saveFailed"),
      );
      return;
    }

    const submission = { request };
    pendingSubmissionRef.current = submission;
    setSavingRequest(request);
    setIconPickerOpen(false);
    try {
      const result = await onSubmit(request.scriptId, payload);
      if (pendingSubmissionRef.current === submission) {
        if (result._tag === "Failure") {
          if (!isAtomCommandInterrupted(result)) {
            const error = squashAtomCommandFailure(result);
            setValidationError(
              error instanceof Error ? error.message : t("projectAction.validation.saveFailed"),
            );
          }
        } else {
          close();
        }
      }
    } catch (error) {
      if (pendingSubmissionRef.current === submission) {
        setValidationError(
          error instanceof Error ? error.message : t("projectAction.validation.saveFailed"),
        );
      }
    }
    if (pendingSubmissionRef.current === submission) {
      pendingSubmissionRef.current = null;
      setSavingRequest(null);
    }
  };

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            close();
          }
        }}
      >
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>
              {t(isEditing ? "projectAction.dialog.editTitle" : "projectAction.dialog.addTitle")}
            </DialogTitle>
            <DialogDescription>{t("projectAction.dialog.description")}</DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <form id={formId} onSubmit={submit}>
              <fieldset className="space-y-4" disabled={isSaving}>
                <div className="space-y-1.5">
                  <Label htmlFor="script-name">{t("projectAction.field.name")}</Label>
                  <div className="flex items-center gap-2">
                    <Popover onOpenChange={setIconPickerOpen} open={iconPickerOpen}>
                      <PopoverTrigger
                        render={
                          <Button
                            type="button"
                            variant="outline"
                            className="size-9 shrink-0"
                            aria-label={t("projectAction.icon.choose")}
                          />
                        }
                      >
                        <ScriptIcon icon={icon} className="size-4.5" />
                      </PopoverTrigger>
                      <PopoverPopup align="start">
                        <div className="grid grid-cols-3 gap-2">
                          {SCRIPT_ICONS.map((entry) => {
                            const isSelected = entry.id === icon;
                            return (
                              <button
                                key={entry.id}
                                type="button"
                                className={`relative flex flex-col items-center gap-2 rounded-md border px-2 py-2 text-xs dark:border-transparent ${
                                  isSelected
                                    ? "border-primary/70 bg-primary/10 dark:ring-1 dark:ring-primary/30"
                                    : "border-border/70 hover:bg-accent/60 dark:bg-white/[0.035]"
                                }`}
                                onClick={() => {
                                  setIcon(entry.id);
                                  setIconPickerOpen(false);
                                }}
                              >
                                <ScriptIcon icon={entry.id} className="size-4" />
                                <span>{t(entry.labelKey)}</span>
                              </button>
                            );
                          })}
                        </div>
                      </PopoverPopup>
                    </Popover>
                    <Input
                      id="script-name"
                      autoFocus
                      placeholder={t("projectAction.icon.test")}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="script-keybinding">{t("projectAction.field.keybinding")}</Label>
                  <Input
                    id="script-keybinding"
                    placeholder={t("projectAction.keybinding.placeholder")}
                    value={keybinding}
                    readOnly
                    onKeyDown={captureKeybinding}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("projectAction.keybinding.hint", { key: "Backspace" })}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="script-command">{t("projectAction.field.command")}</Label>
                  <Textarea
                    id="script-command"
                    placeholder="bun test"
                    value={command}
                    onChange={(event) => setCommand(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="script-preview-url">{t("projectAction.field.previewUrl")}</Label>
                  <Input
                    id="script-preview-url"
                    placeholder="http://localhost:5173"
                    value={previewUrl}
                    onChange={(event) => setPreviewUrl(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("projectAction.preview.description")}
                  </p>
                </div>
                <label className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-sm dark:border-transparent dark:bg-white/[0.035]">
                  <span>{t("projectAction.runOnWorktreeCreate")}</span>
                  <Switch
                    checked={runOnWorktreeCreate}
                    onCheckedChange={(checked) => setRunOnWorktreeCreate(Boolean(checked))}
                  />
                </label>
                <label
                  className={`flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-sm dark:border-transparent dark:bg-white/[0.035] ${
                    runOnWorktreeCreate ? "" : "opacity-60"
                  }`}
                >
                  <span>
                    {translateWebSource(uiLocale, "Wait for it to finish before the agent starts")}
                  </span>
                  <Switch
                    checked={waitForSetup}
                    disabled={!runOnWorktreeCreate}
                    onCheckedChange={(checked) => setWaitForSetup(Boolean(checked))}
                  />
                </label>
                <label
                  className={`flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-sm dark:border-transparent dark:bg-white/[0.035] ${
                    previewUrl.trim().length === 0 ? "opacity-60" : ""
                  }`}
                >
                  <span>{t("projectAction.autoOpenPreview")}</span>
                  <Switch
                    checked={autoOpenPreview}
                    disabled={previewUrl.trim().length === 0}
                    onCheckedChange={(checked) => setAutoOpenPreview(Boolean(checked))}
                  />
                </label>
                {validationError && <p className="text-sm text-destructive">{validationError}</p>}
              </fieldset>
            </form>
          </DialogPanel>
          <DialogFooter variant="bare">
            {isEditing && (
              <Button
                type="button"
                variant="destructive-outline"
                className="mr-auto"
                disabled={isSaving}
                onClick={() => setDeleteConfirmOpen(true)}
              >
                {t("common.delete")}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={close}>
              {t("common.cancel")}
            </Button>
            <Button form={formId} type="submit" disabled={isSaving}>
              {isSaving
                ? translateWebSource(uiLocale, "Saving…")
                : isEditing
                  ? t("projectAction.action.saveChanges")
                  : t("projectAction.action.save")}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("projectAction.delete.title", { name })}</AlertDialogTitle>
            <AlertDialogDescription>{t("projectAction.delete.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              {t("common.cancel")}
            </AlertDialogClose>
            <Button
              variant="destructive"
              disabled={isSaving}
              onClick={() => {
                if (!request?.scriptId) return;
                setDeleteConfirmOpen(false);
                close();
                onDelete(request.scriptId);
              }}
            >
              {t("projectAction.action.delete")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
