import { act, createRef, useImperativeHandle } from "react";
import { createRoot } from "react-dom/client";
import type { AlertButton } from "react-native";
import {
  DEFAULT_SERVER_SETTINGS,
  EnvironmentId,
  PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
  type ServerConfig,
} from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  alert: vi.fn(),
  media: vi.fn(),
  files: vi.fn(),
  images: vi.fn(),
  text: vi.fn(),
  remove: vi.fn(),
  append: vi.fn(),
  capture: vi.fn(),
  count: vi.fn(),
  snapshot: vi.fn(),
}));
vi.mock("react-native", () => ({ Alert: { alert: state.alert } }));
vi.mock("../lib/composerImages", () => ({
  pickComposerMedia: state.media,
  pickComposerFiles: state.files,
  convertPastedImagesToAttachments: state.images,
  createPastedTextComposerAttachment: state.text,
  removePersistedComposerAttachmentFile: state.remove,
}));
vi.mock("./use-composer-drafts", () => ({
  appendComposerDraftAttachments: state.append,
  captureComposerDraftInsertion: state.capture,
  countComposerDraftAttachmentsAfterSelection: state.count,
  getComposerDraftSnapshot: state.snapshot,
}));
vi.mock("../i18n/mobileStrings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../i18n/mobileStrings")>();
  return {
    ...actual,
    MOBILE_LOCALE: "zh-CN",
    localizeMobileString: (value: string, locale: "en" | "zh-CN" = "zh-CN") =>
      actual.localizeMobileString(value, locale),
    localizeAlertArguments: (title: string, message?: string, buttons?: AlertButton[]) =>
      actual.localizeAlertArguments(title, message, buttons, "zh-CN"),
  };
});
import { useComposerAttachmentActions } from "./use-composer-attachment-actions";
import { abortComposerDraftOperations } from "./composerDraftOperations";

const file = {
  id: "file",
  type: "file" as const,
  name: "Settings {0} $&.txt",
  mimeType: "text/plain",
  sizeBytes: 7,
  fileUri: "file:///documents/Settings/{0}/$&.txt",
};
const insertion = { text: "Open {0} $&", start: 1, end: 3 };
const paste = {
  value: "Settings {0} $&",
  text: "Open\n{1} $&",
  eventCount: 1,
  selection: { start: 2, end: 4 },
};
const config: ServerConfig = {
  environment: {
    environmentId: EnvironmentId.make("environment"),
    label: "Attachments",
    platform: { os: "darwin", arch: "arm64" },
    serverVersion: "0.0.0-test",
    capabilities: { repositoryIdentity: true, fileAttachments: { maxUploadBytes: 1048576 } },
  },
  auth: {
    policy: "loopback-browser",
    bootstrapMethods: ["one-time-token"],
    sessionMethods: ["browser-session-cookie", "bearer-access-token"],
    sessionCookieName: "t3_session",
  },
  cwd: "/tmp/workspace",
  keybindingsConfigPath: "/tmp/workspace/keybindings.json",
  keybindings: [],
  issues: [],
  providers: [],
  availableEditors: [],
  observability: {
    logsDirectoryPath: "/tmp/logs",
    localTracingEnabled: false,
    otlpTracesEnabled: false,
    otlpMetricsEnabled: false,
    otlpLogsEnabled: false,
  },
  settings: DEFAULT_SERVER_SETTINGS,
};

function setup() {
  state.alert.mockReset();
  state.media.mockReset().mockResolvedValue({ attachments: [file], error: null });
  state.files.mockReset().mockResolvedValue({ files: [file], error: null });
  state.images.mockReset().mockResolvedValue([file]);
  state.text.mockReset().mockResolvedValue(file);
  state.remove.mockReset().mockResolvedValue(undefined);
  state.append.mockReset().mockResolvedValue(0);
  state.capture.mockReset().mockReturnValue(insertion);
  state.count.mockReset().mockReturnValue(2);
  state.snapshot.mockReset().mockReturnValue({ attachments: [] });
}
function mountActions(
  props: Parameters<typeof useComposerAttachmentActions>[0] = {
    draftKey: "draft",
    serverConfig: config,
  },
) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.createElement("div"));
  const actionsRef = createRef<ReturnType<typeof useComposerAttachmentActions>>();
  function Observer() {
    const actions = useComposerAttachmentActions(props);
    useImperativeHandle(actionsRef, () => actions, [actions]);
    return null;
  }
  act(() => root.render(<Observer />));
  return {
    get actions() {
      return actionsRef.current!;
    },
    [Symbol.dispose]() {
      act(() => root.unmount());
    },
  };
}

it("preserves picker errors and attachment results while translating only the combined count limit", async () => {
  for (const source of ["media", "files"] as const) {
    for (const error of [
      "Settings",
      "Open",
      "You can attach up to 100 attachments per message.",
      "{0} $&",
    ]) {
      setup();
      using screen = mountActions();
      state[source].mockResolvedValue(
        source === "media" ? { attachments: [file], error } : { files: [file], error },
      );
      state.append.mockResolvedValue(1);
      await (source === "media"
        ? screen.actions.onPickDraftMedia()
        : screen.actions.onPickDraftFiles());
      expect(state.alert.mock.lastCall?.[1]).toBe(
        `${error}\n\n每条消息最多可添加 ${PROVIDER_SEND_TURN_MAX_ATTACHMENTS} 个附件。`,
      );
      expect(state.append).toHaveBeenCalledExactlyOnceWith("draft", [file], {
        appendReference: true,
        insertion,
      });
      expect(state[source]).toHaveBeenCalledExactlyOnceWith(
        source === "media"
          ? { existingCount: 2, maxVideoBytes: 1048576 }
          : { existingCount: 2, maxBytes: 1048576 },
      );
      state.alert.mockClear();
      state.append.mockResolvedValue(0);
      await (source === "media"
        ? screen.actions.onPickDraftMedia()
        : screen.actions.onPickDraftFiles());
      expect(state.alert.mock.lastCall?.[1]).toBe(error);
    }
    setup();
    using screen = mountActions();
    state[source].mockResolvedValue(
      source === "media" ? { attachments: [], error: null } : { files: [], error: null },
    );
    await (source === "media"
      ? screen.actions.onPickDraftMedia()
      : screen.actions.onPickDraftFiles());
    expect(state.alert).not.toHaveBeenCalled();
  }
});

it("keeps pasted image and text errors literal but translates absent-error fallbacks", async () => {
  for (const source of ["images", "text"] as const) {
    for (const error of [new Error("Settings"), new Error("Try again."), new Error(""), null]) {
      setup();
      using screen = mountActions();
      state[source].mockRejectedValue(error);
      await (source === "images"
        ? screen.actions.onNativePasteImages(["content://opaque/Open"])
        : screen.actions.onNativePasteText(paste));
      expect(state.alert.mock.lastCall?.[1]).toBe(
        error instanceof Error ? error.message : "请重试。",
      );
      expect(state.append).not.toHaveBeenCalled();
      expect(state.remove).not.toHaveBeenCalled();
    }
  }
});

it("retains pasted text selection and removes a rejected persisted attachment", async () => {
  setup();
  using screen = mountActions();
  state.append.mockResolvedValue(1);
  await screen.actions.onNativePasteText(paste);
  expect(state.text).toHaveBeenCalledWith(
    expect.objectContaining({ text: paste.text, maxBytes: 1048576 }),
  );
  expect(state.append).toHaveBeenCalledExactlyOnceWith("draft", [file], {
    appendReference: true,
    insertion: { text: paste.value, ...paste.selection },
  });
  expect(state.remove).toHaveBeenCalledExactlyOnceWith(file.fileUri);
  expect(state.alert.mock.lastCall?.[1]).toBe(
    `每条消息最多可添加 ${PROVIDER_SEND_TURN_MAX_ATTACHMENTS} 个附件。`,
  );
  const firstName = state.text.mock.lastCall?.[0].name;
  await screen.actions.onNativePasteText(paste);
  expect(state.text.mock.lastCall?.[0].name).not.toBe(firstName);
});

it("cleans up a late picker result after its draft is discarded without appending or reporting a limit", async () => {
  setup();
  using screen = mountActions();
  const selected = Promise.withResolvers<{ files: (typeof file)[]; error: null }>();
  state.files.mockReturnValue(selected.promise);
  const pending = screen.actions.onPickDraftFiles();
  abortComposerDraftOperations("draft");
  selected.resolve({ files: [file], error: null });
  await pending;
  expect(state.remove).toHaveBeenCalledExactlyOnceWith(file.fileUri);
  expect(state.append).not.toHaveBeenCalled();
  expect(state.alert).not.toHaveBeenCalled();
});
