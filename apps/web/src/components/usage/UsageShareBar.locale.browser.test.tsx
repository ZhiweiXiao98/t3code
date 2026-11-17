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
  const expectLegend = async (label: string, entries: readonly string[]) => {
    const legend = screen.getByRole("list", { name: label, exact: true });
    await expect.element(legend).toBeVisible();
    const items = legend.element().querySelectorAll("li");
    expect(items).toHaveLength(entries.length);
    for (const [index, entry] of entries.entries()) {
      expect(items[index]?.textContent?.replace(/\s+/g, " ").trim()).toBe(entry);
    }
  };
  await expectLegend("Cost/{opaque}/$&", [
    "Input 1, 6.7%",
    "Cache read 2, 13.3%",
    "Cache write 3, 20.0%",
    "Output 4, 26.7%",
    "Other 5, 33.3%",
  ]);
  // The new accessible legend owns the labels; the graphical bar remains visible but aria-hidden.
  const costBar = screen
    .getByRole("list", { name: "Cost/{opaque}/$&", exact: true })
    .element().previousElementSibling!;
  expect(costBar.getAttribute("aria-hidden")).toBe("true");
  expect(costBar.children).toHaveLength(5);
  for (const segment of Array.from(costBar.children)) {
    await expect.poll(() => segment.getBoundingClientRect().height).toBeGreaterThan(0);
    await expect.poll(() => segment.getBoundingClientRect().width).toBeGreaterThan(0);
  }
  await screen.rerender(surface("zh-CN"));
  await expectLegend("Cost/{opaque}/$&", [
    "输入 1, 6.7%",
    "缓存读取 2, 13.3%",
    "缓存写入 3, 20.0%",
    "输出 4, 26.7%",
    "其他 5, 33.3%",
  ]);
  await expectLegend("Speed/{opaque}", ["标准 1, 16.7%", "快速 2, 33.3%", "极速 3, 50.0%"]);
  await expect
    .element(screen.getByRole("heading", { name: "Cost/{opaque}/$&", exact: true }))
    .toBeVisible();
  await screen.rerender(surface("en"));
  await expectLegend("Tokens/{opaque}", [
    "Input 1, 10.0%",
    "Cache read 2, 20.0%",
    "Cache write 3, 30.0%",
    "Output 4, 40.0%",
  ]);
  expect(cost).toEqual({ input: 1, cacheRead: 2, cacheWrite: 3, output: 4, unsplit: 5 });
});
