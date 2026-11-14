import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { render, type Screen } from "../../../test/render";
import { SecretInput } from "./SecretInput";

const input = (screen: Screen) => screen.container.querySelector("input")!;

async function edit(screen: Screen, value: string) {
  await userEvent.clear(input(screen));
  if (value) await userEvent.type(input(screen), value);
  await userEvent.click(document.body);
}

describe("SecretInput", () => {
  it("preserves a configured secret on empty edits and commits a replacement", async () => {
    const onCommit = vi.fn();
    await using screen = await render(<SecretInput configured value="" onCommit={onCommit} />);
    expect(input(screen).type).toBe("password");

    await userEvent.click(input(screen));
    await userEvent.click(document.body);
    expect(onCommit).not.toHaveBeenCalled();

    await edit(screen, "replacement");
    expect(onCommit).toHaveBeenCalledExactlyOnceWith("replacement");
    expect(input(screen).value).toBe("");
  });

  it("keeps an in-progress replacement when settings refresh", async () => {
    const onCommit = vi.fn();
    const ui = () => <SecretInput configured value="" onCommit={onCommit} />;
    await using screen = await render(ui());

    await userEvent.type(input(screen), "replacement");
    await screen.rerender(ui());
    expect(input(screen).value).toBe("replacement");

    await userEvent.keyboard("{Enter}");
    expect(onCommit).toHaveBeenCalledExactlyOnceWith("replacement");
  });
});

it("updates only owned placeholders and preserves an in-progress secret and supplied placeholder", async () => {
  const onCommit = vi.fn();
  const surface = (locale: "en" | "zh-CN", configured = true, placeholder?: string) => (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => {},
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <SecretInput
        configured={configured}
        value=""
        onCommit={onCommit}
        {...(placeholder === undefined ? {} : { placeholder })}
      />
    </WebI18nContext>
  );
  await using screen = await render(surface("en"));
  await expect
    .element(input(screen))
    .toHaveAttribute("placeholder", "Stored secret, enter a new value to replace");
  await page.elementLocator(input(screen)).fill("opaque/{secret}/$&");
  await screen.rerender(surface("zh-CN"));
  await expect.element(input(screen)).toHaveAttribute("placeholder", "已保存密钥，输入新值以替换");
  await expect.element(input(screen)).toHaveValue("opaque/{secret}/$&");
  expect(onCommit).not.toHaveBeenCalled();
  await userEvent.keyboard("{Enter}");
  expect(onCommit).toHaveBeenCalledExactlyOnceWith("opaque/{secret}/$&");
  await screen.rerender(surface("zh-CN", false, "Not set"));
  await expect.element(input(screen)).toHaveAttribute("placeholder", "Not set");
  await screen.rerender(surface("zh-CN", false));
  await expect.element(input(screen)).toHaveAttribute("placeholder", "未设置");
});
