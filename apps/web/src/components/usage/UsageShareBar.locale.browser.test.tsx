import "~/index.css";
import { expect, it } from "vite-plus/test";
import { render } from "../../../test/render";
import { costTypeSegments, tokenTypeSegments, speedCostSegments } from "./usageBreakdown";
import { UsageShareBar } from "./UsageShareBar";

it("renders current-locale own segment labels while keeping values and caller labels literal", async () => {
  const cost = { input: 1, cacheRead: 2, cacheWrite: 3, output: 4, unsplit: 5 };
  const tokens = {
    uncachedInputTokens: 1,
    cachedInputTokens: 2,
    cacheCreationTokens: 3,
    outputTokens: 4,
  };
  const speed = { standard: 1, fast: 2, ultrafast: 3, premium: 0 };
  const surface = (locale: "en" | "zh-CN") => (
    <>
      <UsageShareBar
        label="Cost/{opaque}/$&"
        segments={costTypeSegments(cost, locale)}
        format={String}
      />
      <UsageShareBar
        label="Tokens/{opaque}"
        segments={tokenTypeSegments(tokens, locale)}
        format={String}
      />
      <UsageShareBar
        label="Speed/{opaque}"
        segments={speedCostSegments(speed, locale)}
        format={String}
      />
    </>
  );
  await using screen = await render(surface("en"));
  await expect
    .element(
      screen.getByRole("img", {
        name: "Cost/{opaque}/$&: Input 1, Cache read 2, Cache write 3, Output 4, Other 5",
        exact: true,
      }),
    )
    .toBeVisible();
  const costBar = screen
    .getByRole("img", {
      name: "Cost/{opaque}/$&: Input 1, Cache read 2, Cache write 3, Output 4, Other 5",
      exact: true,
    })
    .element();
  expect(costBar.children).toHaveLength(5);
  for (const segment of Array.from(costBar.children)) {
    await expect.poll(() => segment.getBoundingClientRect().height).toBeGreaterThan(0);
    await expect.poll(() => segment.getBoundingClientRect().width).toBeGreaterThan(0);
  }
  await screen.rerender(surface("zh-CN"));
  await expect
    .element(
      screen.getByRole("img", {
        name: "Cost/{opaque}/$&: 输入 1, 缓存读取 2, 缓存写入 3, 输出 4, 其他 5",
        exact: true,
      }),
    )
    .toBeVisible();
  await expect
    .element(
      screen.getByRole("img", { name: "Speed/{opaque}: 标准 1, 快速 2, 极速 3", exact: true }),
    )
    .toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Cost/{opaque}/$&", exact: true }))
    .toBeVisible();
  await screen.rerender(surface("en"));
  await expect
    .element(
      screen.getByRole("img", {
        name: "Tokens/{opaque}: Input 1, Cache read 2, Cache write 3, Output 4",
        exact: true,
      }),
    )
    .toBeVisible();
  expect(cost).toEqual({ input: 1, cacheRead: 2, cacheWrite: 3, output: 4, unsplit: 5 });
});
