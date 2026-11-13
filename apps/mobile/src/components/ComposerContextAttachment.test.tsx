import { ComposerContextId, EnvironmentId, type FileContextRecord } from "@t3tools/contracts";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import type { MobileLocale } from "../i18n/mobileStrings";
import type { DraftComposerFileAttachment } from "../lib/composerImages";

const state = vi.hoisted(() => ({
  locale: "en" as MobileLocale,
  alert: vi.fn<typeof import("react-native").Alert.alert>(),
  refresh: vi.fn<() => Promise<string | null>>(),
  download: vi.fn<typeof import("../lib/attachmentDownload").downloadAndShareAttachment>(),
  local: vi.fn<typeof import("../lib/localAttachmentPreview").loadLocalAttachmentPreview>(),
  share: vi.fn<(signal: AbortSignal, sourceIdentifier?: string) => Promise<void>>(),
  dispose: vi.fn(),
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Pressable: ({
    children,
    disabled,
    onPress,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    disabled?: boolean;
    onPress?: () => void;
    accessibilityLabel?: string;
  }) => (
    <button disabled={disabled} onClick={onPress} aria-label={accessibilityLabel}>
      {children}
    </button>
  ),
  Alert: { alert: state.alert, prompt: vi.fn() },
}));
vi.mock("expo-image", () => ({ Image: () => null }));
vi.mock("./ui/AppSymbol", () => ({ SymbolView: () => null }));
vi.mock("./ui/AppActivityIndicator", () => ({ AppActivityIndicator: () => null }));
vi.mock("./ui/NativePresentation", () => ({
  PresentationSource: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("./ui/FilePreviewModal", () => ({ FilePreviewModal: () => null }));
vi.mock("../lib/uuid", () => ({ uuidv4: () => "unused" }));
vi.mock("../state/assets", () => ({
  useAssetUrlState: () => ({ _tag: "Success", url: "https://host.example/Settings?token=$&" }),
  useRefreshAssetUrl: () => state.refresh,
}));
vi.mock("../lib/attachmentDownload", () => ({ downloadAndShareAttachment: state.download }));
vi.mock("../lib/localAttachmentPreview", () => ({
  loadLocalAttachmentPreview: state.local,
  useLocalAttachmentPreview: () => ({ uri: "file:///Settings.pdf", error: null }),
}));
vi.mock("../i18n/mobileStrings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../i18n/mobileStrings")>();
  return {
    ...actual,
    localizeMobileString: (value: string) => actual.localizeMobileString(value, state.locale),
    localizeAlertArguments: (...args: Parameters<typeof actual.localizeAlertArguments>) =>
      actual.localizeAlertArguments(args[0], args[1], args[2], state.locale),
  };
});

import { ComposerContextAttachment } from "./ComposerContextAttachment";

const environmentId = EnvironmentId.make("Settings");
const record: FileContextRecord = {
  version: 1,
  contextId: ComposerContextId.make("ctx-Settings"),
  kind: "file",
  label: "Settings",
  attachmentId: "attachment-Settings",
  name: "Settings\n{0} $&.pdf",
  mimeType: "application/pdf",
  sizeBytes: 5,
};
const attachment: DraftComposerFileAttachment = {
  type: "file",
  id: "local-Settings",
  name: record.name,
  mimeType: record.mimeType,
  sizeBytes: record.sizeBytes,
  fileUri: "file:///Settings%20%7B0%7D%20$&.pdf",
};
function setup(locale: MobileLocale) {
  state.locale = locale;
  for (const mock of [
    state.alert,
    state.refresh,
    state.download,
    state.local,
    state.share,
    state.dispose,
  ])
    mock.mockReset();
  state.refresh.mockResolvedValue("https://host.example/Settings?token=$&");
  state.download.mockResolvedValue(undefined);
  state.share.mockResolvedValue(undefined);
  state.local.mockResolvedValue({
    uri: attachment.fileUri,
    share: state.share,
    dispose: state.dispose,
  });
}
async function render(local: boolean) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement("div");
  const root = createRoot(element);
  await using stack = new AsyncDisposableStack();
  stack.defer(() => act(async () => root.unmount()));
  await act(async () =>
    root.render(
      <ComposerContextAttachment
        record={record}
        environmentId={environmentId}
        {...(local ? { attachment } : {})}
      />,
    ),
  );
  const resources = stack.move();
  return {
    button: () => element.querySelector("button")!,
    click: () => act(async () => element.querySelector("button")!.click()),
    [Symbol.asyncDispose]: () => resources.disposeAsync(),
  };
}

it.each(["en", "zh-CN"] as const)(
  "keeps attachment share failures literal in %s, preserves local leases and permits retry",
  async (locale) => {
    for (const local of [false, true]) {
      for (const error of [
        new Error("Settings"),
        new Error("Try again."),
        new Error("Open\n{0} $&"),
        "failure",
      ]) {
        setup(locale);
        (local ? state.share : state.download).mockRejectedValueOnce(error);
        await using screen = await render(local);
        await screen.click();
        expect(state.alert.mock.lastCall?.slice(0, 2)).toEqual([
          locale === "en" ? "Could not open attachment" : "无法打开附件",
          error instanceof Error ? error.message : locale === "en" ? "Try again." : "请重试。",
        ]);
        expect(screen.button().disabled).toBe(false);
        expect(screen.button().textContent).toBe(
          locale === "en" ? "Open or share attachment" : "打开或分享附件",
        );
        if (local) {
          expect(state.dispose).toHaveBeenCalledOnce();
          expect(state.refresh).not.toHaveBeenCalled();
          expect(state.download).not.toHaveBeenCalled();
          expect(state.local).toHaveBeenCalledWith(attachment, expect.any(AbortSignal));
          expect(state.share).toHaveBeenCalledWith(expect.any(AbortSignal), expect.any(String));
        } else
          expect(state.download).toHaveBeenCalledWith({
            url: "https://host.example/Settings?token=$&",
            attachment: record,
            signal: expect.any(AbortSignal),
            sourceIdentifier: expect.any(String),
          });
        await screen.click();
        expect(state.alert).toHaveBeenCalledOnce();
        expect(local ? state.share : state.download).toHaveBeenCalledTimes(2);
        if (local) expect(state.dispose).toHaveBeenCalledTimes(2);
      }
    }
  },
);

it.each(["en", "zh-CN"] as const)(
  "localizes reconnect failure in %s and prevents duplicate work while opening",
  async (locale) => {
    setup(locale);
    state.refresh.mockResolvedValueOnce(null);
    await using screen = await render(false);
    await screen.click();
    expect(state.alert.mock.lastCall?.[1]).toBe(
      locale === "en" ? "Reconnect to the environment and try again." : "请重新连接环境后重试。",
    );
    expect(state.download).not.toHaveBeenCalled();
    const completion = Promise.withResolvers<void>();
    state.download.mockReturnValueOnce(completion.promise);
    await screen.click();
    expect(screen.button().disabled).toBe(true);
    expect(screen.button().textContent).toBe(
      locale === "en" ? "Opening attachment…" : "正在打开附件…",
    );
    await screen.click();
    expect(state.download).toHaveBeenCalledOnce();
    await act(async () => completion.resolve());
    expect(screen.button().disabled).toBe(false);
    expect(state.alert).toHaveBeenCalledOnce();
  },
);
