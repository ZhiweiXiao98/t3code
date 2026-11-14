import "~/index.css";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render, stubGlobal } from "../../../test/render";
import { AppAtomRegistryProvider } from "../../rpc/atomRegistry";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { LocalEnvironmentSetting } from "./LocalEnvironmentSetting";

// Keep the actual row and confirmation UI, but do not initialize a connection runtime.
vi.mock("../../state/environments", async (original) => ({
  ...(await original<typeof import("../../state/environments")>()),
  usePrimaryEnvironmentId: () => null,
  usePrimaryEnvironment: () => null,
}));
vi.mock("../../state/entities", async (original) => ({
  ...(await original<typeof import("../../state/entities")>()),
  useServerConfigs: () => new Map(),
}));
vi.mock("../../state/session", async (original) => ({
  ...(await original<typeof import("../../state/session")>()),
  useEnvironmentScope: () => false,
  useEnvironmentsWithScope: () => new Set(),
}));
vi.mock("./useScopedSettings", async (original) => ({
  ...(await original<typeof import("./useScopedSettings")>()),
  useClearScopedSettings: () => () => undefined,
  useClearProjectOverrides: () => () => undefined,
}));

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
        <LocalEnvironmentSetting />
      </AppAtomRegistryProvider>
    </WebI18nContext>
  );
}

it.each([true, false])(
  "keeps cached owned local environment failure current (enabled=%s)",
  async (enabled) => {
    let reject!: (error: unknown) => void;
    const setEnabled = vi.fn(
      () =>
        new Promise<void>((_resolve, fail) => {
          reject = fail;
        }),
    );
    using _bridge = stubGlobal("desktopBridge", {
      getLocalEnvironmentEnabled: () => enabled,
      setLocalEnvironmentEnabled: setEnabled,
    });
    await using screen = await render(surface("en"));
    await page.getByRole("switch", { name: "Local environment", exact: true }).click();
    expect(setEnabled).not.toHaveBeenCalled();
    await page
      .getByRole("button", {
        name: enabled ? "Restart and turn off" : "Restart and turn on",
        exact: true,
      })
      .click();
    await screen.rerender(surface("zh-CN"));
    reject(null);
    await expect.element(page.getByText("无法更改此设置。", { exact: true })).toBeVisible();
    for (const locale of ["en", "zh-CN", "en"] as const) {
      await screen.rerender(surface(locale));
      await expect
        .element(
          page.getByText(locale === "en" ? "Couldn't change this setting." : "无法更改此设置。", {
            exact: true,
          }),
        )
        .toBeVisible();
    }
    expect(setEnabled).toHaveBeenCalledExactlyOnceWith(!enabled);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("switch", { name: "Local environment", exact: true }).click();
    await expect
      .element(page.getByText("Couldn't change this setting.", { exact: true }))
      .not.toBeInTheDocument();
    expect(setEnabled).toHaveBeenCalledOnce();
  },
);

it("keeps an external local environment error collision literal", async () => {
  const raw = "Couldn't change this setting.";
  const setEnabled = vi.fn().mockRejectedValue(new Error(raw));
  using _bridge = stubGlobal("desktopBridge", {
    getLocalEnvironmentEnabled: () => true,
    setLocalEnvironmentEnabled: setEnabled,
  });
  await using screen = await render(surface("en"));
  await page.getByRole("switch", { name: "Local environment", exact: true }).click();
  await page.getByRole("button", { name: "Restart and turn off", exact: true }).click();
  for (const locale of ["en", "zh-CN", "en"] as const) {
    await screen.rerender(surface(locale));
    await expect.element(page.getByText(raw, { exact: true })).toBeVisible();
  }
  expect(setEnabled).toHaveBeenCalledExactlyOnceWith(false);
});

it("does not change local environment after cancelling confirmation", async () => {
  const setEnabled = vi.fn().mockResolvedValue(undefined);
  using _bridge = stubGlobal("desktopBridge", {
    getLocalEnvironmentEnabled: () => true,
    setLocalEnvironmentEnabled: setEnabled,
  });
  await using _screen = await render(surface("en"));
  await page.getByRole("switch", { name: "Local environment", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(setEnabled).not.toHaveBeenCalled();
});
