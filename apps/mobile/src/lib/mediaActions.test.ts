import {
  AuthFilesystemReadScope,
  EnvironmentId,
  ThreadId,
  type AuthSessionState,
} from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { settlePromise, squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import type { MobileLocale } from "../i18n/mobileStrings";

const state = vi.hoisted(() => ({
  locale: "en" as MobileLocale,
  cleanup: undefined as (() => void) | undefined,
  alert: vi.fn<typeof import("react-native").Alert.alert>(),
  previewDispose: vi.fn(),
  sessions: new Map<string, Pick<AuthSessionState, "authenticated" | "scopes">>(),
  refresh: vi.fn(),
  download: vi.fn(),
  downloadPreview: vi.fn(),
  saveImage: vi.fn(),
  saveImageWithErrorCodes: vi.fn(),
  modernPhotos: false,
  shareLocal: vi.fn(),
  shareDraft: vi.fn(),
  navigate: vi.fn(),
  copy: vi.fn(),
}));

vi.mock("react", () => ({
  useEffect: (effect: () => () => void) => {
    state.cleanup = effect();
  },
  useRef: <A>(current: A) => ({ current }),
  useState: <A>(initial: A) => [initial, () => {}],
}));
vi.mock("react-native", () => ({
  Alert: { alert: state.alert, prompt: vi.fn() },
  Platform: { OS: "ios", Version: 18 },
}));
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: state.navigate }),
}));
vi.mock("./markdownLinks", () => ({
  normalizeNativeMarkdownUrl: (uri: string) => uri,
}));
vi.mock("../state/assets", () => ({
  useRefreshAssetUrl: (environmentId: string, resource: unknown) => () =>
    state.refresh(environmentId, resource),
}));
vi.mock("../state/session", () => ({
  environmentSession: { sessionStateAtom: (environmentId: string) => environmentId },
}));
vi.mock("../state/query", () => ({
  useEnvironmentQuery: (environmentId: string) => ({
    data: state.sessions.get(environmentId) ?? null,
    error: null,
  }),
}));
vi.mock("../state/atom-registry", () => ({
  appAtomRegistry: {
    get: (environmentId: string) => {
      const session = state.sessions.get(environmentId);
      return session === undefined ? AsyncResult.initial() : AsyncResult.success(session);
    },
  },
}));
vi.mock("./attachmentDownload", () => ({
  downloadAndShareAttachment: state.download,
  downloadAttachmentForPreview: state.downloadPreview,
  shareLocalAttachment: state.shareLocal,
}));
vi.mock("expo", () => ({
  requireNativeModule: () => ({
    saveImageToLibrary: state.saveImage,
    ...(state.modernPhotos
      ? { saveImageToLibraryWithErrorCodes: state.saveImageWithErrorCodes }
      : {}),
  }),
}));
vi.mock("expo-haptics", () => ({
  notificationAsync: async () => {},
  NotificationFeedbackType: { Success: "success" },
}));
vi.mock("./copyTextWithHaptic", () => ({ copyTextWithHaptic: state.copy }));
vi.mock("./localAttachmentPreview", () => ({
  loadLocalAttachmentPreview: async () => ({
    uri: "file:///Settings",
    share: state.shareDraft,
    dispose: state.previewDispose,
  }),
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

import { useMediaActions } from "../state/mediaActions";
import { isLegacyPhotoLibraryError, saveImageToLibrary } from "./saveImageToLibrary";
import type { MediaActionsSource } from "./mediaActionsSource";

const environmentId = EnvironmentId.make("media-environment");
const otherEnvironmentId = EnvironmentId.make("other-environment");
const threadId = ThreadId.make("media-thread");
const granted: Pick<AuthSessionState, "authenticated" | "scopes"> = {
  authenticated: true,
  scopes: [AuthFilesystemReadScope],
};
const denied: Pick<AuthSessionState, "authenticated" | "scopes"> = {
  authenticated: true,
  scopes: [],
};

function hostSource(_tag: "workspace-file" | "media-file" = "media-file"): MediaActionsSource {
  return {
    environmentId,
    threadId,
    resource: { _tag, threadId, path: "/repo/image.png" },
    reference: { kind: "file", path: "/repo/image.png", relativePath: "image.png" },
    name: "image.png",
    mimeType: "image/png",
  };
}

beforeEach(() => {
  state.locale = "en";
  state.cleanup = undefined;
  state.alert.mockReset();
  state.previewDispose.mockReset();
  state.sessions.clear();
  state.sessions.set(environmentId, denied);
  state.refresh.mockReset().mockResolvedValue("https://host.test/image.png");
  state.download.mockReset().mockResolvedValue(undefined);
  state.downloadPreview.mockReset();
  state.saveImage.mockReset().mockResolvedValue(undefined);
  state.saveImageWithErrorCodes.mockReset().mockResolvedValue(undefined);
  state.modernPhotos = false;
  state.shareLocal.mockReset().mockResolvedValue(undefined);
  state.shareDraft.mockReset().mockResolvedValue(undefined);
  state.navigate.mockReset();
  state.copy.mockReset();
});

it.each(["workspace-file", "media-file"] as const)(
  "blocks denied %s sharing and file opening while preserving path copying",
  async (_tag) => {
    const media = useMediaActions(hostSource(_tag));
    await media.share();
    media.actions.find(({ id }) => id === "open-file")!.run();
    media.actions.find(({ id }) => id === "copy-full-path")!.run();

    expect(state.refresh).not.toHaveBeenCalled();
    expect(state.download).not.toHaveBeenCalled();
    expect(state.navigate).not.toHaveBeenCalled();
    expect(state.copy).toHaveBeenCalledWith("/repo/image.png");
    expect(media.actions.find(({ id }) => id === "save")?.disabled).toBe(true);
    expect(media.actions.find(({ id }) => id === "save-image")?.disabled).toBe(true);
    expect(media.actions.find(({ id }) => id === "open-file")?.disabled).toBe(true);
  },
);

it("rechecks a retained menu action after revocation", async () => {
  state.sessions.set(environmentId, granted);
  const media = useMediaActions(hostSource());
  state.sessions.set(environmentId, denied);

  await media.share();
  media.actions.find(({ id }) => id === "open-file")!.run();

  expect(state.refresh).not.toHaveBeenCalled();
  expect(state.navigate).not.toHaveBeenCalled();
});

it("reenables sharing after gaining access while preserving a retained callback", async () => {
  const media = useMediaActions(hostSource());
  state.sessions.set(environmentId, granted);

  await media.share();

  expect(state.download).toHaveBeenCalledOnce();
  expect(useMediaActions(hostSource()).actions.find(({ id }) => id === "save")?.disabled).toBe(
    false,
  );
});

it.each([false, true])("uses the media environment's grant (allowed: %s)", async (allowed) => {
  state.sessions.set(environmentId, allowed ? granted : denied);
  state.sessions.set(otherEnvironmentId, allowed ? denied : granted);

  await useMediaActions(hostSource()).share();

  expect(state.refresh).toHaveBeenCalledTimes(allowed ? 1 : 0);
  expect(state.download).toHaveBeenCalledTimes(allowed ? 1 : 0);
});

it("stops before downloading if access is revoked while the URL is refreshed", async () => {
  state.sessions.set(environmentId, granted);
  state.refresh.mockImplementation(async () => {
    state.sessions.set(environmentId, denied);
    return "https://host.test/image.png";
  });

  await useMediaActions(hostSource()).share();

  expect(state.refresh).toHaveBeenCalledOnce();
  expect(state.download).not.toHaveBeenCalled();
});

it("lets an unresolved grant be authorized by an explicit server request", async () => {
  state.sessions.delete(environmentId);

  await useMediaActions(hostSource()).share();

  expect(state.refresh).toHaveBeenCalledOnce();
  expect(state.download).toHaveBeenCalledOnce();
});

it.each(["https://cdn.test/image.png", "file:///device/image.png"])(
  "shares direct media without a host grant: %s",
  async (uri) => {
    await useMediaActions({ uri, name: "image.png", mimeType: "image/png" }).share();

    expect(state.refresh).not.toHaveBeenCalled();
    expect(uri.startsWith("file:") ? state.shareLocal : state.download).toHaveBeenCalledOnce();
  },
);

it("saves a host image from its downloaded file, then removes the file", async () => {
  state.sessions.set(environmentId, granted);
  const disposed = Promise.withResolvers<void>();
  state.downloadPreview.mockResolvedValue({
    uri: "file:///cache/image.png",
    dispose: disposed.resolve,
  });

  useMediaActions(hostSource())
    .actions.find(({ id }) => id === "save-image")!
    .run();
  await disposed.promise;

  expect(state.downloadPreview).toHaveBeenCalledWith(
    expect.objectContaining({ url: "https://host.test/image.png" }),
  );
  expect(state.saveImage).toHaveBeenCalledWith("file:///cache/image.png", "image/png", "image.png");
});

it.each(["en", "zh-CN"] as const)(
  "keeps media share failures literal in %s and resets the request for retry",
  async (locale) => {
    state.locale = locale;
    for (const error of [
      new Error("Settings"),
      new Error("Allow T3 Code to add photos in Settings."),
      new Error("Open\n{0} $&"),
      "failure",
    ]) {
      state.download.mockRejectedValueOnce(error);
      const source = {
        uri: "https://host.test/Settings?token=$&",
        name: "Settings {0} $&",
        mimeType: "application/pdf",
        sourceIdentifier: "Settings",
      };
      const media = useMediaActions(source);
      await media.share();
      expect(state.alert.mock.lastCall?.slice(0, 2)).toEqual([
        locale === "en" ? "Could not share file" : "无法共享文件",
        error instanceof Error ? error.message : locale === "en" ? "Try again." : "请重试。",
      ]);
      state.alert.mockClear();
      await media.share();
      expect(state.alert).not.toHaveBeenCalled();
      expect(state.download).toHaveBeenLastCalledWith({
        url: source.uri,
        attachment: { name: source.name, mimeType: source.mimeType },
        signal: expect.any(AbortSignal),
        sourceIdentifier: source.sourceIdentifier,
      });
    }
  },
);

it.each(["en", "zh-CN"] as const)(
  "translates only the owned missing-URL failure in %s and releases failed draft sharing",
  async (locale) => {
    state.locale = locale;
    state.sessions.set(environmentId, granted);
    state.refresh.mockResolvedValueOnce(null);
    await useMediaActions(hostSource()).share();
    expect(state.alert.mock.lastCall?.[1]).toBe(
      locale === "en"
        ? "The file could not be loaded. Reconnect and try again."
        : "无法加载该文件，请重新连接后重试。",
    );
    expect(state.download).not.toHaveBeenCalled();
    state.shareDraft.mockRejectedValueOnce(new Error("Settings"));
    const attachment = {
      type: "file" as const,
      id: "draft",
      name: "Settings",
      mimeType: "application/pdf",
      sizeBytes: 4,
      fileUri: "file:///Settings",
    };
    await useMediaActions({
      attachment,
      name: attachment.name,
      mimeType: attachment.mimeType,
      sourceIdentifier: "source",
    }).share();
    expect(state.alert.mock.lastCall?.[1]).toBe("Settings");
    expect(state.previewDispose).toHaveBeenCalledOnce();
    expect(state.shareDraft).toHaveBeenCalledWith(expect.any(AbortSignal), "source");
  },
);

it.each([
  { locale: "en", modern: false },
  { locale: "zh-CN", modern: false },
  { locale: "en", modern: true },
  { locale: "zh-CN", modern: true },
] as const)(
  "retains native save-image guidance and disposes the download (%j)",
  async ({ locale, modern }) => {
    state.locale = locale;
    state.modernPhotos = modern;
    const nativeSave = modern ? state.saveImageWithErrorCodes : state.saveImage;
    state.sessions.set(environmentId, granted);
    const dispose = vi.fn();
    state.downloadPreview.mockResolvedValue({ uri: "file:///Settings", dispose });
    for (const [code, message, translated] of [
      [
        "ERR_T3_PHOTOS_PERMISSION_DENIED",
        "Allow T3 Code to add photos in Settings.",
        "请在设置中允许 T3 Code 添加照片。",
      ],
      [
        "ERR_T3_PHOTOS_SAVE_FAILED",
        "Photos could not save this image.",
        "照片应用无法保存此图片。",
      ],
    ] as const) {
      nativeSave.mockRejectedValueOnce(
        modern ? Object.assign(new Error(message), { code }) : new Error(message),
      );
      await useMediaActions({ ...hostSource(), name: "Settings {0} $&" })
        .actions.find(({ id }) => id === "save-image")!
        .run();
      expect(state.alert.mock.lastCall?.[1]).toBe(locale === "en" ? message : translated);
      expect(nativeSave).toHaveBeenLastCalledWith(
        "file:///Settings",
        "image/png",
        "Settings {0} $&",
      );
    }
    expect(dispose).toHaveBeenCalledTimes(2);
  },
);

it("blocks duplicate media shares and suppresses an error after unmount", async () => {
  const completion = Promise.withResolvers<void>();
  state.download.mockReturnValueOnce(completion.promise);
  const media = useMediaActions({
    uri: "https://host.test/file",
    name: "Settings",
    mimeType: "application/pdf",
  });
  const first = media.share();
  await media.share();
  expect(state.download).toHaveBeenCalledOnce();
  const signal = state.download.mock.lastCall![0].signal;
  state.cleanup?.();
  expect(signal.aborted).toBe(true);
  completion.reject(new Error("Settings"));
  await first;
  expect(state.alert).not.toHaveBeenCalled();
});

it("uses modern photo error codes through the real save and dialog boundary without translating raw collisions", async () => {
  state.modernPhotos = true;
  const source = {
    uri: "file:///cache/Settings",
    name: "Settings {0} $&",
    mimeType: "image/png; charset=binary",
  };
  for (const locale of ["en", "zh-CN", "en"] as const) {
    state.locale = locale;
    for (const [code, english, chinese] of [
      [
        "ERR_T3_PHOTOS_PERMISSION_DENIED",
        "Allow T3 Code to add photos in Settings.",
        "请在设置中允许 T3 Code 添加照片。",
      ],
      [
        "ERR_T3_PHOTOS_SAVE_FAILED",
        "Photos could not save this image.",
        "照片应用无法保存此图片。",
      ],
      ["ERR_T3_PHOTOS_APP_INACTIVE", "The app is not active.", "应用当前不在前台。"],
      [
        "ERR_T3_PHOTOS_ANDROID_VERSION",
        "Saving images needs Android 10 or later.",
        "保存图片需要 Android 10 或更高版本。",
      ],
      [
        "ERR_T3_PHOTOS_CREATE_FAILED",
        "Could not create the image in Pictures.",
        "无法在图片目录中创建图片。",
      ],
      ["ERR_T3_PHOTOS_IMAGE_UNAVAILABLE", "The image is no longer available.", "此图片已不可用。"],
      ["ERR_T3_PHOTOS_WRITE_FAILED", "Could not write the image.", "无法写入图片。"],
    ] as const) {
      // Android decorates an exception's message but preserves its code; the code owns the copy.
      const owned = Object.assign(new Error(`Native call failed: ${english}`), { code });
      state.saveImageWithErrorCodes.mockRejectedValueOnce(owned);
      await useMediaActions(source)
        .actions.find(({ id }) => id === "save-image")!
        .run();
      expect(state.alert.mock.lastCall?.slice(0, 2)).toEqual([
        locale === "en" ? "Could not save image" : "无法保存图片",
        locale === "en" ? english : chinese,
      ]);
      expect(owned.message).toBe(`Native call failed: ${english}`);
      for (const raw of [
        new Error(english),
        Object.assign(new Error(english), { code: "ERR_PLATFORM" }),
      ]) {
        state.saveImageWithErrorCodes.mockRejectedValueOnce(raw);
        await useMediaActions(source)
          .actions.find(({ id }) => id === "save-image")!
          .run();
        expect(state.alert.mock.lastCall?.[1]).toBe(english);
      }
    }
    for (const raw of [
      Object.assign(new Error("Settings"), { code: "constructor" }),
      Object.assign(new Error("Open {0} $&"), { code: "__proto__" }),
    ]) {
      state.saveImageWithErrorCodes.mockRejectedValueOnce(raw);
      await expect(saveImageToLibrary(source.uri, source.mimeType, source.name)).rejects.toBe(raw);
    }
  }
  expect(state.saveImage).not.toHaveBeenCalled();
  expect(state.saveImageWithErrorCodes).toHaveBeenLastCalledWith(
    source.uri,
    "image/png",
    source.name,
  );
});

it("reads the locale after a pending native save fails and permits a successful retry", async () => {
  state.modernPhotos = true;
  const completion = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  state.saveImageWithErrorCodes.mockImplementationOnce(() => {
    started.resolve();
    return completion.promise;
  });
  const media = useMediaActions({
    uri: "file:///Image.png",
    mimeType: "image/png",
    name: "Image.png",
  });
  const save = media.actions.find(({ id }) => id === "save-image")!;
  const pending = save.run();
  await started.promise;
  expect(state.saveImageWithErrorCodes).toHaveBeenCalledOnce();
  state.locale = "zh-CN";
  completion.reject(
    Object.assign(new Error("Photos could not save this image."), {
      code: "ERR_T3_PHOTOS_SAVE_FAILED",
    }),
  );
  await pending;
  expect(state.alert.mock.lastCall?.[1]).toBe("照片应用无法保存此图片。");
  state.alert.mockClear();
  await save.run();
  expect(state.alert).not.toHaveBeenCalled();
  expect(state.saveImageWithErrorCodes).toHaveBeenCalledTimes(2);
});

it("confines legacy photo translation to native failures rather than download errors", async () => {
  state.locale = "zh-CN";
  state.sessions.set(environmentId, granted);
  const raw = new Error("Photos could not save this image.");
  state.downloadPreview.mockRejectedValueOnce(raw);
  await useMediaActions(hostSource())
    .actions.find(({ id }) => id === "save-image")!
    .run();
  expect(state.alert.mock.lastCall?.[1]).toBe(raw.message);
  expect(state.saveImage).not.toHaveBeenCalled();
  expect(state.saveImageWithErrorCodes).not.toHaveBeenCalled();
});

it("suppresses modern photo failures after the owner unmounts", async () => {
  state.modernPhotos = true;
  const completion = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  state.saveImageWithErrorCodes.mockImplementationOnce(() => {
    started.resolve();
    return completion.promise;
  });
  const media = useMediaActions({
    uri: "file:///Image.png",
    mimeType: "image/png",
    name: "Image.png",
  });
  const pending = media.actions.find(({ id }) => id === "save-image")!.run();
  await started.promise;
  expect(state.saveImageWithErrorCodes).toHaveBeenCalledOnce();
  state.cleanup?.();
  completion.reject(
    Object.assign(new Error("Photos could not save this image."), {
      code: "ERR_T3_PHOTOS_SAVE_FAILED",
    }),
  );
  await pending;
  expect(state.alert).not.toHaveBeenCalled();
});

it("preserves a legacy native Error through Effect and clears its legacy display provenance on a modern retry", async () => {
  const error = Object.assign(new Error("Photos could not save this image."), {
    name: "NativePhotoFailure",
    code: "ERR_PLATFORM",
  });
  const stack = error.stack;
  state.saveImage.mockRejectedValueOnce(error);
  const result = await settlePromise(() =>
    saveImageToLibrary("file:///Image.png", "image/png", "Image.png"),
  );
  if (!AsyncResult.isFailure(result)) throw new Error("Expected the native save to fail");
  expect(squashAtomCommandFailure(result)).toBe(error);
  expect(isLegacyPhotoLibraryError(error)).toBe(true);
  expect(error).toMatchObject({
    name: "NativePhotoFailure",
    code: "ERR_PLATFORM",
    message: "Photos could not save this image.",
    stack,
  });
  state.modernPhotos = true;
  state.locale = "zh-CN";
  state.saveImageWithErrorCodes.mockRejectedValueOnce(error);
  await useMediaActions({ uri: "file:///Image.png", mimeType: "image/png", name: "Image.png" })
    .actions.find(({ id }) => id === "save-image")!
    .run();
  expect(state.alert.mock.lastCall?.[1]).toBe(error.message);
  expect(isLegacyPhotoLibraryError(error)).toBe(false);
  expect(error.stack).toBe(stack);
});
