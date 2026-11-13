import * as Schema from "effect/Schema";
import { PreviewCaptureFailure } from "@t3tools/contracts";
import { browserCaptureFailureMessage } from "~/components/preview/browserCaptureMessages";
import { previewBridge } from "~/components/preview/previewBridge";
import {
  DESKTOP_PREVIEW_RECORDING_CAPTURE_TRIGGER,
  EnvironmentId,
  ThreadId,
  type DesktopPreviewBridge,
} from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  captureScreenshot,
  clientSettings,
  events,
  getDisplayMedia,
  registrySet,
  requestDisplayMediaCapture,
  save,
  startScreencast,
  stopScreencast,
} = vi.hoisted(() => {
  const events: string[] = [];
  return {
    captureScreenshot: vi.fn<DesktopPreviewBridge["captureScreenshot"]>(),
    clientSettings: { browserRecordingFrameRate: 30 as 30 | 60 },
    events,
    getDisplayMedia: vi.fn(),
    requestDisplayMediaCapture: vi.fn((_tabId: string) => undefined),
    registrySet: vi.fn((_atom: unknown, value: { readonly tabIds: ReadonlySet<string> }) => {
      events.push(
        value.tabIds.size === 0 ? "clear" : `publish:${Array.from(value.tabIds).join(",")}`,
      );
    }),
    save: vi.fn(async (tabId: string) => ({
      id: "recording-test",
      tabId,
      path: "/tmp/recording-test.webm",
      mimeType: "video/webm" as const,
      sizeBytes: 0,
      createdAt: "2026-06-26T00:00:00.000Z",
    })),
    startScreencast: vi.fn<DesktopPreviewBridge["recording"]["startScreencast"]>(async (_tabId) => {
      events.push("start-screencast");
    }),
    stopScreencast: vi.fn(async () => undefined),
  };
});

vi.mock(import("~/components/preview/previewBridge"), async (original) => {
  vi.stubGlobal("window", {
    desktopBridge: {
      preview: {
        captureScreenshot,
        recording: {
          onFrame: vi.fn(),
          save,
          startScreencast: async (tabId: string) => {
            const result = await startScreencast(tabId);
            if (result === undefined) requestDisplayMediaCapture(tabId);
            return result;
          },
          stopScreencast,
        },
      },
    },
  });
  try {
    return await original();
  } finally {
    vi.unstubAllGlobals();
  }
});

vi.mock("~/rpc/atomRegistry", () => ({
  appAtomRegistry: { set: registrySet },
}));

vi.mock("~/hooks/useSettings", () => ({
  ensureClientSettingsHydrated: vi.fn(async () => undefined),
  getClientSettings: () => clientSettings,
}));

import {
  BrowserRecordingConflictError,
  BrowserRecordingUnavailableError,
  BrowserRecordingFormatUnavailableError,
  BrowserRecordingCaptureTimeoutError,
  BrowserRecordingOperationError,
  findActiveBrowserRecordingRuntimeTabId,
  readActiveBrowserRecordingTabIds,
  readActiveBrowserRecordingTargets,
  startBrowserRecording,
  stopBrowserRecording,
} from "./browserRecording";
import { useBrowserSurfaceStore } from "./browserSurfaceStore";
import { previewRuntimeTabId } from "./previewRuntimeTabId";

class FakeMediaRecorder {
  static readonly instances: FakeMediaRecorder[] = [];
  static supportedTypes = new Set(["video/webm;codecs=vp9"]);
  static outputMimeType: string | undefined;
  static stopError: unknown;
  static isTypeSupported(type: string): boolean {
    return this.supportedTypes.has(type);
  }

  state: RecordingState = "inactive";
  readonly mimeType: string;
  readonly stream: MediaStream;
  readonly options: MediaRecorderOptions | undefined;
  private readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  constructor(stream: MediaStream, options?: MediaRecorderOptions) {
    this.stream = stream;
    this.options = options;
    this.mimeType =
      FakeMediaRecorder.outputMimeType ?? options?.mimeType ?? "video/browser-default";
    FakeMediaRecorder.instances.push(this);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  start(): void {
    this.state = "recording";
  }

  stop(): void {
    if (FakeMediaRecorder.stopError !== undefined) throw FakeMediaRecorder.stopError;
    this.state = "inactive";
    for (const listener of this.listeners.get("stop") ?? []) {
      if (typeof listener === "function") listener(new Event("stop"));
      else listener.handleEvent(new Event("stop"));
    }
  }
}

const encodeCaptureFailure = Schema.encodeSync(PreviewCaptureFailure);

describe("browser recording", () => {
  let animationFrameCount = 0;

  beforeEach(() => {
    events.length = 0;
    vi.clearAllMocks();
    FakeMediaRecorder.instances.length = 0;
    FakeMediaRecorder.supportedTypes = new Set(["video/webm;codecs=vp9"]);
    FakeMediaRecorder.outputMimeType = undefined;
    FakeMediaRecorder.stopError = undefined;
    clientSettings.browserRecordingFrameRate = 30;
    animationFrameCount = 0;
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      animationFrameCount += 1;
      callback(animationFrameCount);
      return animationFrameCount;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder as unknown as typeof MediaRecorder);
    getDisplayMedia.mockResolvedValue({
      getVideoTracks: () => [],
      getTracks: () => [{ stop: vi.fn() }],
    });
    requestDisplayMediaCapture.mockImplementation((tabId: string) => {
      const trigger = Reflect.get(globalThis, DESKTOP_PREVIEW_RECORDING_CAPTURE_TRIGGER);
      if (typeof trigger !== "function" || trigger(tabId) !== true) {
        throw new Error(`No pending display-media capture for ${tabId}.`);
      }
    });
    vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia } });
    useBrowserSurfaceStore.setState({ activityByTabId: {}, byTabId: {} });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([
    "renderer-unavailable",
    "capture-unavailable",
    "capture-timeout",
    "recording-conflict",
    "capture-failed",
  ] as const)(
    "presents officially decoded %s errors from screenshot and recording without changing wire data",
    async (reason) => {
      const failure = new PreviewCaptureFailure({ reason, stage: "screenshot" });
      const encoded = encodeCaptureFailure(failure);
      captureScreenshot.mockResolvedValueOnce(encoded);
      const screenshot = await previewBridge!
        .captureScreenshot("tab/{literal}/$&")
        .catch((error: unknown) => error);
      expect(screenshot).toBeInstanceOf(PreviewCaptureFailure);
      expect(browserCaptureFailureMessage(screenshot, "en")).toBe(failure.message);
      expect(browserCaptureFailureMessage(screenshot, "zh-CN")).toMatch(/[\u3400-\u9fff]/);
      expect(browserCaptureFailureMessage(screenshot, "en")).toBe(failure.message);
      expect(captureScreenshot).toHaveBeenLastCalledWith("tab/{literal}/$&");
      const recordingFailure = new PreviewCaptureFailure({ reason, stage: "recording-start" });
      startScreencast.mockResolvedValueOnce(encodeCaptureFailure(recordingFailure));
      const recording = await startBrowserRecording("recording-tab").catch(
        (error: unknown) => error,
      );
      expect(browserCaptureFailureMessage(recording, "zh-CN")).toBe(
        browserCaptureFailureMessage(recordingFailure, "zh-CN"),
      );
      expect(browserCaptureFailureMessage(recording, "en")).toBe(recordingFailure.message);
      expect(encoded).toEqual(encodeCaptureFailure(failure));
      expect(readActiveBrowserRecordingTabIds().size).toBe(0);
    },
  );

  it("keeps owned recording parameters and external diagnostics literal across locale changes", () => {
    const tabId = "tab:{literal}/$&\n中文";
    const diagnostic =
      "The preview renderer is unavailable. Reopen the preview tab before retrying.";
    const external = new DOMException(diagnostic, "NotReadableError");
    const errors = [
      new BrowserRecordingUnavailableError({ tabId }),
      new BrowserRecordingConflictError({ requestedTabId: tabId, activeTabId: "active/{name}/$&" }),
      new BrowserRecordingFormatUnavailableError({ tabId }),
      new BrowserRecordingCaptureTimeoutError({ tabId, timeoutMs: 1234 }),
      new BrowserRecordingOperationError({
        tabId,
        operation: "cleanup",
        cause: new Error(diagnostic),
      }),
      new BrowserRecordingOperationError({
        tabId,
        operation: "capture-media-stream",
        cause: external,
      }),
    ];
    for (const error of errors) {
      const english = error.message;
      expect(browserCaptureFailureMessage(error, "en")).toBe(english);
      expect(browserCaptureFailureMessage(error, "zh-CN")).not.toBe(english);
      expect(browserCaptureFailureMessage(error, "en")).toBe(english);
      const collision = Object.assign(new Error(english), { _tag: error._tag, tabId });
      expect(browserCaptureFailureMessage(collision, "zh-CN")).toBe(english);
      expect(error.message).toBe(english);
    }
    expect(browserCaptureFailureMessage(errors[0], "zh-CN")).toContain(tabId);
    expect(browserCaptureFailureMessage(errors[5], "zh-CN")).toContain(
      `NotReadableError: ${diagnostic}`,
    );
    const fakeCapture = Object.assign(new Error(diagnostic), {
      _tag: "PreviewCaptureFailure",
      reason: "renderer-unavailable",
      stage: "screenshot",
    });
    expect(browserCaptureFailureMessage(fakeCapture, "zh-CN")).toBe(diagnostic);
    expect(external.message).toBe(diagnostic);
  });

  it("stops the native stream when MediaRecorder cleanup fails", async () => {
    const stopTrack = vi.fn();
    getDisplayMedia.mockResolvedValueOnce({
      getVideoTracks: () => [],
      getTracks: () => [{ stop: stopTrack }],
    });

    await startBrowserRecording("recording-tab");
    const cleanupCause = new DOMException("Could not start video source", "NotReadableError");
    FakeMediaRecorder.stopError = cleanupCause;

    await expect(stopBrowserRecording("recording-tab")).rejects.toMatchObject({
      operation: "cleanup",
      tabId: "recording-tab",
      message: "Browser recording operation cleanup failed for tab recording-tab.",
    });
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it("releases the native capture lease when stream acquisition fails", async () => {
    const cause = new Error("capture failed");
    cause.name = "NotReadableError";
    getDisplayMedia.mockRejectedValueOnce(cause);

    await expect(startBrowserRecording("recording-tab")).rejects.toMatchObject({
      operation: "capture-media-stream",
      tabId: "recording-tab",
      cause,
      message: "Browser recording operation capture-media-stream failed for tab recording-tab.",
    });

    expect(stopScreencast).toHaveBeenCalledWith("recording-tab");
    expect(events.at(-1)).toBe("clear");
  });

  it("records separate tabs concurrently", async () => {
    const firstThreadRef = {
      environmentId: EnvironmentId.make("environment-recording"),
      threadId: ThreadId.make("thread-recording-first"),
    };
    const secondThreadRef = {
      environmentId: EnvironmentId.make("environment-recording"),
      threadId: ThreadId.make("thread-recording-second"),
    };
    await Promise.all([
      startBrowserRecording("recording-tab", firstThreadRef),
      startBrowserRecording("recording-tab-2", secondThreadRef),
    ]);

    expect(startScreencast).toHaveBeenCalledTimes(2);
    expect(events).toContain("publish:recording-tab,recording-tab-2");
    expect(readActiveBrowserRecordingTabIds()).toEqual(
      new Set(["recording-tab", "recording-tab-2"]),
    );
    expect(readActiveBrowserRecordingTabIds(firstThreadRef)).toEqual(new Set(["recording-tab"]));
    expect(readActiveBrowserRecordingTabIds(secondThreadRef)).toEqual(new Set(["recording-tab-2"]));

    await stopBrowserRecording("recording-tab");
    expect(readActiveBrowserRecordingTabIds()).toEqual(new Set(["recording-tab-2"]));
    await stopBrowserRecording("recording-tab-2");
    expect(readActiveBrowserRecordingTabIds()).toEqual(new Set());
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("keeps a recording reachable through its runtime id after a server epoch changes", async () => {
    const threadRef = {
      environmentId: EnvironmentId.make("environment-recording"),
      threadId: ThreadId.make("thread-recording-scoped"),
    };
    const runtimeTabId = previewRuntimeTabId(threadRef, "epoch-a", "tab_1");
    await startBrowserRecording(runtimeTabId, threadRef, "tab_1");

    expect(startScreencast).toHaveBeenCalledWith(runtimeTabId);
    expect(readActiveBrowserRecordingTabIds(threadRef)).toEqual(new Set([runtimeTabId]));
    expect(readActiveBrowserRecordingTargets(threadRef)).toEqual([
      { runtimeTabId, serverTabId: "tab_1" },
    ]);
    expect(findActiveBrowserRecordingRuntimeTabId(threadRef, "tab_1")).toBe(runtimeTabId);

    const replacementRuntimeTabId = previewRuntimeTabId(threadRef, "epoch-b", "tab_1");
    await expect(
      startBrowserRecording(replacementRuntimeTabId, threadRef, "tab_1"),
    ).rejects.toBeInstanceOf(BrowserRecordingConflictError);
    expect(startScreencast).toHaveBeenCalledTimes(1);

    await stopBrowserRecording(runtimeTabId);
  });
});
