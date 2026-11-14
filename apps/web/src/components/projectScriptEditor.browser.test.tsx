import "~/index.css";
import { act, render, type Screen } from "../../test/render";
import { AuthSettingsWriteScope, EnvironmentId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { WebI18nContext } from "../i18n/WebI18nContext";
import { translateWebMessage } from "../i18n/messages";
import { AsyncResult } from "effect/reactivity";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

const permission = vi.hoisted(() => ({ allowed: true, shortcutsAllowed: true }));

vi.mock(import("~/state/session"), async (original) => ({
  ...(await original()),
  readEnvironmentScope: (_id, scope) =>
    permission.allowed && (scope !== AuthSettingsWriteScope || permission.shortcutsAllowed),
  useEnvironmentScope: () => true,
}));

import {
  EMPTY_PROJECT_SCRIPT_INPUT,
  ProjectScriptEditorDialog,
  type ProjectScriptActionResult,
  type ProjectScriptEditorRequest,
} from "./projectScriptEditor";

const onSubmit = vi.fn<Parameters<typeof ProjectScriptEditorDialog>[0]["onSubmit"]>();
const onClose = vi.fn();
const onDelete = vi.fn();

function request(name: string, error?: string): ProjectScriptEditorRequest {
  return {
    scriptId: name,
    initial: { ...EMPTY_PROJECT_SCRIPT_INPUT, name, command: `run-${name}` },
    ...(error === undefined ? {} : { error }),
  };
}

const open = (screen: Screen, nextRequest: ProjectScriptEditorRequest) =>
  screen.rerender(
    <StrictMode>
      <ProjectScriptEditorDialog
        environmentId={EnvironmentId.make("test")}
        request={nextRequest}
        scripts={[]}
        onSubmit={onSubmit}
        onClose={onClose}
        onDelete={onDelete}
      />
    </StrictMode>,
  );

const submit = () => document.querySelector("form")!.requestSubmit();
const saveButton = () => document.querySelector<HTMLButtonElement>('button[type="submit"]')!;

function deferredSave() {
  let resolve!: (result: ProjectScriptActionResult) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ProjectScriptActionResult>((resolveResult, rejectResult) => {
    resolve = resolveResult;
    reject = rejectResult;
  });
  return { promise, resolve, reject };
}

function setup() {
  permission.allowed = true;
  permission.shortcutsAllowed = true;
  onSubmit.mockReset();
  onClose.mockReset();
  onDelete.mockReset();
}

describe("project action editor save lifecycle", () => {
  it("does not close a replacement request or release its in-flight save", async () => {
    setup();
    await using screen = await render(null);
    const first = deferredSave();
    const second = deferredSave();
    onSubmit.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await open(screen, request("build"));
    await act(async () => submit());

    await open(screen, request("test"));
    expect(saveButton().disabled).toBe(false);
    expect(document.querySelector<HTMLInputElement>("#script-name")!.value).toBe("test");
    await act(async () => submit());

    await act(async () => first.resolve(AsyncResult.success(undefined)));
    expect(onClose).not.toHaveBeenCalled();
    expect(saveButton().disabled).toBe(true);

    await act(async () => second.resolve(AsyncResult.success(undefined)));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls.map(([scriptId]) => scriptId)).toEqual(["build", "test"]);
  });
});

function localized(locale: "en" | "zh-CN", value: ProjectScriptEditorRequest) {
  return (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => undefined,
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <ProjectScriptEditorDialog
        environmentId={EnvironmentId.make("test")}
        request={value}
        scripts={[]}
        onSubmit={onSubmit}
        onClose={onClose}
        onDelete={onDelete}
      />
    </WebI18nContext>
  );
}
const errorText = () =>
  document.querySelector('[role="dialog"] p.text-destructive')?.textContent ?? "";
it.each([
  ["name", "Name is required.", "请输入名称。"],
  ["command", "Command is required.", "请输入命令。"],
  ["permission", "This connection cannot change project actions.", "此连接无权更改项目操作。"],
] as const)(
  "keeps cached owned editor %s error current with the same request",
  async (kind, english, chinese) => {
    setup();
    const value = request("Literal $& {action}");
    if (kind === "name") value.initial = { ...value.initial, name: "" };
    if (kind === "command") value.initial = { ...value.initial, command: "" };
    await using screen = await render(localized("en", value));
    if (kind === "permission") permission.allowed = false;
    await act(async () => submit());
    expect(errorText()).toBe(english);
    for (const locale of ["zh-CN", "en"] as const) {
      await screen.rerender(localized(locale, value));
      await expect.poll(errorText).toBe(locale === "en" ? english : chinese);
      expect(document.querySelector<HTMLInputElement>("#script-name")!.value).toBe(
        value.initial.name,
      );
      expect(document.querySelector<HTMLTextAreaElement>("#script-command")!.value).toBe(
        value.initial.command,
      );
    }
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  },
);
it.each(["result", "throw"] as const)(
  "keeps owned editor save %s error current without resubmission",
  async (mode) => {
    setup();
    const value = request("Literal $& {action}");
    if (mode === "result") onSubmit.mockResolvedValue(AsyncResult.failure(Cause.die(null)));
    else onSubmit.mockRejectedValue(null);
    await using screen = await render(localized("en", value));
    await act(async () => submit());
    for (const locale of ["en", "zh-CN", "en"] as const) {
      await screen.rerender(localized(locale, value));
      await expect
        .poll(errorText)
        .toBe(locale === "en" ? "Failed to save action." : "保存操作失败。");
    }
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  },
);
it.each(["Failed to save action.", ""])("preserves raw editor failure %s", async (raw) => {
  setup();
  const value = request("Literal $& {action}");
  onSubmit.mockResolvedValue(AsyncResult.failure(Cause.die(new Error(raw))));
  await using screen = await render(localized("en", value));
  await act(async () => submit());
  for (const locale of ["en", "zh-CN", "en"] as const) {
    await screen.rerender(localized(locale, value));
    expect(errorText()).toBe(raw);
  }
  expect(onSubmit).toHaveBeenCalledOnce();
});

it("keeps the owned shortcut denial current without saving", async () => {
  setup();
  const value = request("Literal $& {action}");
  await using screen = await render(localized("en", value));
  const input = document.querySelector<HTMLInputElement>("#script-keybinding")!;
  await act(async () => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", code: "KeyK", ctrlKey: true, bubbles: true }),
    );
  });
  expect(input.value).not.toBe("");
  permission.shortcutsAllowed = false;
  await act(async () => submit());
  for (const locale of ["en", "zh-CN", "en"] as const) {
    await screen.rerender(localized(locale, value));
    await expect
      .poll(errorText)
      .toBe(
        locale === "en"
          ? "This connection cannot change keyboard shortcuts."
          : "此连接无权更改键盘快捷键。",
      );
  }
  expect(onSubmit).not.toHaveBeenCalled();
});
it("keeps interrupted saves silent", async () => {
  setup();
  const value = request("Literal $& {action}");
  onSubmit.mockResolvedValue(AsyncResult.failure(Cause.interrupt()));
  await using screen = await render(localized("en", value));
  await act(async () => submit());
  await screen.rerender(localized("zh-CN", value));
  expect(errorText()).toBe("");
  expect(onSubmit).toHaveBeenCalledOnce();
  expect(onClose).not.toHaveBeenCalled();
});
