import type { ReactNode } from "react";
import { DEFAULT_CLIENT_SETTINGS, type BrowserImportSource } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { BrowserImportWizard } from "./BrowserImportWizard";
import { SnapShotSetupDialog } from "./SnapShotSetupDialog";

const english = "Could not check permissions. We'll try again automatically.";
const chinese = "无法检查权限。我们会自动重试。";
const source: BrowserImportSource = {
  id: "helium",
  name: "Opaque $& {0}",
  profiles: [{ directory: "Default", name: "Literal" }],
};
const profiles = [{ id: "target", name: "Opaque target" }];
function localized(locale: "en" | "zh-CN", children: ReactNode) {
  return (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => undefined,
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      {children}
    </WebI18nContext>
  );
}

it.each(["import", "snapshot"] as const)(
  "renders the owned %s permission failure without locale-triggered checks",
  async (sink) => {
    const schedule = globalThis.setInterval;
    using interval = vi
      .spyOn(globalThis, "setInterval")
      .mockImplementation(() => schedule(() => {}, 2_147_483_647));
    const check = vi.fn().mockRejectedValue(new Error("private native detail"));
    const action = vi.fn();
    const refresh = vi.fn();
    const surface = (locale: "en" | "zh-CN") =>
      localized(
        locale,
        sink === "import" ? (
          <BrowserImportWizard
            source={{ ...source, unavailable: "needsFullDiskAccess" }}
            destinationEnvironmentName="Remote"
            targetProfiles={profiles}
            canCreateProfile={false}
            onImport={action}
            onRefreshSource={refresh}
            onCheckFullDiskAccess={check}
            onOpenFullDiskAccessSettings={action}
            onClose={action}
          />
        ) : (
          <SnapShotSetupDialog
            state={{
              mode: "direct",
              shortcut: DEFAULT_CLIENT_SETTINGS.snapShotShortcut,
              shortcutRegistered: false,
              shortcutMessage: null,
              message: null,
              macPermissions: { screenRecording: false, accessibility: false },
            }}
            initialStep="access"
            wasEnabled={false}
            includeAccessibility
            busy={false}
            error={english}
            shortcutInput={null}
            shortcutStatus={null}
            shortcutChanged={false}
            canSaveShortcut={false}
            onSaveShortcut={action}
            onEnable={action}
            onAction={action}
            onRefresh={check}
            onClose={action}
            onLeaveStep={action}
          />
        ),
      );
    await using screen = await render(surface("en"));
    const notice = page.getByRole("status").filter({ hasText: english });
    await expect.element(notice).toBeVisible();
    const element = notice.element();
    await screen.rerender(surface("zh-CN"));
    await expect.poll(() => element.textContent).toBe(chinese);
    if (sink === "snapshot") {
      await page.getByText("高级", { exact: true }).click();
      await expect.element(page.getByText(english, { exact: true })).toBeVisible();
    }
    await screen.rerender(surface("en"));
    await expect.poll(() => element.textContent).toBe(english);
    expect(check).toHaveBeenCalledOnce();
    expect(interval).toHaveBeenCalledOnce();
    expect(action).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("private native detail");
  },
);

it("keeps a cached System Settings failure current without opening settings again", async () => {
  const schedule = globalThis.setInterval;
  using interval = vi
    .spyOn(globalThis, "setInterval")
    .mockImplementation(() => schedule(() => {}, 2_147_483_647));
  const check = vi.fn().mockRejectedValue(new Error("native detail"));
  const open = vi.fn().mockRejectedValue(new Error("private settings detail"));
  const other = vi.fn();
  const surface = (locale: "en" | "zh-CN") =>
    localized(
      locale,
      <BrowserImportWizard
        source={{ ...source, unavailable: "needsFullDiskAccess" }}
        destinationEnvironmentName="Remote"
        targetProfiles={profiles}
        canCreateProfile={false}
        onImport={other}
        onRefreshSource={other}
        onCheckFullDiskAccess={check}
        onOpenFullDiskAccessSettings={open}
        onClose={other}
      />,
    );
  await using screen = await render(surface("en"));
  await expect.element(page.getByText(english, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Allow", exact: true }).click();
  const message = "Could not open System Settings. Try Allow again.";
  await expect.element(page.getByText(message, { exact: true })).toBeVisible();
  const error = page.getByText(message, { exact: true }).element();
  await screen.rerender(surface("zh-CN"));
  await expect.poll(() => error.textContent).toBe("无法打开系统设置。请再次尝试“允许”。");
  await screen.rerender(surface("en"));
  await expect.poll(() => error.textContent).toBe(message);
  expect(check).toHaveBeenCalledOnce();
  expect(open).toHaveBeenCalledOnce();
  expect(other).not.toHaveBeenCalled();
  expect(interval).toHaveBeenCalledOnce();
});

it("keeps a rejected target cached after the profile returns without another import", async () => {
  const schedule = globalThis.setInterval;
  using interval = vi
    .spyOn(globalThis, "setInterval")
    .mockImplementation(() => schedule(() => {}, 2_147_483_647));
  const check = vi.fn().mockResolvedValue(true);
  const importCookies = vi
    .fn()
    .mockResolvedValue({ kind: "blocked", reason: "needsFullDiskAccess" });
  const other = vi.fn();
  const surface = (locale: "en" | "zh-CN", available = true) =>
    localized(
      locale,
      <BrowserImportWizard
        source={source}
        destinationEnvironmentName="Remote"
        targetProfiles={available ? profiles : []}
        canCreateProfile={false}
        onImport={importCookies}
        onRefreshSource={other}
        onCheckFullDiskAccess={check}
        onOpenFullDiskAccessSettings={other}
        onClose={other}
      />,
    );
  await using screen = await render(surface("en"));
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect.element(page.getByRole("button", { name: "Continue", exact: true })).toBeEnabled();
  await screen.rerender(surface("en", false));
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const english = "That profile is no longer available. Choose where to import these cookies.";
  await expect.element(page.getByRole("alert")).toHaveTextContent(english);
  await screen.rerender(surface("en"));
  const error = page.getByRole("alert");
  await expect.element(error).toHaveTextContent(english);
  await screen.rerender(surface("zh-CN"));
  await expect
    .element(error)
    .toHaveTextContent("该配置文件已不可用，请重新选择 Cookie 的导入位置。");
  await screen.rerender(surface("en"));
  await expect.element(error).toHaveTextContent(english);
  expect(importCookies).toHaveBeenCalledOnce();
  expect(check).toHaveBeenCalledOnce();
  expect(other).not.toHaveBeenCalled();
  expect(interval).toHaveBeenCalledOnce();
});

it("keeps an external import outcome with owned-looking English literal", async () => {
  const importCookies = vi
    .fn()
    .mockResolvedValue({ kind: "blocked", reason: "readFailed", message: english });
  const other = vi.fn();
  const surface = (locale: "en" | "zh-CN") =>
    localized(
      locale,
      <BrowserImportWizard
        source={source}
        destinationEnvironmentName="Remote"
        targetProfiles={profiles}
        canCreateProfile={false}
        onImport={importCookies}
        onRefreshSource={other}
        onOpenFullDiskAccessSettings={other}
        onCheckFullDiskAccess={other}
        onClose={other}
      />,
    );
  await using screen = await render(surface("en"));
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect.element(page.getByText(english, { exact: true })).toBeVisible();
  await screen.rerender(surface("zh-CN"));
  await expect.element(page.getByText(english, { exact: true })).toBeVisible();
  await screen.rerender(surface("en"));
  await expect.element(page.getByText(english, { exact: true })).toBeVisible();
  expect(importCookies).toHaveBeenCalledOnce();
  expect(other).not.toHaveBeenCalled();
});
