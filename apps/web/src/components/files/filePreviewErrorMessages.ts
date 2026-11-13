import { createFilePreviewError, filePreviewErrorSource } from "@t3tools/shared/filePreview";
import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";

const OWNED_PREVIEW_ERRORS: Readonly<Record<string, string>> = {
  "This workbook has no visible sheets.": "此工作簿没有可见的工作表。",
  "Preview limited to 1,000 pages.": "预览最多支持 1,000 页。",
  "This browser cannot draw slides.": "此浏览器无法绘制幻灯片。",
  "Preview limited to presentations with 1 to 500 slides.":
    "仅支持预览包含 1 至 500 张幻灯片的演示文稿。",

  "The text viewer stopped.": "文本查看器已停止。",
  "Could not load the text viewer. Close the file and try again.":
    "无法加载文本查看器。请关闭文件后重试。",
  "Preview closed.": "预览已关闭。",
  "Another copy is in progress.": "另一个复制操作正在进行中。",
  "This file took too long to preview. Close it and try again.":
    "此文件预览耗时过长。请关闭后重试。",
  "Could not load the file viewer. Close it and try again.":
    "无法加载文件查看器。请关闭文件后重试。",
  "Could not render this Office document.": "无法渲染此 Office 文档。",
  "Could not load the Office viewer.": "无法加载 Office 查看器。",
  "Could not load the Office viewer. Close the file and try again.":
    "无法加载 Office 查看器。请关闭文件后重试。",
  "Could not read the Office viewer response.": "无法读取 Office 查看器的响应。",

  "The file could not be loaded. Close it and try again.": "无法加载此文件。请关闭后重试。",
  "Text previews support files up to 256 MB.": "文本预览支持最大 256 MB 的文件。",
  "This file contains binary data.": "此文件包含二进制数据。",
  "A line or record exceeds the 1 MB preview limit.": "某一行或记录超出了 1 MB 的预览限制。",
  "Text previews support up to 5 million rows.": "文本预览最多支持 500 万行。",
  "The file download was incomplete. Close it and try again.": "文件下载不完整。请关闭后重试。",
  "Wait for the file to finish loading before copying.": "请等待文件加载完成后再复制。",
  "Could not read this file.": "无法读取此文件。",
  "The file is unavailable.": "此文件不可用。",
  "The worker already holds a deck": "工作线程已载入演示文稿",
  "The worker holds no deck": "工作线程未载入演示文稿",
  "This browser has no fonts in workers": "此浏览器不支持在工作线程中使用字体",
  "The worker already holds a document": "工作线程已载入文档",
  "The worker holds no document": "工作线程未载入文档",
  "The document's fonts could not be prepared": "无法准备文档字体",
  "The document produced no pages": "文档未生成任何页面",
  "The worker already holds a workbook": "工作线程已载入工作簿",
  "The worker holds no workbook": "工作线程未载入工作簿",
  "The Office engine stopped": "Office 引擎已停止",
  "The Office engine sent an unreadable reply": "Office 引擎返回了无法读取的响应",
  "This document took too long to preview. Open it in another app.":
    "此文档预览耗时过长。请在其他应用中打开。",

  "This is not a readable ZIP archive.": "这不是可读取的 ZIP 归档。",
  "Unsupported ZIP64 directory.": "不支持此 ZIP64 目录。",
  "This ZIP64 directory is too large or damaged.": "此 ZIP64 目录过大或已损坏。",
  "This ZIP directory is damaged.": "此 ZIP 目录已损坏。",
  "An archive path is too long to preview.": "某个归档路径过长，无法预览。",
  "This file contains binary data and cannot be shown as text.":
    "此文件包含二进制数据，无法显示为文本。",
  "This file is not UTF-8 text. Open it in another app to view its contents.":
    "此文件不是 UTF-8 文本。请在其他应用中打开以查看内容。",

  "This document contains unsupported XML declarations.": "此文档包含不支持的 XML 声明。",
  "This Word document has excessive XML nesting.": "此 Word 文档的 XML 嵌套层级过多。",
  "This Word document has too much section markup.": "此 Word 文档的分节标记过多。",
  "Preview limited: this Word document has too much section markup.":
    "预览受限：此 Word 文档的分节标记过多。",
  "This Word document has no readable body.": "此 Word 文档没有可读取的正文。",
  "This workbook contains invalid cell coordinates.": "此工作簿包含无效的单元格坐标。",
  "This workbook contains invalid worksheet dimensions.": "此工作簿包含无效的工作表尺寸。",
  "This workbook contains excessive XML nesting.": "此工作簿的 XML 嵌套层级过多。",
  "This workbook contains invalid worksheet structure.": "此工作簿包含无效的工作表结构。",
  "This workbook contains invalid row coordinates.": "此工作簿包含无效的行坐标。",
  "This workbook exceeds the preview limit: 250,000 rows.": "此工作簿超出预览限制：250,000 行。",
  "This workbook contains inconsistent cell rows.": "此工作簿的单元格行信息不一致。",
  "This workbook exceeds the preview limit: 2 million cells or 8 million grid positions.":
    "此工作簿超出预览限制：200 万个单元格或 800 万个网格位置。",
  "This workbook contains invalid cell metadata.": "此工作簿包含无效的单元格元数据。",
  "This workbook has no worksheet data.": "此工作簿没有工作表数据。",
  "This workbook has invalid or too many sheets.": "此工作簿的工作表无效或数量过多。",
  "This workbook has a missing worksheet.": "此工作簿缺少工作表。",
  "Preview limited: this Word document has an aliased document part.":
    "预览受限：此 Word 文档的文档部件存在别名。",
  "Preview limited: this Word document has an unsupported document relationship.":
    "预览受限：此 Word 文档包含不支持的文档关系。",
  "Preview limited: this Word document has excessive XML nesting.":
    "预览受限：此 Word 文档的 XML 嵌套层级过多。",
  "Preview limited to files under 50 MB.": "仅支持预览小于 50 MB 的文件。",
  "This file is damaged, encrypted, or not a valid Office document.":
    "此文件已损坏、已加密，或不是有效的 Office 文档。",
  "This file contains too many archive entries to preview.": "此文件的归档条目过多，无法预览。",
  "Preview limited: this Word document has unsupported archive paths.":
    "预览受限：此 Word 文档包含不支持的归档路径。",
  "The expanded document is too large to preview safely.": "解压后的文档过大，无法安全预览。",
  "Preview limited: this Word document has too much auxiliary markup.":
    "预览受限：此 Word 文档的辅助标记过多。",
  "Preview limited: this Word document has too much expanded markup.":
    "预览受限：此 Word 文档展开后的标记过多。",
  "This is not a valid Office Open XML file. Encrypted files are not supported.":
    "这不是有效的 Office Open XML 文件。不支持加密文件。",
  "This document contains invalid or unsupported XML.": "此文档包含无效或不支持的 XML。",
  "This document is nested too deeply to preview.": "此文档的嵌套层级过深，无法预览。",
  "This document has too much content to preview.": "此文档的内容过多，无法预览。",
  "The rendered document is too large to preview.": "渲染后的文档过大，无法预览。",
  "This spreadsheet contains invalid repeated cells.": "此电子表格包含无效的重复单元格。",
  "This OpenDocument file has no readable content.": "此 OpenDocument 文件没有可读取的内容。",
  "This workbook has no sheets or too many sheets to preview.":
    "此工作簿没有工作表，或工作表过多，无法预览。",
  "A spreadsheet cell is too large to preview.": "某个电子表格单元格过大，无法预览。",
  "This spreadsheet has too much text to preview.": "此电子表格的文本过多，无法预览。",
  "This document has no pages or too many pages to preview.":
    "此文档没有页面，或页面过多，无法预览。",
  "This EPUB has no readable package.": "此 EPUB 没有可读取的包。",
  "This EPUB has no chapters or too many chapters to preview.":
    "此 EPUB 没有章节，或章节过多，无法预览。",
  "This EPUB has no readable XHTML chapters.": "此 EPUB 没有可读取的 XHTML 章节。",
  "A notebook cell is too large to preview.": "某个笔记本单元格过大，无法预览。",
  "Notebook preview limited to files under 8 MB.": "仅支持预览小于 8 MB 的笔记本文件。",
  "Preview supports version 4 notebooks with up to 500 cells.":
    "预览支持最多包含 500 个单元格的第 4 版笔记本。",
  "A notebook cell has too many outputs to preview.": "某个笔记本单元格的输出过多，无法预览。",
  "Rich text preview limited to files under 8 MB.": "仅支持预览小于 8 MB 的富文本文件。",
  "This is not a valid rich text document.": "这不是有效的富文本文档。",
  "Rich text preview limited to 500 pages.": "富文本预览最多支持 500 页。",
  "This rich text document has too much content to preview.": "此富文本文档的内容过多，无法预览。",
  "This rich text document is nested too deeply.": "此富文本文档的嵌套层级过深。",
  "This rich text document is damaged.": "此富文本文档已损坏。",
  "Invalid rich text byte escape.": "富文本字节转义无效。",
  "Invalid rich text binary data.": "富文本二进制数据无效。",
  "This rich text code page is not supported.": "不支持此富文本代码页。",
  "The expanded archive exceeds the preview size or compression ratio limit.":
    "解压后的归档超出预览大小或压缩比限制。",
  "This TAR uses an unsupported numeric format.": "此 TAR 使用了不支持的数字格式。",
  "This archive contains more than 2,048 entries.": "此归档包含超过 2,048 个条目。",
  "The TAR header is damaged.": "TAR 标头已损坏。",
  "An archive entry is too large or damaged.": "某个归档条目过大或已损坏。",
  "Archive metadata is too large.": "归档元数据过大。",
  "The TAR metadata is damaged.": "TAR 元数据已损坏。",
  "This archive has no readable entries.": "此归档没有可读取的条目。",
  "This archive entry is unavailable.": "此归档条目不可用。",
  "Entry previews are limited to 10 MB.": "条目预览大小限制为 10 MB。",
  "This table is unavailable.": "此表不可用。",
  "Database previews are limited to 100 tables.": "数据库预览最多支持 100 张表。",
  "This sheet is unavailable.": "此工作表不可用。",
  "Could not parse this file.": "无法解析此文件。",
  "Could not preview this file.": "无法预览此文件。",
  "The file could not be loaded. Reconnect and try again.": "无法加载此文件。请重新连接后重试。",
  "Streaming file previews are unavailable in this runtime.": "当前运行环境不支持流式文件预览。",
};

export function localizeFilePreviewError(locale: ResolvedAppLocale, source: string): string {
  return locale === "zh-CN" && Object.hasOwn(OWNED_PREVIEW_ERRORS, source)
    ? OWNED_PREVIEW_ERRORS[source]!
    : source;
}

/** Called only on replies from the app-owned preview worker, never on arbitrary errors. */
export function filePreviewWorkerError(reply: {
  readonly message: string;
  readonly source?: unknown;
}): Error {
  return Object.hasOwn(reply, "source") &&
    typeof reply.source === "string" &&
    reply.source === reply.message &&
    Object.hasOwn(OWNED_PREVIEW_ERRORS, reply.source)
    ? createFilePreviewError(reply.source, reply.message)
    : new Error(reply.message);
}

export function filePreviewFailureMessage(locale: ResolvedAppLocale, error: Error): string {
  const source = filePreviewErrorSource(error);
  return source === undefined ? error.message : localizeFilePreviewError(locale, source);
}
