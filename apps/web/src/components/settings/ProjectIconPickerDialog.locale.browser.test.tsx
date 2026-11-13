import "~/index.css";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";
import { ProjectIconPickerDialog } from "./ProjectIconPickerDialog";

it("relabels emoji controls while keeping the selected emoji and save payload across locale changes", async () => {
  const onSelect = vi.fn();
  const onOpenChange = vi.fn();
  const surface = (locale: "en" | "zh-CN") => (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => {},
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <ProjectIconPickerDialog
        open
        current={{ kind: "emoji", emoji: "🚀" }}
        projectName="opaque/{Books}/$&"
        onSelect={onSelect}
        onOpenChange={onOpenChange}
      />
    </WebI18nContext>
  );
  await using screen = await render(surface("en"));
  await expect
    .element(page.getByRole("button", { name: "Rocket", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  await screen.rerender(surface("zh-CN"));
  await expect
    .element(page.getByRole("button", { name: "火箭", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "书籍", exact: true }).click();
  await expect
    .element(page.getByRole("button", { name: "书籍", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  await expect.element(page.getByRole("button", { name: "大脑", exact: true })).toBeVisible();
  await screen.rerender(surface("en"));
  await expect
    .element(page.getByRole("button", { name: "Books", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Save icon", exact: true }).click();
  expect(onSelect).toHaveBeenCalledExactlyOnceWith({ kind: "emoji", emoji: "📚" });
  expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
});
