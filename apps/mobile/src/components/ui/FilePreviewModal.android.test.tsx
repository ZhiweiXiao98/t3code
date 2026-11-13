import { act, createElement, useState, type ComponentType, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { EnvironmentId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";

import type { MediaActionsSource } from "../../lib/mediaActionsSource";
import { attachmentVideoPreviewSource } from "../../lib/videoPreviewSource";
import * as strings from "../../i18n/mobileStrings";

const harness = vi.hoisted(() => ({
  run: vi.fn(),
  share: vi.fn(),
  sources: [] as unknown[],
  imagePages: [] as { uri?: string }[],
  selectedIndex: 0,
  menuTitles: [] as (string | undefined)[],
}));

vi.mock("react-native", () => ({
  Platform: { OS: "android" },
  View: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  Modal: ({ children }: { children?: ReactNode }) => createElement("section", null, children),
  ScrollView: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  Text: ({ children }: { children?: ReactNode }) => createElement("span", null, children),
  TextInput: "input",
  Pressable: (props: {
    children?: ReactNode;
    accessibilityLabel?: string;
    disabled?: boolean;
    onPress?: () => void;
  }) =>
    createElement(
      "button",
      {
        "aria-label": props.accessibilityLabel,
        disabled: props.disabled,
        onClick: props.onPress,
      },
      props.children,
    ),
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("react-native-image-viewing", () => ({
  default: (props: {
    images: { uri?: string }[];
    imageIndex: number;
    HeaderComponent?: ComponentType<{ imageIndex: number }>;
  }) => {
    const [index, setIndex] = useState(props.imageIndex);
    harness.imagePages = props.images;
    harness.selectedIndex = index;
    return createElement(
      "div",
      null,
      props.HeaderComponent ? createElement(props.HeaderComponent, { imageIndex: index }) : null,
      createElement(
        "button",
        { "aria-label": "Next image", onClick: () => setIndex((index + 1) % props.images.length) },
        "Next",
      ),
    );
  },
}));
vi.mock("@react-native-menu/menu", () => ({
  MenuView: (props: {
    title?: string;
    children?: ReactNode;
    actions: { id?: string; title: string; attributes?: { disabled?: boolean } }[];
    onPressAction: (event: { nativeEvent: { event: string } }) => void;
  }) => {
    harness.menuTitles.push(props.title);
    return createElement(
      "div",
      null,
      props.children,
      props.actions.map((action) =>
        createElement(
          "button",
          {
            key: action.id,
            "aria-label": `native-menu:${action.id}`,
            disabled: action.attributes?.disabled,
            onClick: () => props.onPressAction({ nativeEvent: { event: action.id ?? "" } }),
          },
          action.title,
        ),
      ),
    );
  },
}));
// Shared code is compiled for either target; keep both native menu routes interactive.
vi.mock("./Menu", async () => ({ Menu: (await import("@react-native-menu/menu")).MenuView }));
vi.mock("./AppSymbol", () => ({ SymbolView: () => null }));
vi.mock("./AppActivityIndicator", () => ({ AppActivityIndicator: () => null }));
vi.mock("./Button", () => ({ Button: () => null }));
vi.mock("./SheetHeader", () => ({ SheetHeader: () => null }));
vi.mock("../PdfPreview", () => ({ PdfPreview: () => null }));
vi.mock("../MediaVideoPlayer", () => ({ MediaVideoPlayer: () => null }));
vi.mock("./Dialog", () => ({ alert: vi.fn() }));
vi.mock("../../lib/attachmentDownload", () => ({
  openAttachmentInViewer: vi.fn(),
  downloadAndShareAttachment: vi.fn(),
  nativeViewerErrorMessage: () => "",
  shareLocalAttachment: vi.fn(),
}));
vi.mock("../../lib/localAttachmentPreview", () => ({
  loadLocalAttachmentPreview: vi.fn(),
  useLocalAttachmentPreview: () => ({ uri: "file:///original/Settings", error: null }),
}));
vi.mock("../../lib/previewPresentation", () => ({
  usePreviewPresentation: () => {},
  videoPreviewKey: () => "video-preview",
}));
vi.mock("../../state/assets", () => ({
  refreshAssetUrl: vi.fn(),
  useAssetUrlState: () => ({ _tag: "Success", url: "https://signed.test/original.mp4" }),
  useRefreshAssetUrl: () => vi.fn(),
}));
vi.mock("../../state/session", () => ({ usePreparedConnection: () => ({ _tag: "Some" }) }));
vi.mock("../../state/mediaActions", () => ({
  useMediaActions: (source: MediaActionsSource | undefined) => {
    harness.sources.push(source);
    const reference = source?.reference;
    return {
      title: reference?.kind === "file" ? reference.path : reference?.url,
      actions: source ? [{ id: "save", title: "Save or share", run: harness.run }] : [],
      sharing: false,
      share: harness.share,
    };
  },
}));

import { FilePreviewModal } from "./FilePreviewModal.android";
import { VideoPreviewModal } from "./VideoPreviewModal.android";
import type { FilePreviewItem } from "./FilePreviewModal.types";

function resetHarness() {
  harness.sources.length = 0;
  harness.imagePages = [];
  harness.selectedIndex = 0;
  harness.menuTitles.length = 0;
  harness.run.mockClear();
  harness.share.mockClear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
}

it.each(["en", "zh-CN"] as const)(
  "preserves Android image names and source paths through the actual session and header (%s)",
  async (locale) => {
    resetHarness();
    using _globals = { [Symbol.dispose]: () => vi.unstubAllGlobals() };
    const original = strings.localizeMobileString;
    using _locale = vi
      .spyOn(strings, "localizeMobileString")
      .mockImplementation((value) => original(value, locale));
    const gallery: FilePreviewItem[] = ["Settings", "Image", "Attachment", "Draft {0} $&"].map(
      (name) => ({
        kind: "image",
        name,
        uri: `https://image.test/${encodeURIComponent(name)}`,
        actionsSource: {
          name,
          mimeType: "image/png",
          uri: `https://image.test/${encodeURIComponent(name)}`,
          reference: { kind: "file", path: "Comments" },
        },
      }),
    );
    const source = { ...gallery[0]!, gallery };
    const before = structuredClone(source);
    const onClose = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(<FilePreviewModal source={source} onRequestClose={onClose} />),
      );
      for (const [index, item] of gallery.entries()) {
        const text = Array.from(container.querySelectorAll("span"), (node) => node.textContent);
        expect(text).toContain(item.name);
        expect(text).toContain("Comments");
        expect(text).not.toContain("设置");
        expect(text).not.toContain("评论");
        expect(harness.selectedIndex).toBe(index);
        expect(harness.sources.at(-1)).toBe(item.actionsSource);
        expect(harness.menuTitles.at(-1)).toBe("Comments");
        act(() =>
          container.querySelector<HTMLButtonElement>('[aria-label="native-menu:save"]')!.click(),
        );
        if (index < gallery.length - 1)
          act(() =>
            container.querySelector<HTMLButtonElement>('[aria-label="Next image"]')!.click(),
          );
      }
      expect(harness.imagePages).toEqual(
        gallery.map((item) => ({ uri: "uri" in item ? item.uri : undefined })),
      );
      expect(harness.run).toHaveBeenCalledTimes(gallery.length);
      const close = locale === "zh-CN" ? "关闭图片" : "Close image";
      act(() => container.querySelector<HTMLButtonElement>(`[aria-label="${close}"]`)!.click());
      expect(onClose).toHaveBeenCalledOnce();
      expect(source).toEqual(before);
    } finally {
      await act(async () => root.unmount());
    }
  },
);

it("keeps Android PR-style images without media actions on the existing headerless viewer", async () => {
  resetHarness();
  using _globals = { [Symbol.dispose]: () => vi.unstubAllGlobals() };
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <FilePreviewModal
          source={{ kind: "image", uri: "https://image.test/original", name: "Attachment" }}
          onRequestClose={vi.fn()}
        />,
      ),
    );
    expect(container.querySelector("span")).toBeNull();
    expect(harness.sources).toEqual([]);
    expect(harness.imagePages).toEqual([{ uri: "https://image.test/original" }]);
  } finally {
    await act(async () => root.unmount());
  }
});

it.each(["en", "zh-CN"] as const)(
  "keeps remote and local video filenames literal without changing native menu or share actions (%s)",
  async (locale) => {
    resetHarness();
    using _globals = { [Symbol.dispose]: () => vi.unstubAllGlobals() };
    const original = strings.localizeMobileString;
    using _locale = vi
      .spyOn(strings, "localizeMobileString")
      .mockImplementation((value) => original(value, locale));
    const remote = attachmentVideoPreviewSource(EnvironmentId.make("env"), {
      type: "file",
      id: "video",
      name: "Settings",
      mimeType: "video/mp4",
      sizeBytes: 20,
    });
    const local = {
      type: "local" as const,
      attachment: {
        id: "local-video",
        type: "file" as const,
        name: "Image",
        mimeType: "video/mp4",
        sizeBytes: 20,
        fileUri: "file:///original/Settings",
      },
    };
    for (const source of [remote, local]) {
      const snapshot = structuredClone(source);
      const name = source.type === "media" ? source.name : source.attachment.name;
      const container = document.createElement("div");
      const root = createRoot(container);
      const onClose = vi.fn();
      try {
        act(() => root.render(<VideoPreviewModal source={source} onRequestClose={onClose} />));
        expect(
          Array.from(container.querySelectorAll("span"), (node) => node.textContent),
        ).toContain(name);
        act(() =>
          container.querySelector<HTMLButtonElement>('[aria-label="native-menu:save"]')!.click(),
        );
        const close = original("Close video", locale);
        const share = original("Save or share video", locale);
        act(() => container.querySelector<HTMLButtonElement>(`[aria-label="${share}"]`)!.click());
        act(() => container.querySelector<HTMLButtonElement>(`[aria-label="${close}"]`)!.click());
        expect(onClose).toHaveBeenCalledOnce();
        expect(source).toEqual(snapshot);
      } finally {
        act(() => root.unmount());
      }
    }
    expect(harness.run).toHaveBeenCalledTimes(2);
    expect(harness.share).toHaveBeenCalledTimes(2);
  },
);
