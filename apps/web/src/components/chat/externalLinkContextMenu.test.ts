import { translateWebSource } from "~/i18n/messages";
import { describe, expect, it, vi } from "vite-plus/test";

import { resolveExternalWebLinkHref, showExternalLinkContextMenu } from "./externalLinkContextMenu";

describe("external chat link context menu", () => {
  it.each([
    [
      "https://example.com/docs?topic=security#links",
      "https://example.com/docs?topic=security#links",
    ],
    ["HTTP://EXAMPLE.COM", "http://example.com/"],
    ["//example.com/path", "https://example.com/path"],
  ])("resolves the safe external web-link href for %s as %s", (href, expected) => {
    expect(resolveExternalWebLinkHref(href)).toBe(expected);
  });

  it.each([
    "javascript:alert(document.domain)",
    " \nJaVaScRiPt:alert(document.domain)",
    "data:text/html,<script>alert(document.domain)</script>",
    "file:///tmp/example.txt",
    "mailto:hello@example.com",
    "/relative/path",
    "not a URL",
    "",
  ])("rejects unsafe external web-link href %s", (href) => {
    expect(resolveExternalWebLinkHref(href)).toBeNull();
  });
});

it.each([
  "open-in-preview",
  "open-external",
  "copy-link",
  "link-to-thread",
  "unlink-from-thread",
] as const)(
  "keeps %s actions and opaque URL intact with localized native menu labels",
  async (action) => {
    const tx = (source: string) => translateWebSource("zh-CN", source);
    const href = "https://example.com/opaque/{name}?literal=$&";
    const openInPreview = vi.fn(async () => {});
    const openExternal = vi.fn(async () => {});
    const copyLink = vi.fn(async () => {});
    const updateThreadLink = vi.fn(async () => {});
    const reportFailure = vi.fn();
    const showContextMenu = vi.fn(async () => action);
    await showExternalLinkContextMenu({
      href,
      position: { x: 7, y: 9 },
      threadLinkAction: action === "unlink-from-thread" ? "unlink-from-thread" : "link-to-thread",
      labels: {
        openInPreview: tx("Open in integrated browser"),
        openExternal: tx("Open in system browser"),
        copyLink: tx("Copy Link"),
        linkToThread: tx("Link to thread"),
        unlinkFromThread: tx("Unlink from thread"),
      },
      showContextMenu,
      openInPreview,
      openExternal,
      copyLink,
      updateThreadLink,
      reportFailure,
    });
    expect(showContextMenu).toHaveBeenCalledWith(
      expect.arrayContaining([{ id: "copy-link", label: "复制链接" }]),
      { x: 7, y: 9 },
    );
    expect(openInPreview.mock.calls.length).toBe(action === "open-in-preview" ? 1 : 0);
    expect(openExternal.mock.calls.length).toBe(action === "open-external" ? 1 : 0);
    expect(copyLink.mock.calls.length).toBe(action === "copy-link" ? 1 : 0);
    if (action === "link-to-thread" || action === "unlink-from-thread")
      expect(updateThreadLink).toHaveBeenCalledExactlyOnceWith(href, action === "link-to-thread");
    else
      expect(
        { "open-in-preview": openInPreview, "open-external": openExternal, "copy-link": copyLink }[
          action
        ],
      ).toHaveBeenCalledExactlyOnceWith(href);
    expect(reportFailure).not.toHaveBeenCalled();
  },
);
