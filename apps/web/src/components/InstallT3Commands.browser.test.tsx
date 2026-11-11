import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";

import { render } from "../../test/render";
import { WebI18nContext } from "../i18n/WebI18nContext";
import { translateWebMessage } from "../i18n/messages";
import { InstallT3Commands } from "./InstallT3Commands";

function instructions(locale: ResolvedAppLocale, command: string) {
  return (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => undefined,
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <InstallT3Commands command={command} />
    </WebI18nContext>
  );
}

it("copies byte-identical install and supplied commands before and after changing languages", async () => {
  const command = "t3 connect link --host='My host {name}'";
  await using screen = await render(instructions("zh-CN", command));
  using write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
  const commands = [
    "curl -fsSL https://t3.codes/install.sh | sh",
    "irm https://t3.codes/install.ps1 | iex",
    command,
  ];
  for (const [index, expected] of commands.entries()) {
    await userEvent.click(screen.getByRole("button", { name: "复制命令" }).nth(index));
    await vi.waitFor(() => expect(write).toHaveBeenLastCalledWith(expected));
  }
  expect(screen.container.textContent).toContain("如果已安装 t3，可跳过安装。");
  await screen.rerender(instructions("en", command));
  expect(screen.container.textContent).toContain("Skip the install if you already have t3.");
  await userEvent.click(screen.getByRole("button", { name: "Copy command" }).nth(2));
  await vi.waitFor(() => expect(write).toHaveBeenLastCalledWith(command));
});
