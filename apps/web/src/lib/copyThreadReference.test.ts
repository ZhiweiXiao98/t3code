import { expect, it, vi } from "vite-plus/test";
import type { ThreadReferenceCopyTarget } from "@t3tools/client-runtime/thread-reference";
import { translateWebSource } from "../i18n/messages";
import { copyThreadReference } from "./copyThreadReference";
const fixture = vi.hoisted(() => ({ write: vi.fn(), toast: vi.fn() }));
vi.mock("../hooks/useCopyToClipboard", async (original) => ({
  ...(await original<typeof import("../hooks/useCopyToClipboard")>()),
  writeTextToClipboard: fixture.write,
}));
vi.mock("../components/ui/toast", async (original) => {
  const actual = await original<typeof import("../components/ui/toast")>();
  return { ...actual, toastManager: { ...actual.toastManager, add: fixture.toast } };
});
const target: ThreadReferenceCopyTarget = {
  kind: "pull-request",
  value: "https://example.invalid/PR/$&/{literal}",
  description: "Literal $& {description}",
  clipboardTarget: "pull request link",
  successTitle: "PR link copied",
  failureTitle: "Failed to copy PR link",
};
it.each(["explicit", "default", "lazy"] as const)(
  "preserves %s locale selection after write",
  async (kind) => {
    vi.clearAllMocks();
    let finish!: (value: boolean) => void;
    fixture.write.mockReset().mockReturnValue(
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
    );
    let locale: "en" | "zh-CN" = "en";
    const read = vi.fn(() => locale);
    const pending =
      kind === "default"
        ? copyThreadReference(target)
        : copyThreadReference(target, kind === "explicit" ? "en" : read);
    expect(read).not.toHaveBeenCalled();
    locale = "zh-CN";
    finish(true);
    await pending;
    expect(read).toHaveBeenCalledTimes(kind === "lazy" ? 1 : 0);
    expect(fixture.toast).toHaveBeenCalledExactlyOnceWith({
      type: "success",
      title: translateWebSource(kind === "lazy" ? "zh-CN" : "en", target.successTitle),
      description: target.description,
    });
    expect(fixture.write).toHaveBeenCalledExactlyOnceWith(
      target.value,
      target.clipboardTarget,
      undefined,
    );
  },
);
it("does not read locale or emit when no copy occurred", async () => {
  vi.clearAllMocks();
  fixture.write.mockReset().mockResolvedValue(false);
  const read = vi.fn(() => "zh-CN" as const);
  await copyThreadReference(target, read);
  expect(read).not.toHaveBeenCalled();
  expect(fixture.toast).not.toHaveBeenCalled();
});
it.each(["raw", "empty", "fallback"] as const)(
  "preserves %s failure detail with one lazy locale read",
  async (kind) => {
    vi.clearAllMocks();
    const error =
      kind === "fallback" ? null : new Error(kind === "empty" ? "" : "An error occurred.");
    fixture.write.mockReset().mockRejectedValue(error);
    using log = vi.spyOn(console, "error").mockImplementation(() => {});
    const read = vi.fn(() => "zh-CN" as const);
    await copyThreadReference(target, read);
    expect(read).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledExactlyOnceWith(error);
    expect(fixture.toast.mock.calls[0]?.[0]).toMatchObject({
      title: translateWebSource("zh-CN", target.failureTitle),
      description:
        kind === "fallback"
          ? translateWebSource("zh-CN", "An error occurred.")
          : error instanceof Error
            ? error.message
            : "",
    });
  },
);
