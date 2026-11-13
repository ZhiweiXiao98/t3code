import { expect, it, vi } from "vite-plus/test";
import { render } from "../../../test/render";
import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";
import { ComposerCommandMenu, type ComposerCommandItem } from "./ComposerCommandMenu";

it("updates PR option status accessibility without changing its selected payload", async () => {
  const item: ComposerCommandItem = {
    id: "pr-opaque",
    type: "pull-request",
    label: "Draft/{0}/$&",
    description: "opaque/repo",
    pullRequest: {
      number: 3,
      title: "Draft/{0}/$&",
      url: "https://github.com/opaque/repo/pull/3",
      headBranch: "feature",
      baseBranch: "main",
      state: "open",
      isDraft: true,
    },
  };
  const onSelect = vi.fn();
  const surface = (locale: "en" | "zh-CN") => (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => {},
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <ComposerCommandMenu
        listId="test-pr-menu"
        items={[item]}
        resolvedTheme="light"
        isLoading={false}
        triggerKind={null}
        activeItemId={item.id}
        onHighlightedItemChange={() => {}}
        onSelect={onSelect}
      />
    </WebI18nContext>
  );
  await using screen = await render(surface("en"));
  await expect.element(screen.getByRole("img", { name: "Draft", exact: true })).toBeVisible();
  await screen.rerender(surface("zh-CN"));
  await expect.element(screen.getByRole("img", { name: "草稿", exact: true })).toBeVisible();
  await expect.element(screen.getByText(item.label, { exact: true })).toBeVisible();
  await screen.getByRole("option").click();
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(item);
});
