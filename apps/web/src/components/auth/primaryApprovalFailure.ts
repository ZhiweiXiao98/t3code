import { AuthMcpApprovalError } from "@t3tools/contracts";
import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import * as Schema from "effect/Schema";

export interface McpApprovalFailure {
  readonly kind: "error";
  readonly message: string;
}

const MESSAGES: Readonly<Record<string, string>> = {
  "This sign-in link names an unknown app. Start the sign-in again from it.":
    "此登录链接指定了未知应用。请从该应用重新发起登录。",
  "This sign-in link sends you to an address the app did not register.":
    "此登录链接会将你转到该应用未注册的地址。",
  "Linking needs a plain pairing code, not an app approval code.":
    "关联需要普通配对码，不能使用应用批准码。",
  "The code could not be checked. Try again.": "无法验证此验证码。请重试。",
  "Your session cannot approve this request. Enter a pairing code instead.":
    "当前会话无法批准此请求。请改为输入配对码。",
  "That pairing code cannot grant this access. It has not been used, so choose an access level it grants, or create a code with the standard scopes.":
    "此配对码无法授予该访问权限。它尚未被使用，请选择它允许的访问级别，或创建具有标准权限范围的配对码。",
  "That is not a one-time pairing code.": "这不是一次性配对码。",
  "That pairing code is unknown, expired, or already used.": "此配对码未知、已过期或已被使用。",
};

const isApprovalError = Schema.is(AuthMcpApprovalError);
// Keep provenance local to the primary HTTP response; custom transport text is never reclassified.
const primaryFailures = new WeakMap<McpApprovalFailure, string>();

export function primaryApprovalFailure(error: unknown): McpApprovalFailure | null {
  if (
    !isApprovalError(error) ||
    Object.getPrototypeOf(error) !== AuthMcpApprovalError.prototype ||
    !Object.hasOwn(MESSAGES, error.message)
  ) {
    return null;
  }
  const failure: McpApprovalFailure = { kind: "error", message: error.message };
  primaryFailures.set(failure, error.message);
  return failure;
}

export function approvalFailureMessage(
  locale: ResolvedAppLocale,
  failure: McpApprovalFailure,
): string {
  const source = primaryFailures.get(failure);
  return locale === "zh-CN" && source !== undefined ? MESSAGES[source]! : failure.message;
}
