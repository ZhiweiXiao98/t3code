import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import { formatProviderUpdateRequiredNotice } from "@t3tools/client-runtime/providerUpdateRequiredModels";
import { afterEach, expect, it, vi } from "vite-plus/test";

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  TextInput: () => null,
  Pressable: ({
    children,
    accessibilityLabel,
    accessibilityState,
    onPress,
    disabled,
  }: {
    children?: ReactNode;
    accessibilityLabel?: string;
    accessibilityState?: { checked?: boolean };
    onPress?: () => void;
    disabled?: boolean;
  }) => (
    <button
      aria-label={accessibilityLabel}
      aria-checked={accessibilityState?.checked}
      onClick={onPress}
      disabled={disabled}
    >
      {children}
    </button>
  ),
}));
vi.mock("../../components/ui/AppSymbol", () => ({ SymbolView: () => null }));
vi.mock("../../i18n/mobileStrings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../i18n/mobileStrings")>();
  return { ...actual, localizeMobileString: vi.fn(actual.localizeMobileString) };
});

import { localizeMobileString } from "../../i18n/mobileStrings";
import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";
import { ChoiceRowContent, ModelRowContent } from "./ThreadSettingsRows.shared";

afterEach(() => vi.unstubAllGlobals());

it("only localizes client-owned choices and preserves colliding provider text and selection", async () => {
  const actual = await vi.importActual<typeof import("../../i18n/mobileStrings")>(
    "../../i18n/mobileStrings",
  );
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  using screen = {
    container,
    [Symbol.dispose]() {
      act(() => root.unmount());
    },
  };
  for (const locale of ["en", "zh-CN"] as const) {
    vi.mocked(localizeMobileString).mockImplementation((value) =>
      actual.localizeMobileString(value, locale),
    );
    for (const localize of [undefined, false, true]) {
      const onPress = vi.fn();
      act(() =>
        root.render(
          <ChoiceRowContent
            label="Link custom"
            description="Settings"
            {...(localize === undefined ? {} : { localize })}
            selected
            isLast
            onPress={onPress}
          />,
        ),
      );
      const expectedLabel = localize
        ? actual.localizeMobileString("Link custom", locale)
        : "Link custom";
      const expectedDescription = localize
        ? actual.localizeMobileString("Settings", locale)
        : "Settings";
      const choice = screen.container.querySelector("button")!;
      expect(choice.getAttribute("aria-label")).toBe(`${expectedLabel}. ${expectedDescription}`);
      expect(choice.getAttribute("aria-checked")).toBe("true");
      expect(choice.textContent).toBe(`${expectedLabel}${expectedDescription}`);
      act(() => choice.click());
      expect(onPress).toHaveBeenCalledOnce();
    }
  }
});

it.each(["en", "zh-CN"] as const)(
  "keeps real model rows literal and their actions unchanged in %s",
  async (locale) => {
    const actual = await vi.importActual<typeof import("../../i18n/mobileStrings")>(
      "../../i18n/mobileStrings",
    );
    vi.mocked(localizeMobileString).mockImplementation((value) =>
      actual.localizeMobileString(value, locale),
    );
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    const root = createRoot(container);
    using screen = {
      container,
      [Symbol.dispose]() {
        act(() => root.unmount());
      },
    };
    const onPress = vi.fn();
    const onToggleFavorite = vi.fn();
    for (const label of ["Settings", "Open", "Default", "{0} $&"]) {
      const option = {
        key: "provider:stable",
        label,
        subtitle: "Settings",
        providerKey: "provider",
        providerLabel: "Open",
        providerDriver: "codex",
        isDefault: true,
        isLegacy: false,
        capabilities: null,
        selection: { instanceId: ProviderInstanceId.make("provider"), model: "stable-id" },
      };
      const before = structuredClone(option);
      act(() =>
        root.render(
          <ModelRowContent
            option={option}
            selected
            isFirst
            isLast
            isFavorite={false}
            favoritesLoaded
            onToggleFavorite={onToggleFavorite}
            onPress={onPress}
            labelNumberOfLines={1}
          />,
        ),
      );
      const main = screen.container.querySelectorAll("button")[0]!;
      expect(main.getAttribute("aria-label")).toBe(`${label}, Settings`);
      expect(main.textContent).toBe(`${label}${locale === "en" ? "Default" : "默认"}Settings`);
      act(() => main.click());
      expect(option).toEqual(before);
    }
    expect(onPress).toHaveBeenCalledTimes(4);
    expect(onToggleFavorite).not.toHaveBeenCalled();
  },
);

it.each(["en", "zh-CN"] as const)(
  "uses the mobile catalog for provider-update grammar without changing model identity in %s",
  async (locale) => {
    const actual = await vi.importActual<typeof import("../../i18n/mobileStrings")>(
      "../../i18n/mobileStrings",
    );
    vi.mocked(localizeMobileString).mockImplementation(actual.localizeMobileString);
    const names = ["Settings", "Open, and {0} $&", "Unknown"];
    const provider = {
      driver: ProviderDriverKind.make("codex"),
      updateRequiredModels: names.map((name, index) => ({
        name,
        slug: `model-${index}`,
        minVersion: index === 1 ? "1.10.0" : "1.9.0",
      })),
    };
    const result = formatProviderUpdateRequiredNotice(provider, "", (template, values) =>
      formatMobileMessage(template, values, locale),
    );
    expect(result).toBe(
      locale === "en"
        ? "Update the Codex CLI to v1.10.0 or newer to use Settings, Open, and {0} $&, and Unknown."
        : "请将 Codex CLI 更新到 v1.10.0 或更新版本以使用 Settings、Open, and {0} $&和Unknown。",
    );
    expect(provider.updateRequiredModels.map((model) => model.name)).toEqual(names);
  },
);
