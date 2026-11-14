import "~/index.css";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import {
  EnvironmentId,
  ProjectId,
  DEFAULT_SERVER_SETTINGS,
  type T3ProjectFileScript,
} from "@t3tools/contracts";
import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { AsyncResult } from "effect/reactivity";
import * as Cause from "effect/Cause";
import { render } from "../../test/render";
import { AppAtomRegistryProvider } from "../rpc/atomRegistry";
import { WebI18nContext } from "../i18n/WebI18nContext";
import { translateWebMessage } from "../i18n/messages";
const fixture = vi.hoisted(() => ({
  locale: "en" as "en" | "zh-CN",
  submit: vi.fn(),
  unused: vi.fn(),
}));
const environmentId = EnvironmentId.make("import-fixture");
const fileScript: T3ProjectFileScript = {
  name: "Literal $& {action}",
  command: "echo '$& {value}'",
  previewUrl: "http://localhost:1234/literal",
  autoOpenPreview: true,
};
const member = {
  id: ProjectId.make("project-fixture"),
  environmentId,
  workspaceRoot: "/mock/literal-project",
};
const target = { environmentId, projectId: member.id, settings: DEFAULT_SERVER_SETTINGS };
vi.mock("../i18n/readWebI18n", async (original) => ({
  ...(await original<typeof import("../i18n/readWebI18n")>()),
  readWebI18n: () => ({
    locale: fixture.locale,
    t: (
      key: Parameters<typeof translateWebMessage>[1],
      values: Parameters<typeof translateWebMessage>[2],
    ) => translateWebMessage(fixture.locale, key, values),
  }),
}));
vi.mock("./settings/SettingsScopeContext", async (original) => ({
  ...(await original<typeof import("./settings/SettingsScopeContext")>()),
  useSettingsScope: () => ({
    scope: { kind: "project", members: [member] },
    targets: [target],
    target,
  }),
  useOptionalSettingsScope: () => null,
}));
vi.mock("../state/environments", async (original) => ({
  ...(await original<typeof import("../state/environments")>()),
  useEnvironments: () => ({
    environments: [
      {
        environmentId,
        serverConfig: {
          settings: DEFAULT_SERVER_SETTINGS,
          keybindings: DEFAULT_RESOLVED_KEYBINDINGS,
        },
      },
    ],
    isReady: true,
  }),
  usePrimaryEnvironmentId: () => null,
  usePrimaryEnvironment: () => null,
}));
vi.mock("../state/entities", async (original) => ({
  ...(await original<typeof import("../state/entities")>()),
  useServerConfigs: () => new Map(),
}));
vi.mock("../state/session", async (original) => ({
  ...(await original<typeof import("../state/session")>()),
  readEnvironmentScope: () => true,
  useEnvironmentScope: () => true,
  useEnvironmentsWithScope: () => new Set(),
}));
vi.mock("./settings/useScopedSettings", async (original) => ({
  ...(await original<typeof import("./settings/useScopedSettings")>()),
  useScopedSettingsWriteAllowed: () => true,
  useClearScopedSettings: () => fixture.unused,
  useClearProjectOverrides: () => fixture.unused,
}));
vi.mock("./settings/useProjectScriptSettings", async (original) => ({
  ...(await original<typeof import("./settings/useProjectScriptSettings")>()),
  useProjectScriptSettings: () => ({
    saving: false,
    persist: fixture.unused,
    submit: fixture.submit,
  }),
}));
vi.mock("../hooks/useT3ProjectFileScripts", async (original) => ({
  ...(await original<typeof import("../hooks/useT3ProjectFileScripts")>()),
  useT3ProjectFileState: (id: EnvironmentId, cwd: string | null) =>
    id === environmentId && cwd === member.workspaceRoot
      ? { status: "valid", file: { scripts: [fileScript] }, scripts: [fileScript] }
      : { status: "missing", file: null, scripts: [] },
}));
vi.mock("../state/server", async (original) => {
  const actual = await original<typeof import("../state/server")>();
  const { Atom } = await import("effect/reactivity");
  const config = Atom.make({ keybindings: DEFAULT_RESOLVED_KEYBINDINGS });
  return {
    ...actual,
    serverEnvironment: { ...actual.serverEnvironment, configValueAtom: () => config },
  };
});
import { ProjectActionsSettings } from "./settings/ProjectActionsSettings";
import ProjectScriptsControl from "./ProjectScriptsControl";
function surface(entry: "settings" | "chat", locale: "en" | "zh-CN") {
  fixture.locale = locale;
  return (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => undefined,
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <AppAtomRegistryProvider>
        {entry === "settings" ? (
          <ProjectActionsSettings />
        ) : (
          <ProjectScriptsControl
            environmentId={environmentId}
            scripts={[]}
            fileScripts={[fileScript]}
            onAddScript={fixture.submit}
            onUpdateScript={fixture.unused}
            onDeleteScript={fixture.unused}
          />
        )}
      </AppAtomRegistryProvider>
    </WebI18nContext>
  );
}
async function importAction(entry: "settings" | "chat") {
  await page
    .getByRole("button", {
      name: entry === "settings" ? "Import scripts" : "Project actions",
      exact: true,
    })
    .click();
  await page.getByRole("menuitem").filter({ hasText: fileScript.name }).click();
}
const errorText = () =>
  document.querySelector('[role="dialog"] p.text-destructive')?.textContent ?? "";
it.each(["settings", "chat"] as const)(
  "keeps cached owned %s import failure current",
  async (entry) => {
    fixture.submit.mockReset();
    fixture.unused.mockReset();
    let finish!: (result: ReturnType<typeof AsyncResult.failure>) => void;
    fixture.submit.mockReturnValue(
      new Promise<ReturnType<typeof AsyncResult.failure>>((resolve) => {
        finish = resolve;
      }),
    );
    await using screen = await render(surface(entry, "en"));
    await importAction(entry);
    await screen.rerender(surface(entry, "zh-CN"));
    finish(AsyncResult.failure(Cause.die(null)));
    await expect.poll(errorText).toBe("导入操作失败。");
    for (const locale of ["en", "zh-CN", "en"] as const) {
      await screen.rerender(surface(entry, locale));
      await expect
        .poll(errorText)
        .toBe(locale === "en" ? "Failed to import action." : "导入操作失败。");
      expect(document.querySelector<HTMLInputElement>("#script-name")!.value).toBe(fileScript.name);
      expect(document.querySelector<HTMLTextAreaElement>("#script-command")!.value).toBe(
        fileScript.command,
      );
    }
    expect(fixture.submit).toHaveBeenCalledOnce();
    const payload = fixture.submit.mock.calls[0]![entry === "settings" ? 1 : 0];
    expect(payload).toMatchObject({
      name: fileScript.name,
      command: fileScript.command,
      previewUrl: fileScript.previewUrl,
      autoOpenPreview: true,
      keybinding: null,
    });
    expect(fixture.unused).not.toHaveBeenCalled();
  },
);
it.each([
  ["settings", "raw"],
  ["settings", "interrupted"],
  ["chat", "raw"],
  ["chat", "interrupted"],
] as const)("preserves %s import %s outcome", async (entry, kind) => {
  fixture.submit.mockReset();
  fixture.unused.mockReset();
  fixture.submit.mockResolvedValue(
    AsyncResult.failure(
      kind === "raw" ? Cause.die(new Error("Failed to import action.")) : Cause.interrupt(),
    ),
  );
  await using screen = await render(surface(entry, "en"));
  await importAction(entry);
  if (kind === "raw") await expect.poll(errorText).toBe("Failed to import action.");
  await screen.rerender(surface(entry, "zh-CN"));
  expect(errorText()).toBe(kind === "raw" ? "Failed to import action." : "");
  expect(fixture.submit).toHaveBeenCalledOnce();
  expect(fixture.unused).not.toHaveBeenCalled();
});
