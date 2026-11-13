import { Children, isValidElement, type ReactNode } from "react";
import { expect, it, vi } from "vite-plus/test";

vi.mock("../../components/ui/AppText", () => ({ AppText: () => null }));
vi.mock("../../lib/copyTextWithHaptic", () => ({ copyTextWithHaptic: vi.fn() }));
vi.mock("../../i18n/mobileStrings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../i18n/mobileStrings")>();
  return { ...actual, localizeMobileString: vi.fn(actual.localizeMobileString) };
});

import { copyTextWithHaptic } from "../../lib/copyTextWithHaptic";
import { localizeMobileString } from "../../i18n/mobileStrings";
import { ConnectionTraceId } from "./ConnectionTraceId";

it("localizes trace copy affordances without translating the trace or changing copy activation", async () => {
  const actual = await vi.importActual<typeof import("../../i18n/mobileStrings")>(
    "../../i18n/mobileStrings",
  );
  const copy = vi.mocked(copyTextWithHaptic);
  copy.mockClear();
  for (const locale of ["en", "zh-CN"] as const) {
    vi.mocked(localizeMobileString).mockImplementation((value) =>
      actual.localizeMobileString(value, locale),
    );
    for (const activation of ["press", "longPress"] as const) {
      const view = ConnectionTraceId({ traceId: "Settings", activation });
      const [label, trace] = Children.toArray(view.props.children);
      expect(label).toBe(locale === "zh-CN" ? " 跟踪 ID： " : " Trace ID: ");
      if (
        !isValidElement<{
          children: ReactNode;
          localize: boolean;
          accessibilityHint: string;
          accessibilityActions: ReadonlyArray<{ name: string; label: string }>;
          onAccessibilityAction: (event: {
            stopPropagation: () => void;
            nativeEvent: { actionName: string };
          }) => void;
        }>(trace)
      ) {
        throw new Error("Expected the trace copy control");
      }
      expect(trace.props.children).toBe("Settings");
      expect(trace.props.localize).toBe(false);
      expect(trace.props.accessibilityHint).toBe(
        locale === "zh-CN"
          ? activation === "longPress"
            ? "长按以复制跟踪 ID"
            : "复制跟踪 ID"
          : activation === "longPress"
            ? "Long press to copy the trace ID"
            : "Copies the trace ID",
      );
      expect(trace.props.accessibilityActions).toEqual([
        { name: "activate", label: locale === "zh-CN" ? "复制跟踪 ID" : "Copy trace ID" },
      ]);
      const stopPropagation = vi.fn();
      trace.props.onAccessibilityAction({
        stopPropagation,
        nativeEvent: { actionName: "activate" },
      });
      expect(stopPropagation).toHaveBeenCalledOnce();
      expect(copy).toHaveBeenLastCalledWith("Settings", { target: "connection-trace-id" });
    }
  }
  expect(copy).toHaveBeenCalledTimes(4);
});
