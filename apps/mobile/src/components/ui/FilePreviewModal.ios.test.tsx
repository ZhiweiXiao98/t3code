import { act } from "react";
import { createRoot } from "react-dom/client";
import { EnvironmentId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";

const harness = vi.hoisted(() => ({
  locale: "en" as "en" | "zh-CN",
  native: {
    presentFile: vi.fn<(...args: unknown[]) => Promise<void>>(),
    presentFiles: vi.fn<(...args: unknown[]) => Promise<void>>(),
    presentFilesWithDisplayTitles: undefined as ((...args: unknown[]) => Promise<void>) | undefined,
    updateFile: vi.fn<(...args: unknown[]) => Promise<void>>(),
    dismissFile: vi.fn<(...args: unknown[]) => Promise<void>>(),
  },
  modernPresent: vi.fn<(...args: unknown[]) => Promise<void>>(),
  refresh: vi.fn<() => Promise<string | null>>(),
  alert: vi.fn(),
}));
vi.mock("expo", () => ({ requireNativeModule: () => harness.native }));
vi.mock("../../state/assets", () => ({ refreshAssetUrl: harness.refresh }));
vi.mock("../../lib/localAttachmentPreview", () => ({ loadLocalAttachmentPreview: vi.fn() }));
vi.mock("../../lib/attachmentDownload", () => ({
  downloadAndShareAttachment: vi.fn(),
  nativeViewerErrorMessage: () => "",
  shareLocalAttachment: vi.fn(),
}));
vi.mock("../../lib/previewPresentation", () => ({ usePreviewPresentation: () => {} }));
vi.mock("./Dialog", () => ({ alert: harness.alert }));
vi.mock("../../i18n/mobileStrings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../i18n/mobileStrings")>();
  return {
    ...actual,
    localizeMobileString: (value: string, locale?: "en" | "zh-CN") =>
      actual.localizeMobileString(value, locale ?? harness.locale),
  };
});

import { FilePreviewModal } from "./FilePreviewModal";
import type { FilePreviewSource } from "./FilePreviewModal.types";
import {
  pullRequestImagePreviewMetadata,
  pullRequestImageSource,
} from "../../features/pull-requests/pullRequestMediaSource";

function setup(modern: boolean) {
  const presentation = Promise.withResolvers<void>();
  harness.native.presentFile.mockReset().mockReturnValue(presentation.promise);
  harness.native.presentFiles.mockReset().mockReturnValue(presentation.promise);
  harness.modernPresent.mockReset().mockReturnValue(presentation.promise);
  harness.native.presentFilesWithDisplayTitles = modern ? harness.modernPresent : undefined;
  harness.native.updateFile.mockReset().mockResolvedValue(undefined);
  harness.native.dismissFile.mockReset().mockResolvedValue(undefined);
  harness.refresh.mockReset();
  harness.alert.mockReset();
  return presentation;
}

async function open(source: FilePreviewSource) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const resources = new AsyncDisposableStack();
  const root = createRoot(document.createElement("div"));
  resources.defer(() => act(async () => root.unmount()));
  const onRequestClose = vi.fn();
  const onOpenError = vi.fn();
  try {
    await act(async () =>
      root.render(
        <FilePreviewModal
          source={source}
          onRequestClose={onRequestClose}
          onOpenError={onOpenError}
        />,
      ),
    );
    const owned = resources.move();
    return { onRequestClose, onOpenError, [Symbol.asyncDispose]: () => owned.disposeAsync() };
  } finally {
    await resources.disposeAsync();
  }
}

it.each([false, true])(
  "keeps PR filenames, gallery identity and progressive updates separate from iOS titles (modern: %s)",
  async (modern) => {
    for (const locale of ["en", "zh-CN"] as const) {
      const presentation = setup(modern);
      harness.locale = locale;
      const pending = Promise.withResolvers<string>();
      harness.refresh.mockReturnValue(pending.promise);
      const url = "https://example.test/?token=Settings";
      const selected = {
        ...pullRequestImageSource(url, null),
        ...pullRequestImagePreviewMetadata(url, undefined, "Attachment", locale),
        sourceIdentifier: "selected-source",
      };
      const raw = {
        ...pullRequestImageSource("https://example.test/Image", null),
        ...pullRequestImagePreviewMetadata(
          "https://example.test/Image",
          undefined,
          "Attachment",
          locale,
        ),
        sourceIdentifier: "raw-source",
      };
      const slow = {
        ...pullRequestImageSource("https://github.com/user-attachments/assets/slow", {
          environmentId: EnvironmentId.make("environment"),
          cwd: "/repo",
        }),
        sourceIdentifier: "slow-source",
      };
      const rawPreview = {
        ...pullRequestImageSource("https://example.test/Preview", null),
        name: "Preview",
        sourceIdentifier: "preview-source",
      };
      const imageUrl = "https://example.test/?token=Image";
      const imageFallback = {
        ...pullRequestImageSource(imageUrl, null),
        ...pullRequestImagePreviewMetadata(imageUrl, undefined, "Image", locale),
        sourceIdentifier: "image-source",
      };
      const gallery = [raw, slow, rawPreview, imageFallback, selected];
      await using preview = await open({ ...selected, gallery });
      const method = modern ? harness.modernPresent : harness.native.presentFiles;
      expect(method).toHaveBeenCalledOnce();
      const args = method.mock.calls[0]!;
      const identifier = args.at(-1);
      expect(typeof identifier).toBe("string");
      const uris = [
        "https://example.test/Image",
        null,
        "https://example.test/Preview",
        imageUrl,
        url,
      ];
      const names = ["Image", "Preview", "Preview", "Image", "Attachment"];
      const sources = [
        "raw-source",
        "slow-source",
        "preview-source",
        "image-source",
        "selected-source",
      ];
      const displayTitles = [
        "Image",
        locale === "zh-CN" ? "预览" : "Preview",
        "Preview",
        locale === "zh-CN" ? "图片" : "Image",
        locale === "zh-CN" ? "附件" : "Attachment",
      ];
      expect(args).toEqual(
        modern
          ? [uris, names, displayTitles, 4, sources, identifier]
          : [uris, names, 4, sources, identifier],
      );
      expect(modern ? harness.native.presentFiles : harness.modernPresent).not.toHaveBeenCalled();
      expect(harness.native.presentFile).not.toHaveBeenCalled();
      await act(async () => {
        if (locale === "en") pending.resolve("file:///cache/slow.png");
        else pending.reject(new Error("Settings"));
      });
      expect(harness.native.updateFile).toHaveBeenCalledWith(
        identifier,
        1,
        locale === "en" ? "file:///cache/slow.png" : null,
      );
      expect(method).toHaveBeenCalledOnce();
      expect(selected.name).toBe("Attachment");
      expect(gallery).toEqual([raw, slow, rawPreview, imageFallback, selected]);
      await act(async () => presentation.resolve());
      expect(preview.onRequestClose).toHaveBeenCalledOnce();
      expect(preview.onOpenError).not.toHaveBeenCalled();
      await preview[Symbol.asyncDispose]();
      expect(harness.native.dismissFile).toHaveBeenCalledWith(identifier);
    }
  },
);

it("retains the single-document legacy call and ignores a rejected native presentation after dismissal", async () => {
  const presentation = setup(true);
  await using preview = await open({
    kind: "document",
    uri: "file:///Settings.pdf",
    name: "Settings.pdf",
    displayName: "unused display title",
    sourceIdentifier: "document-source",
  });
  expect(harness.native.presentFile).toHaveBeenCalledWith(
    "file:///Settings.pdf",
    "Settings.pdf",
    "document-source",
    expect.any(String),
  );
  expect(harness.native.presentFile.mock.calls[0]).toHaveLength(4);
  expect(harness.modernPresent).not.toHaveBeenCalled();
  expect(harness.native.presentFiles).not.toHaveBeenCalled();
  await preview[Symbol.asyncDispose]();
  await act(async () => presentation.reject(new Error("Settings")));
  expect(preview.onRequestClose).not.toHaveBeenCalled();
  expect(preview.onOpenError).not.toHaveBeenCalled();
  expect(harness.alert).not.toHaveBeenCalled();
  expect(harness.native.dismissFile).toHaveBeenCalledOnce();
});
