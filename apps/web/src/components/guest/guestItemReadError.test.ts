import * as Cause from "effect/Cause";
import { describe, expect, it, vi } from "vite-plus/test";
import { formatEnvironmentQueryError } from "~/state/query";
import { GuestItemReadError, guestItemFailureMessage } from "./guestItemReadError";

const current = vi.hoisted(() => ({ locale: "en" as "en" | "zh-CN" }));
vi.mock("~/i18n/readWebI18n", () => ({ readWebI18n: () => current }));

describe("cached guest item failures", () => {
  it.each([
    ["Could not load this item.", "无法加载此条目。"],
    ["Output is no longer available.", "输出已不可用。"],
  ] as const)(
    "resolves %s at the current locale without recreating the cached failure",
    (source, chinese) => {
      const error = new GuestItemReadError({ source });
      const cachedCause = Cause.fail(error);
      try {
        for (const locale of ["en", "zh-CN", "en"] as const) {
          current.locale = locale;
          expect(error.message).toBe(locale === "zh-CN" ? chinese : source);
          expect(formatEnvironmentQueryError(cachedCause)).toBe(
            locale === "zh-CN" ? chinese : source,
          );
          expect(error.source).toBe(source);
          expect(guestItemFailureMessage(locale, error, source)).toBe(
            locale === "zh-CN" ? chinese : source,
          );
        }
      } finally {
        current.locale = "en";
      }
    },
  );

  it("leaves non-guest provider failures opaque during the same switches", () => {
    const message = "Output is no longer available.";
    const cachedCause = Cause.fail(new Error(message));
    try {
      for (const locale of ["en", "zh-CN", "en"] as const) {
        current.locale = locale;
        expect(formatEnvironmentQueryError(cachedCause)).toBe(message);
        expect(guestItemFailureMessage(locale, new Error(message), message)).toBe(message);
        expect(
          guestItemFailureMessage(locale, { _tag: "GuestItemReadError", source: message }, message),
        ).toBe(message);
      }
    } finally {
      current.locale = "en";
    }
  });
});
