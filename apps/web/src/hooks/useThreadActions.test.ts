import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  formatThreadActionError,
  navigateAfterThreadDeletion,
  ThreadActiveReorderUnsupportedError,
  ThreadArchiveBlockedError,
  ThreadAutoSettleOptOutUnsupportedError,
  ThreadPinningUnsupportedError,
  ThreadPinReorderUnsupportedError,
  ThreadSettlementUnsupportedError,
  ThreadSnoozeBlockedError,
  ThreadSnoozeUnsupportedError,
} from "./useThreadActions";
import { toastManager } from "../components/ui/toast";

describe("navigateAfterThreadDeletion", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reports a rejected navigation without failing the completed deletion", async () => {
    const addToast = vi.spyOn(toastManager, "add").mockReturnValue("navigation-error");

    await expect(
      navigateAfterThreadDeletion(() => Promise.reject(new Error("route unavailable"))),
    ).resolves.toBeUndefined();

    expect(addToast).toHaveBeenCalledOnce();
    expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Thread deleted, but navigation failed",
        description: "route unavailable",
      }),
    );
  });
});

describe("formatThreadActionError", () => {
  it.each(
    [
      ThreadArchiveBlockedError,
      ThreadSettlementUnsupportedError,
      ThreadSnoozeUnsupportedError,
      ThreadSnoozeBlockedError,
      ThreadAutoSettleOptOutUnsupportedError,
      ThreadPinningUnsupportedError,
      ThreadPinReorderUnsupportedError,
      ThreadActiveReorderUnsupportedError,
    ].map((ErrorClass) => [ErrorClass.name, ErrorClass] as const),
  )("%s only localizes its local instance", (_name, ErrorClass) => {
    const error = new ErrorClass({
      environmentId: EnvironmentId.make("display-env"),
      threadId: ThreadId.make("thread"),
    });
    const originalMessage = error.message;
    const fallback = "explicit fallback";
    const localized = formatThreadActionError(error, "zh-CN", fallback);
    expect(localized).toMatch(/\p{Script=Han}/u);
    expect(localized).not.toBe(originalMessage);
    expect(localized).not.toBe(fallback);
    expect(formatThreadActionError(error, "en", fallback)).toBe(originalMessage);
    expect(error.message).toBe(originalMessage);

    const external = Object.assign(new Error(originalMessage), {
      name: ErrorClass.name,
      _tag: error._tag,
    });
    expect(formatThreadActionError(external, "zh-CN", fallback)).toBe(originalMessage);
    expect(
      formatThreadActionError({ _tag: error._tag, message: originalMessage }, "zh-CN", fallback),
    ).toBe(fallback);
    expect(formatThreadActionError(originalMessage, "zh-CN", fallback)).toBe(fallback);
  });
});
