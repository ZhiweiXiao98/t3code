import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

vi.mock("react-native", () => ({
  View: ({ children }: { readonly children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock("expo", () => ({
  requireNativeView: () =>
    function NativeSegmentedControl(props: {
      readonly labels: readonly string[];
      readonly selectedIndex: number;
      readonly onSelectionChange: (event: { nativeEvent: { index: number } }) => void;
    }) {
      return props.labels.map((label, index) => (
        <button
          key={label}
          aria-pressed={props.selectedIndex === index}
          onClick={() => props.onSelectionChange({ nativeEvent: { index } })}
        >
          {label}
        </button>
      ));
    },
}));
vi.mock("./SegmentedControl.shared", () => ({ SegmentedControl: () => null }));
vi.mock("./useControlTheme", () => ({
  useControlTheme: () => ({ colors: {}, colorScheme: "light", themeId: "t3-code" }),
}));
vi.mock("./segmentedControlColors", () => ({ segmentedControlColors: () => ({}) }));

import * as strings from "../../i18n/mobileStrings";
import { SegmentedControl } from "./SegmentedControl";

const labels = [
  ["cost", "Cost", "成本"],
  ["tokens", "Tokens", "Token"],
  ["limits", "Limits", "额度"],
  [1, "24h", "24 小时"],
  [7, "7d", "7 天"],
  [30, "30d", "30 天"],
  [90, "90d", "90 天"],
  ["overview", "Overview", "概览"],
  ["guide", "Guide", "导览"],
  ["activity", "Activity", "动态"],
  ["comment", "Comment", "评论"],
  ["approve", "Approve", "批准"],
  ["request-changes", "Request changes", "请求更改"],
  ["custom", "custom-provider-name", "custom-provider-name"],
  ["prototype", "__proto__", "__proto__"],
] as const;

it.each(["en", "zh-CN"] as const)(
  "localizes iOS segment titles in %s without changing selection values or indices",
  (locale) => {
    const original = strings.localizeMobileString;
    using _locale = vi
      .spyOn(strings, "localizeMobileString")
      .mockImplementation((value) => original(value, locale));
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    const root = createRoot(container);
    const options = labels.map(([value, label]) => ({ value, label }));
    const onSelect = vi.fn();
    try {
      act(() =>
        root.render(
          <SegmentedControl<string | number> options={options} selected={7} onSelect={onSelect} />,
        ),
      );
      const buttons = [...container.querySelectorAll("button")];
      expect(buttons.map((button) => button.textContent)).toEqual(
        labels.map(([, english, chinese]) => (locale === "zh-CN" ? chinese : english)),
      );
      expect(buttons.map((button) => button.getAttribute("aria-pressed"))).toEqual(
        options.map((option) => String(option.value === 7)),
      );
      for (const button of buttons) act(() => button.click());
      expect(onSelect.mock.calls).toEqual(options.map((option) => [option.value]));
      expect(options.map((option) => option.label)).toEqual(labels.map(([, label]) => label));
    } finally {
      act(() => root.unmount());
      vi.unstubAllGlobals();
    }
  },
);
