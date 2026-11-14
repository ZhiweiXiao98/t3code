import "~/index.css";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { DEFAULT_SERVER_SETTINGS, EnvironmentId } from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS, type ClientSettings } from "@t3tools/contracts/settings";
import { AsyncResult } from "effect/reactivity";
import * as Cause from "effect/Cause";
import { render } from "../../../test/render";
import { AppAtomRegistryProvider } from "../../rpc/atomRegistry";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";

const fixture = vi.hoisted(() => ({ clear: vi.fn(), update: vi.fn(), hydrated: true }));
const environmentId = EnvironmentId.make("profile-fixture");
const profile = {
  id: "profile-fixture",
  name: "Literal $& {profile}",
  kind: "persistent" as const,
};
const settings = { ...DEFAULT_CLIENT_SETTINGS, browserProfiles: [profile] };
vi.mock("../../env", async (original) => ({
  ...(await original<typeof import("../../env")>()),
  isElectron: true,
}));
vi.mock("../preview/previewBridge", async (original) => ({
  ...(await original<typeof import("../preview/previewBridge")>()),
  previewBridge: null,
}));
vi.mock("../../hooks/useSettings", async (original) => ({
  ...(await original<typeof import("../../hooks/useSettings")>()),
  useClientSettings: (select: (value: ClientSettings) => unknown) => select(settings),
  useClientSettingsHydrated: () => fixture.hydrated,
  getClientSettings: () => settings,
  useUpdatePrimarySettings: () => fixture.update,
  usePrimarySettingsAvailable: () => true,
}));
vi.mock("../../state/environments", async (original) => ({
  ...(await original<typeof import("../../state/environments")>()),
  useEnvironments: () => ({
    environments: [{ environmentId }],
    isReady: true,
    networkStatus: "online",
    presentationById: new Map(),
  }),
  usePrimaryEnvironment: () => null,
  usePrimaryEnvironmentId: () => null,
}));
vi.mock("../../state/entities", async (original) => ({
  ...(await original<typeof import("../../state/entities")>()),
  useServerConfigs: () =>
    new Map([[environmentId, { environment: { capabilities: { serverBrowser: true } } }]]),
}));
vi.mock("../../state/managedPolicy", async (original) => ({
  ...(await original<typeof import("../../state/managedPolicy")>()),
  usePrimaryManagedPolicy: () => undefined,
}));
vi.mock("../../state/session", async (original) => ({
  ...(await original<typeof import("../../state/session")>()),
  useEnvironmentScope: () => true,
  useEnvironmentsWithScope: () => new Set(),
}));
vi.mock("../../state/use-atom-command", async (original) => ({
  ...(await original<typeof import("../../state/use-atom-command")>()),
  useAtomCommand: () => fixture.clear,
}));
vi.mock("./SettingsScopeContext", async (original) => ({
  ...(await original<typeof import("./SettingsScopeContext")>()),
  useOptionalSettingsScope: () => null,
  useSettingsScope: () => ({ scope: { kind: "environment" }, environment: null }),
}));
vi.mock("./useScopedSettings", async (original) => ({
  ...(await original<typeof import("./useScopedSettings")>()),
  useScopedSettings: () => DEFAULT_SERVER_SETTINGS,
  useScopedSettingsMixed: () => false,
  useUpdateScopedSettings: () => fixture.update,
  useClearScopedSettings: () => () => undefined,
  useClearProjectOverrides: () => () => undefined,
}));
import { BrowserSettingsPanel } from "./IntegrationsSettings";
function surface(locale: "en" | "zh-CN") {
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
        <BrowserSettingsPanel />
      </AppAtomRegistryProvider>
    </WebI18nContext>
  );
}
function setup() {
  fixture.clear.mockReset().mockResolvedValue(AsyncResult.success(undefined));
  fixture.update.mockReset();
  fixture.hydrated = true;
}
async function openRemoval() {
  await page.getByRole("button", { name: `${profile.name} options`, exact: true }).click();
  await page.getByRole("menuitem", { name: "Remove profile and data", exact: true }).click();
}
it("keeps cached owned profile removal failure current without another deletion", async () => {
  setup();
  let finish!: (result: ReturnType<typeof AsyncResult.failure>) => void;
  fixture.clear.mockReturnValue(
    new Promise<ReturnType<typeof AsyncResult.failure>>((resolve) => {
      finish = resolve;
    }),
  );
  await using screen = await render(surface("en"));
  await openRemoval();
  expect(fixture.clear).not.toHaveBeenCalled();
  await page.getByRole("button", { name: "Remove profile", exact: true }).click();
  await expect.element(page.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
  await expect.element(page.getByRole("button", { name: "Removing…", exact: true })).toBeDisabled();
  await screen.rerender(surface("zh-CN"));
  finish(AsyncResult.failure(Cause.die(new Error("private native detail"))));
  await expect
    .poll(() => document.querySelector('[role="alertdialog"]')?.textContent)
    .toContain("无法删除配置文件数据，请重试。");
  for (const locale of ["en", "zh-CN", "en"] as const) {
    await screen.rerender(surface(locale));
    await expect
      .element(
        page.getByText(
          locale === "en"
            ? "Profile data could not be deleted. Try again."
            : "无法删除配置文件数据，请重试。",
          { exact: true },
        ),
      )
      .toBeVisible();
    await expect.element(page.getByRole("alertdialog")).toHaveTextContent(profile.name);
    await expect
      .element(page.getByText("private native detail", { exact: true }))
      .not.toBeInTheDocument();
  }
  expect(fixture.clear).toHaveBeenCalledExactlyOnceWith({
    environmentId,
    input: { profileId: profile.id },
  });
  expect(fixture.update).not.toHaveBeenCalled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await openRemoval();
  await expect
    .element(page.getByText("Profile data could not be deleted. Try again.", { exact: true }))
    .not.toBeInTheDocument();
  expect(fixture.clear).toHaveBeenCalledOnce();
  expect(fixture.update).not.toHaveBeenCalled();
});
it.each(["Profile data could not be deleted. Try again.", ""])(
  "keeps upstream profile error suppressed (%s)",
  async (raw) => {
    setup();
    fixture.clear.mockResolvedValue(AsyncResult.failure(Cause.die(new Error(raw))));
    await using screen = await render(surface("en"));
    await openRemoval();
    await page.getByRole("button", { name: "Remove profile", exact: true }).click();
    await expect
      .element(page.getByText("Profile data could not be deleted. Try again.", { exact: true }))
      .toBeVisible();
    await screen.rerender(surface("zh-CN"));
    await expect
      .element(page.getByText("无法删除配置文件数据，请重试。", { exact: true }))
      .toBeVisible();
    expect(fixture.clear).toHaveBeenCalledOnce();
    expect(fixture.update).not.toHaveBeenCalled();
  },
);
it("does not remove a profile after cancelling confirmation", async () => {
  setup();
  await using _screen = await render(surface("en"));
  await openRemoval();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(fixture.clear).not.toHaveBeenCalled();
  expect(fixture.update).not.toHaveBeenCalled();
});
