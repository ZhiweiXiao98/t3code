import { PreviewCaptureFailure } from "@t3tools/contracts";
import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import * as Schema from "effect/Schema";
import {
  BrowserRecordingUnavailableError,
  BrowserRecordingConflictError,
  BrowserRecordingFormatUnavailableError,
  BrowserRecordingCaptureTimeoutError,
  BrowserRecordingOperationError,
} from "~/browser/browserRecording";

const isCapture = Schema.is(PreviewCaptureFailure);
const isUnavailable = Schema.is(BrowserRecordingUnavailableError);
const isConflict = Schema.is(BrowserRecordingConflictError);
const isFormat = Schema.is(BrowserRecordingFormatUnavailableError);
const isTimeout = Schema.is(BrowserRecordingCaptureTimeoutError);
const isOperation = Schema.is(BrowserRecordingOperationError);

/** Present only locally constructed or officially decoded instances; never infer origin from text. */
export function browserCaptureFailureMessage(
  error: unknown,
  locale: ResolvedAppLocale,
): string | undefined {
  if (!(error instanceof Error)) return undefined;
  if (locale !== "zh-CN") return error.message;
  const prototype = Object.getPrototypeOf(error);
  if (prototype === PreviewCaptureFailure.prototype && isCapture(error)) {
    switch (error.reason) {
      case "renderer-unavailable":
        return "预览渲染器不可用。请重新打开预览标签页后重试。";
      case "capture-unavailable":
        return "预览捕获区域不可用。请显示目标标签页，并确认预览主机已解锁、显示屏已开启且窗口已恢复后重试。";
      case "capture-timeout":
        return `预览捕获在 ${error.stage} 阶段超时。请检查预览主机的锁定、显示屏和窗口状态后重试。`;
      case "recording-conflict":
        return "录制正在启动、停止或进行中。请等待操作完成，或停止当前录制后重试。";
      case "capture-failed":
        return `预览捕获在 ${error.stage} 阶段失败。请检查预览主机和目标标签页后重试。`;
    }
  }
  if (prototype === BrowserRecordingUnavailableError.prototype && isUnavailable(error))
    return `标签页 ${error.tabId} 无法录制浏览器画面。`;
  if (prototype === BrowserRecordingConflictError.prototype && isConflict(error))
    return `标签页 ${error.activeTabId} 正在录制，无法同时录制标签页 ${error.requestedTabId}。`;
  if (prototype === BrowserRecordingFormatUnavailableError.prototype && isFormat(error))
    return `MediaRecorder 未报告标签页 ${error.tabId} 的输出格式。`;
  if (prototype === BrowserRecordingCaptureTimeoutError.prototype && isTimeout(error))
    return `标签页 ${error.tabId} 的浏览器录制媒体捕获未在 ${error.timeoutMs}ms 内完成。`;
  if (prototype === BrowserRecordingOperationError.prototype && isOperation(error)) {
    if (
      error.cause instanceof Error &&
      Object.getPrototypeOf(error.cause) === PreviewCaptureFailure.prototype &&
      isCapture(error.cause)
    )
      return browserCaptureFailureMessage(error.cause, locale);
    // Match the original getter's branch while leaving the platform's diagnostic suffix literal.
    const captureCause = error.cause instanceof AggregateError ? error.cause.cause : error.cause;
    if (
      error.operation === "capture-media-stream" &&
      captureCause instanceof DOMException &&
      captureCause.name === "NotReadableError"
    ) {
      return `无法启动预览视频源。请确认捕获主机已解锁且显示屏已开启，然后重试。${captureCause.name}: ${captureCause.message}`;
    }
    // The original getter may recognize a foreign shape as a capture failure. Do not claim its message.
    if (isCapture(error.cause)) return error.message;
    return `标签页 ${error.tabId} 的浏览器录制操作 ${error.operation} 失败。`;
  }
  return error.message;
}
