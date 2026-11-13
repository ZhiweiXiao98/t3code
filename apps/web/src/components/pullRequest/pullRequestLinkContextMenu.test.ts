import { expect, it, vi } from "vite-plus/test";
import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import { openOnHostLabel, showPullRequestLinkContextMenu } from "./pullRequestLinkContextMenu";
const state = vi.hoisted(() => ({
  show: vi.fn(),
  copy: vi.fn(),
  open: vi.fn(),
  toast: vi.fn(),
  locale: "zh-CN",
}));
vi.mock("~/i18n/readWebI18n", () => ({ readWebI18n: () => ({ locale: state.locale }) }));
vi.mock("~/localApi", () => ({
  readLocalApi: () => ({ contextMenu: { show: state.show }, shell: { openExternal: state.open } }),
}));
vi.mock("~/hooks/useCopyToClipboard", () => ({ writeTextToClipboard: state.copy }));
vi.mock("../ui/toast", () => ({ toastManager: { add: state.toast } }));

it("localizes owned context actions and failures without changing the link or supplied host label", async () => {
  const url = "https://example.test/owner/repo/pull/7?literal={$&}";
  const openLabel = openOnHostLabel(sourceControlClients.get("github"), "zh-CN");
  expect(openLabel).toBe("在 GitHub 打开");
  expect(openOnHostLabel(sourceControlClients.get("github"))).toBe("Open on GitHub");
  state.show.mockResolvedValue("copy-link");
  state.copy.mockRejectedValue(new Error("opaque error"));
  await showPullRequestLinkContextMenu({ url, openLabel, position: { x: 3, y: 4 } });
  expect(state.show).toHaveBeenCalledWith(
    [
      { id: "copy-link", label: "复制链接", icon: "copy" },
      { id: "open-external", label: openLabel },
    ],
    { x: 3, y: 4 },
  );
  expect(state.copy).toHaveBeenCalledWith(url, "link");
  expect(state.toast).toHaveBeenLastCalledWith({ type: "error", title: "无法复制链接" });
  state.show.mockResolvedValue("open-external");
  state.open.mockRejectedValue(new Error("another external error"));
  await showPullRequestLinkContextMenu({
    url,
    openLabel: "opaque {host}/$&",
    position: { x: 3, y: 4 },
  });
  expect(state.open).toHaveBeenCalledWith(url);
  expect(state.show.mock.calls.at(-1)?.[0]?.[1].label).toBe("opaque {host}/$&");
  expect(state.toast).toHaveBeenLastCalledWith({ type: "error", title: "无法打开链接" });
});
