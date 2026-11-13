import "~/index.css";
import { expect, it, vi } from "vite-plus/test";
import { act, render, stubGlobal } from "../../../../test/render";
import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";
import Spreadsheet from "./Spreadsheet";
import type { SheetLayout } from "./sheet-protocol";

const userSheet = "This sheet could not be opened. {sheet}/$&";
const userCell = "These cells could not be drawn. {cell}/$&";
function fixture(options: { frame?: "empty" | "error" | "superseded"; cells?: number } = {}) {
  const layout: SheetLayout = {
    info: {
      sheetIds: ["first", "second"],
      sheetNames: [userSheet, "second/$&"],
      activeSheet: 0,
      contentWidth: 1200,
      contentHeight: 2000,
      frozenRows: 0,
      frozenCols: 0,
      initialScrollX: 0,
      initialScrollY: 0,
    },
    used: { top: 0, left: 0, bottom: (options.cells ?? 1) - 1, right: 0 },
    merges: [],
    hidden: { rows: [], columns: [] },
    chartWidth: 0,
    chartHeight: 0,
  };
  const requests: { id: number; method: string; input: unknown }[] = [];
  const workers: FakeWorker[] = [];
  const cancelled: number[] = [];
  const pendingShows: (() => void)[] = [];
  class FakeWorker extends EventTarget {
    constructor() {
      super();
      workers.push(this);
    }
    terminate = vi.fn();
    postMessage(request: { id: number; method?: string; input: unknown; cancel?: number }) {
      if (request.cancel !== undefined) {
        cancelled.push(request.cancel);
        return;
      }
      if (!request.method) return;
      const method = request.method;
      requests.push({ ...request, method });
      const reply = () => {
        const fail = method === "show" || (method === "frame" && options.frame !== "empty");
        const value =
          method === "open"
            ? {
                tabs: [
                  { index: 0, name: userSheet },
                  { index: 1, name: "second/$&" },
                ],
                layout,
              }
            : method === "cells"
              ? [[userCell]]
              : method === "copy"
                ? "literal clipboard/{value}/$&"
                : undefined;
        this.dispatchEvent(
          new MessageEvent("message", {
            data: fail
              ? {
                  id: request.id,
                  ok: false,
                  superseded: method === "frame" && options.frame === "superseded",
                  message: "unknown provider/{error}/$&",
                }
              : { id: request.id, ok: true, value, transferred: [] },
          }),
        );
      };
      if (method === "show") pendingShows.push(reply);
      else queueMicrotask(reply);
    }
  }
  const bytes = new ArrayBuffer(1);
  const onDetails = vi.fn();
  const onError = vi.fn();
  const surface = (locale: "en" | "zh-CN") => (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => {},
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <div style={{ display: "flex", width: 600, height: 400 }}>
        <Spreadsheet bytes={bytes} onDetails={onDetails} onError={onError} />
      </div>
    </WebI18nContext>
  );
  return {
    FakeWorker,
    requests,
    workers,
    surface,
    onError,
    cancelled,
    replyShow: () => {
      const reply = pendingShows.shift();
      if (!reply) throw new Error("No pending show request");
      reply();
    },
  };
}

it.each([
  [
    "empty",
    "These cells could not be drawn. Try scrolling to another area.",
    "无法绘制这些单元格。请尝试滚动到其他区域。",
  ],
  ["error", "These cells could not be drawn.", "无法绘制这些单元格。"],
] as const)(
  "relocalizes cached %s frame and sheet-switch failures without reopening the worker",
  async (frame, english, chinese) => {
    const f = fixture({ frame });
    using _worker = stubGlobal("Worker", f.FakeWorker);
    await using screen = await render(f.surface("en"));
    await expect.element(screen.getByRole("status")).toHaveTextContent(english);
    expect(screen.container.querySelectorAll('[role="status"]')).toHaveLength(1);
    // Hold the worker reply until a real second click has cancelled that exact request.
    await screen.getByRole("tab", { name: "second/$&", exact: true }).click();
    await vi.waitFor(() =>
      expect(f.requests.filter((request) => request.method === "show")).toHaveLength(1),
    );
    const aborted = f.requests.find((request) => request.method === "show")!;
    await screen.getByRole("tab", { name: userSheet, exact: true }).click();
    expect(f.cancelled).toContain(aborted.id);
    await act(async () => {
      f.replyShow();
    });
    await expect
      .element(screen.getByText("This sheet could not be opened.", { exact: true }))
      .not.toBeInTheDocument();
    await screen.getByRole("tab", { name: "second/$&", exact: true }).click();
    await vi.waitFor(() =>
      expect(f.requests.filter((request) => request.method === "show")).toHaveLength(2),
    );
    await act(async () => {
      f.replyShow();
    });
    await expect
      .element(screen.getByText("This sheet could not be opened.", { exact: true }))
      .toBeVisible();
    await screen.rerender(f.surface("zh-CN"));
    await expect.element(screen.getByText(chinese, { exact: true })).toBeVisible();
    await expect
      .element(screen.getByText(chinese, { exact: true }))
      .toHaveAttribute("role", "status");
    expect(screen.container.querySelectorAll('[role="status"]')).toHaveLength(2);
    await expect.element(screen.getByText("无法打开此工作表。", { exact: true })).toBeVisible();
    await expect
      .element(screen.getByRole("tab", { name: userSheet, exact: true }))
      .toHaveAttribute("aria-selected", "true");
    await expect.element(screen.getByRole("gridcell")).toHaveTextContent(userCell);
    await screen.rerender(f.surface("en"));
    await expect.element(screen.getByText(english, { exact: true })).toBeVisible();
    await expect
      .element(screen.getByText(english, { exact: true }))
      .toHaveAttribute("role", "status");
    await expect
      .element(screen.getByText("This sheet could not be opened.", { exact: true }))
      .toBeVisible();
    expect(screen.container.querySelectorAll('[role="status"]')).toHaveLength(2);
    expect(f.requests.filter((request) => request.method === "open")).toHaveLength(1);
    expect(f.workers).toHaveLength(1);
    expect(f.onError).not.toHaveBeenCalled();
  },
);

it.each([
  [200_000, "ctrlKey"],
  [200_001, "ctrlKey"],
  [200_000, "metaKey"],
  [200_001, "metaKey"],
] as const)("preserves the strict copy limit at %s cells using %s", async (cells, modifier) => {
  const f = fixture({ frame: "superseded", cells });
  using _worker = stubGlobal("Worker", f.FakeWorker);
  const external = new Error("The selected cells could not be copied.");
  const write = vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(external);
  try {
    await using screen = await render(f.surface("en"));
    await expect.element(screen.getByRole("gridcell")).toHaveTextContent(userCell);
    await vi.waitFor(() =>
      expect(f.requests.some((request) => request.method === "frame")).toBe(true),
    );
    expect(screen.container.querySelector('[role="status"]')).toBeNull();
    expect(screen.container.querySelectorAll('[role="gridcell"]')).toHaveLength(1);
    const grid = screen.container.querySelector('[role="grid"]')!;
    await act(async () => {
      grid.dispatchEvent(
        new KeyboardEvent("keydown", { key: "a", [modifier]: true, bubbles: true }),
      );
      grid.dispatchEvent(
        new KeyboardEvent("keydown", { key: "c", [modifier]: true, bubbles: true }),
      );
    });
    const english =
      cells > 200_000
        ? "Select fewer than 200,000 cells to copy."
        : "The selected cells could not be copied.";
    const chinese =
      cells > 200_000 ? "请选择少于 200,000 个单元格进行复制。" : "无法复制所选单元格。";
    await expect.element(screen.getByRole("status")).toHaveTextContent(english);
    await screen.rerender(f.surface("zh-CN"));
    await expect.element(screen.getByRole("status")).toHaveTextContent(chinese);
    await screen.rerender(f.surface("en"));
    await expect.element(screen.getByRole("status")).toHaveTextContent(english);
    expect(f.requests.filter((request) => request.method === "copy")).toHaveLength(
      cells > 200_000 ? 0 : 1,
    );
    if (cells > 200_000) expect(write).not.toHaveBeenCalled();
    else expect(write).toHaveBeenCalledWith("literal clipboard/{value}/$&");
    expect(external.message).toBe("The selected cells could not be copied.");
    expect(f.workers).toHaveLength(1);
  } finally {
    write.mockRestore();
  }
});
