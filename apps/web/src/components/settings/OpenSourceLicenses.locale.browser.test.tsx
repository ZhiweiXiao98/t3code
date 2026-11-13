import type { ReactNode } from "react";
import { expect, it, vi } from "vite-plus/test";
import { render, stubGlobal } from "../../../test/render";
import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";

// This test exercises the real manifest loader, decoder, retry and notices; settings navigation
// and scoped-setting discovery are outside that static-asset boundary.
vi.mock(import("./settingsLayout"), () => ({
  SettingsPageContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SettingsSection: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));
import { OpenSourceLicensesPanel } from "./OpenSourceLicenses";

it("relabels a cached decoder issue without fetching, then retries the real manifest load", async () => {
  const entry = {
    kind: "package",
    bundles: ["web"],
    license: "MIT",
    name: "opaque/{name}/$&",
    version: "1",
    noticeText: "literal/{notice}/$&",
    sourceUrl: null,
  };
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ schemaVersion: 1, entries: [null] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ schemaVersion: 1, entries: [entry] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  using _fetch = stubGlobal("fetch", fetch);
  const surface = (locale: "en" | "zh-CN") => (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => {},
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <OpenSourceLicensesPanel />
    </WebI18nContext>
  );
  await using screen = await render(surface("en"));
  await expect
    .element(screen.getByText("License entry 1 is not an object.", { exact: true }))
    .toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(1);
  await screen.rerender(surface("zh-CN"));
  await expect.element(screen.getByText("许可证条目 1 不是对象。", { exact: true })).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(1);
  await screen.rerender(surface("en"));
  await screen.getByRole("button", { name: "Try again", exact: true }).click();
  await expect.element(screen.getByText(entry.name, { exact: true })).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(2);
});
