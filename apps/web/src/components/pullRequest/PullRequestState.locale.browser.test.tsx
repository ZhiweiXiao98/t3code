import { expect, it } from "vite-plus/test";
import { render } from "../../../test/render";
import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";
import { PullRequestContextDetails } from "../PullRequestContextDetails";
import { PullRequestStackLayerContent } from "./PullRequestStackLayerContent";

it.each([
  ["open", false, "Open", "开放"],
  ["open", true, "Draft", "草稿"],
  ["closed", false, "Closed", "已关闭"],
  ["merged", false, "Merged", "已合并"],
] as const)(
  "relabels %s draft=%s context and stack states without changing PR data",
  async (state, isDraft, english, chinese) => {
    const metadata = {
      number: 42,
      title: "Open/{0}/$&",
      url: "https://gitlab.com/opaque/repo/-/merge_requests/42",
      headBranch: "Draft/{0}/$&",
      baseBranch: "Merged",
      state,
      isDraft,
    };
    const surface = (locale: "en" | "zh-CN") => (
      <WebI18nContext
        value={{
          locale,
          appLocale: locale,
          setAppLocale: () => {},
          t: (key, values) => translateWebMessage(locale, key, values),
        }}
      >
        <section aria-label="context">
          <PullRequestContextDetails metadata={metadata} />
        </section>
        <section aria-label="stack">
          <PullRequestStackLayerContent layer={metadata} />
        </section>
      </WebI18nContext>
    );
    await using screen = await render(surface("en"));
    const context = screen.getByRole("region", { name: "context" });
    const status = context
      .element()
      .querySelector<HTMLSpanElement>("div > div:first-child > span:last-child")!;
    const baseBranch = context.element().querySelector<HTMLElement>("code:last-child")!;
    await expect.element(status).toHaveTextContent(english);
    await expect.element(status).toBeVisible();
    await expect.element(baseBranch).toHaveTextContent(metadata.baseBranch);
    await expect.element(baseBranch).toBeVisible();
    await screen.rerender(surface("zh-CN"));
    await expect.element(status).toHaveTextContent(chinese);
    await expect.element(status).toBeVisible();
    await expect.element(baseBranch).toHaveTextContent(metadata.baseBranch);
    await expect.element(baseBranch).toBeVisible();
    await expect
      .element(
        screen.getByRole("region", { name: "context" }).getByText("合并请求 #42", { exact: true }),
      )
      .toBeVisible();
    await expect
      .element(
        screen
          .getByRole("region", { name: "stack" })
          .getByText(`#42 · ${metadata.headBranch} · ${chinese}`, { exact: true }),
      )
      .toBeVisible();
    await expect
      .element(
        screen.getByRole("region", { name: "stack" }).getByText(metadata.title, { exact: true }),
      )
      .toBeVisible();
    await screen.rerender(surface("en"));
    await expect.element(status).toHaveTextContent(english);
    await expect.element(status).toBeVisible();
    await expect.element(baseBranch).toHaveTextContent(metadata.baseBranch);
    await expect.element(baseBranch).toBeVisible();
    await expect
      .element(
        screen
          .getByRole("region", { name: "stack" })
          .getByText(`#42 · ${metadata.headBranch} · ${english}`, { exact: true }),
      )
      .toBeVisible();
  },
);
