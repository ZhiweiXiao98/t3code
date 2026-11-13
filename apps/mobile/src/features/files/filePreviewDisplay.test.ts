import { AuthFilesystemReadScope } from "@t3tools/contracts";
import { expect, it } from "vite-plus/test";
import {
  attachmentSubtitle,
  filePreviewFailure,
  localizedFilesystemReadAccess,
  pdfHttpFailure,
} from "./filePreviewDisplay";

it("localizes absent native failure descriptions without interpreting real messages", () => {
  for (const locale of ["en", "zh-CN"] as const) {
    for (const kind of ["image", "file", "pdf"] as const) {
      for (const detail of [
        "Settings",
        "Open",
        "The file could not be rendered.",
        "{0} $&\nHTTP 503",
      ])
        expect(filePreviewFailure(detail, kind, locale)).toBe(detail);
      const expected = {
        image: locale === "en" ? "The image could not be rendered." : "无法渲染图片。",
        file: locale === "en" ? "The file could not be rendered." : "无法渲染文件。",
        pdf: locale === "en" ? "The PDF could not be loaded." : "无法加载 PDF。",
      }[kind];
      for (const detail of ["", undefined, null])
        expect(filePreviewFailure(detail, kind, locale)).toBe(expected);
    }
    expect(pdfHttpFailure(503, locale)).toBe(
      locale === "en" ? "The server returned HTTP 503." : "服务器返回 HTTP 503。",
    );
    expect(attachmentSubtitle(true, 1025, locale)).toBe(
      locale === "en" ? "Draft attachment · 2 KB" : "草稿附件 · 2 KB",
    );
    expect(attachmentSubtitle(false, 1048576, locale)).toBe(
      locale === "en" ? "Attachment · 1.0 MB" : "附件 · 1.0 MB",
    );
    expect(attachmentSubtitle(true, 0, locale)).toBe(
      locale === "en" ? "Draft attachment" : "草稿附件",
    );
  }
});

it("distinguishes remote permission failures from the locally inferred disconnected state", () => {
  const base = { isCatalogReady: true, connection: null, session: null, sessionError: null };
  for (const locale of ["en", "zh-CN"] as const) {
    for (const detail of ["Settings", "Open", "This environment is not connected.", "{0} $&"]) {
      expect(localizedFilesystemReadAccess({ ...base, sessionError: detail }, locale)).toEqual({
        canReadFiles: false,
        isPending: false,
        error: detail,
      });
      expect(
        localizedFilesystemReadAccess(
          { ...base, connection: { phase: "offline", error: detail } },
          locale,
        ),
      ).toEqual({ canReadFiles: false, isPending: false, error: detail });
    }
    expect(localizedFilesystemReadAccess(base, locale)).toEqual({
      canReadFiles: false,
      isPending: false,
      error: locale === "en" ? "This environment is not connected." : "此环境未连接。",
    });
    expect(localizedFilesystemReadAccess({ ...base, isCatalogReady: false }, locale)).toEqual({
      canReadFiles: false,
      isPending: true,
      error: null,
    });
    expect(
      localizedFilesystemReadAccess(
        { ...base, session: { authenticated: true, scopes: [AuthFilesystemReadScope] } },
        locale,
      ),
    ).toEqual({ canReadFiles: true, isPending: false, error: null });
    expect(
      localizedFilesystemReadAccess(
        { ...base, session: { authenticated: true, scopes: [] } },
        locale,
      ),
    ).toEqual({ canReadFiles: false, isPending: false, error: null });
  }
});
