import { page } from "vite-plus/test/browser";
import JSZip from "jszip";
import { expect, it, vi } from "vite-plus/test";
import { render, stubGlobal } from "../../../test/render";
import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";
import { openEpub } from "./extendedDocumentPreview";
import OfficeViewer from "./OfficeViewer";

it("relocalizes generated chapter navigation without reopening the file or translating authored titles", async () => {
  const archive = new JSZip()
    .file(
      "META-INF/container.xml",
      '<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>',
    )
    .file(
      "book.opf",
      '<package><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/><item id="b" href="b.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>',
    )
    .file("a.xhtml", "<html><head><title></title></head><body>opaque/{body}/$&amp;</body></html>")
    .file("b.xhtml", "<html><head><title>Chapter 1</title></head><body>second</body></html>");
  const result = await openEpub(archive);
  const posted = vi.fn();
  class FakeWorker extends EventTarget {
    postMessage(message: unknown) {
      posted(message);
      queueMicrotask(() =>
        this.dispatchEvent(new MessageEvent("message", { data: structuredClone(result) })),
      );
    }
    terminate() {}
  }
  using _worker = stubGlobal("Worker", FakeWorker);
  const fetch = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
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
      <OfficeViewer src="https://example.test/book.epub" name="opaque/{file}/$&.epub" kind="epub" />
    </WebI18nContext>
  );
  await using screen = await render(surface("en"));
  await expect
    .element(screen.getByRole("combobox", { name: "Chapter" }))
    .toHaveTextContent("Chapter 1");
  await screen.rerender(surface("zh-CN"));
  await expect.element(screen.getByRole("combobox", { name: "章节" })).toHaveTextContent("第 1 章");
  await screen.getByRole("combobox", { name: "章节" }).click();
  await page.getByRole("option", { name: "Chapter 1", exact: true }).click();
  await expect
    .element(screen.getByRole("combobox", { name: "章节" }))
    .toHaveTextContent("Chapter 1");
  await screen.rerender(surface("en"));
  await expect
    .element(screen.getByRole("combobox", { name: "Chapter" }))
    .toHaveTextContent("Chapter 1");
  expect(fetch).toHaveBeenCalledOnce();
  expect(posted).toHaveBeenCalledOnce();
});
