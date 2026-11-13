// @effect-diagnostics nodeBuiltinImport:off - Native asset requires use Node's module cache outside Vitest's ESM mocks.
import * as NodeModule from "node:module";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

const fixture = vi.hoisted(() => ({ locale: "en" as "en" | "zh-CN" }));

vi.mock("@expo/ui/jetpack-compose", () => {
  const Slot = (props: { readonly children?: ReactNode }) => <div>{props.children}</div>;
  const Button = (props: {
    readonly children?: ReactNode;
    readonly enabled?: boolean;
    readonly onClick?: () => void;
  }) => (
    <button disabled={props.enabled === false} onClick={props.onClick}>
      {props.children}
    </button>
  );
  return {
    Box: Slot,
    Column: Slot,
    Row: Slot,
    RNHostView: Slot,
    Text: Slot,
    Icon: () => null,
    LoadingIndicator: () => null,
    SplitButtonLayout: Object.assign(Slot, { LeadingButton: Slot, TrailingButton: Slot }),
    SplitButtonLeadingButton: Button,
    SplitButtonTrailingButton: (props: {
      readonly children?: ReactNode;
      readonly checked: boolean;
      readonly enabled: boolean;
      readonly onCheckedChange: (checked: boolean) => void;
    }) => (
      <div>
        <button
          aria-label="menu"
          disabled={!props.enabled}
          onClick={() => props.onCheckedChange(!props.checked)}
        />
        {props.children}
      </div>
    ),
    DropdownMenu: Object.assign(
      (props: { readonly expanded: boolean; readonly children?: ReactNode }) =>
        props.expanded ? <div>{props.children}</div> : null,
      { Trigger: Slot, Items: Slot },
    ),
    DropdownMenuItem: Object.assign(Button, {
      LeadingIcon: Slot,
      TrailingIcon: Slot,
      Text: Slot,
    }),
  };
});
vi.mock("@expo/ui/jetpack-compose/modifiers", () => ({
  defaultMinSize: () => ({}),
  fillMaxWidth: () => ({}),
  padding: () => ({}),
  rotate: () => ({}),
  semantics: () => ({}),
  size: () => ({}),
  width: () => ({}),
}));
vi.mock("react-native", () => ({ Pressable: "button" }));
vi.mock("./AppSymbol", () => ({ SymbolView: () => null }));
vi.mock("./AppSymbol.android", () => ({
  SymbolView: () => null,
  isAppSymbolName: () => false,
}));
vi.mock("./Button", () => ({ Button: () => null }));
vi.mock("./NativeThemeHost.android", () => ({
  NativeThemeHost: (props: { readonly children?: ReactNode }) => <div>{props.children}</div>,
}));
vi.mock("./useAndroidControlSizing", () => ({
  useAndroidControlSizing: () => ({ scale: 1, iconSize: 16, mediumIconSize: 20, menuWidth: 240 }),
}));
vi.mock("./useControlTheme", () => ({ useControlTheme: () => ({ colors: {} }) }));
vi.mock("../../features/settings/appearance/useScaledTextRole", () => ({
  useScaledTextRole: () => ({}),
}));
vi.mock("../../features/settings/appearance/AppearancePreferencesProvider", () => ({
  useAppearancePreferences: () => ({ appearance: { baseFontSize: 16 }, themeVariables: {} }),
}));
vi.mock("../../lib/appearancePreferences", () => ({ resolveScaledTextRole: () => ({}) }));
vi.mock("../../i18n/localizeMenuActions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../i18n/localizeMenuActions")>();
  return {
    localizeMenuActions: (actions: Parameters<typeof actual.localizeMenuActions>[0]) =>
      actual.localizeMenuActions(actions, fixture.locale),
  };
});

import { SplitButton } from "./SplitButton.android";

it("localizes open menu actions without changing selection ids, disabled actions or literal titles", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const require = NodeModule.createRequire(import.meta.url);
  const assetPath = require.resolve("../../../assets/icons/chevron-down.xml");
  const previousAsset = require.cache[assetPath];
  const asset = new NodeModule.Module(assetPath);
  asset.filename = assetPath;
  asset.exports = 1;
  asset.loaded = true;
  require.cache[assetPath] = asset;
  try {
    for (const locale of ["en", "zh-CN"] as const) {
      fixture.locale = locale;
      const actions = [
        { id: "squash", title: "Squash and merge", state: "on" as const },
        { id: "auto", title: "Enable auto-merge", attributes: { disabled: true } },
        { id: "user", title: "Settings", localize: false },
      ];
      const snapshot = structuredClone(actions);
      const onPressAction = vi.fn();
      const container = document.createElement("div");
      document.body.append(container);
      const root = createRoot(container);
      try {
        act(() =>
          root.render(
            <SplitButton
              label="Merge"
              menuTitle="Merge options"
              actions={actions}
              onPress={() => {}}
              onPressAction={onPressAction}
            />,
          ),
        );
        const open = () =>
          act(() =>
            container.querySelector<HTMLButtonElement>('button[aria-label="menu"]')!.click(),
          );
        const byLabel = (label: string) =>
          Array.from(container.querySelectorAll("button")).find(
            (button) => button.textContent === label,
          )!;
        open();
        const squash = locale === "zh-CN" ? "压缩并合并" : "Squash and merge";
        const auto = locale === "zh-CN" ? "启用自动合并" : "Enable auto-merge";
        expect(byLabel(auto).disabled).toBe(true);
        act(() => byLabel(auto).click());
        expect(onPressAction).not.toHaveBeenCalled();
        act(() => byLabel(squash).click());
        expect(onPressAction).toHaveBeenCalledExactlyOnceWith("squash");
        expect(container.textContent).not.toContain(squash);
        open();
        act(() => byLabel("Settings").click());
        expect(onPressAction.mock.calls).toEqual([["squash"], ["user"]]);
        expect(actions).toEqual(snapshot);
      } finally {
        act(() => root.unmount());
        container.remove();
      }
    }
  } finally {
    if (previousAsset) require.cache[assetPath] = previousAsset;
    else delete require.cache[assetPath];
    vi.unstubAllGlobals();
  }
});
