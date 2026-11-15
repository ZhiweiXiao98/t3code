import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import * as Schema from "effect/Schema";
import {
  ClipboardApiUnavailableError,
  ClipboardWriteError,
  ClipboardReadUnavailableError,
  ClipboardReadError,
} from "~/hooks/useCopyToClipboard";

const isUnavailable = Schema.is(ClipboardApiUnavailableError);
const isWrite = Schema.is(ClipboardWriteError);
const isReadUnavailable = Schema.is(ClipboardReadUnavailableError);
const isRead = Schema.is(ClipboardReadError);

/** Only local typed failures own these templates. Targets stay literal unless explicitly paired; diagnostics stay opaque. */
export function clipboardErrorMessage(
  error: unknown,
  locale: ResolvedAppLocale,
  ownedTarget?: { readonly target: string; readonly displayTarget: string },
): string | undefined {
  if (!(error instanceof Error)) return undefined;
  if (locale !== "zh-CN") return error.message;
  const prototype = Object.getPrototypeOf(error);
  const displayTarget = (target: string) =>
    ownedTarget?.target === target ? ownedTarget.displayTarget : target;
  if (prototype === ClipboardApiUnavailableError.prototype && isUnavailable(error))
    return `复制 ${displayTarget(error.target)} 时剪贴板 API 不可用。`;
  if (prototype === ClipboardWriteError.prototype && isWrite(error))
    return `无法将 ${displayTarget(error.target)} 复制到剪贴板。`;
  if (prototype === ClipboardReadUnavailableError.prototype && isReadUnavailable(error))
    return `读取 ${displayTarget(error.target)} 时剪贴板 API 不可用。`;
  if (prototype === ClipboardReadError.prototype && isRead(error))
    return `无法从剪贴板读取 ${displayTarget(error.target)}。`;
  return error.message;
}
