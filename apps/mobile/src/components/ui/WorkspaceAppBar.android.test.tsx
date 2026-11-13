// @effect-diagnostics nodeBuiltinImport:off - Native asset requires use Node's module cache outside Vitest's ESM mocks.
import * as NodeModule from "node:module";
import type { MenuAction } from "@react-native-menu/menu";
import { act, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

const fixture = vi.hoisted(() => ({ locale: "en" as "en" | "zh-CN" }));

vi.mock("../../i18n/mobileStrings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../i18n/mobileStrings")>();
  return {
    ...actual,
    localizeMobileString: (value: string) => actual.localizeMobileString(value, fixture.locale),
  };
});
vi.mock("@expo/ui/jetpack-compose", () => {
  const Slot = (props: { readonly children?: ReactNode }) => <div>{props.children}</div>;
  return {
    Box: Slot,
    RNHostView: Slot,
    Icon: (props: { readonly contentDescription?: string }) => (
      <span role="img" aria-label={props.contentDescription} />
    ),
    IconButton: (props: {
      readonly children?: ReactNode;
      readonly enabled: boolean;
      readonly onClick?: () => void;
    }) => (
      <button disabled={!props.enabled} onClick={props.onClick}>
        {props.children}
      </button>
    ),
  };
});
vi.mock("@expo/ui/jetpack-compose/modifiers", () => ({ size: () => ({}) }));
vi.mock("react-native", () => ({
  View: (props: { readonly children?: ReactNode }) => <div>{props.children}</div>,
  Pressable: (props: { readonly accessibilityLabel?: string; readonly onPress?: () => void }) => (
    <button aria-label={props.accessibilityLabel} onClick={props.onPress} />
  ),
}));
vi.mock("./NativeAppBar.android", () => ({
  NativeAppBar: (props: { readonly title: ReactNode; readonly nativeActions?: ReactNode }) => (
    <div>
      {props.title}
      {props.nativeActions}
    </div>
  ),
}));
vi.mock("./AppText", async () => {
  const { localizeMobileString } = await import("../../i18n/mobileStrings");
  return {
    AppText: (props: { readonly children?: ReactNode; readonly localize?: boolean }) => (
      <span>
        {props.localize !== false && typeof props.children === "string"
          ? localizeMobileString(props.children)
          : props.children}
      </span>
    ),
  };
});
vi.mock("./useControlTheme", () => ({ useControlTheme: () => ({ colors: {} }) }));
vi.mock("./useToolbarLayout", () => ({
  useToolbarLayout: () => ({ height: 48, paddingTop: 0, paddingBottom: 0 }),
}));
vi.mock("./AndroidScreenHeader.android", async () => {
  const { localizeMobileString } = await import("../../i18n/mobileStrings");
  return {
    AndroidHeaderIconButton: (props: {
      readonly accessibilityLabel: string;
      readonly onPress?: () => void;
    }) => (
      <button aria-label={localizeMobileString(props.accessibilityLabel)} onClick={props.onPress} />
    ),
  };
});
vi.mock("./AndroidAnchoredMenu.android", () => ({
  AndroidAnchoredMenu: (props: {
    readonly children: (open: () => void) => ReactNode;
    readonly actions: readonly MenuAction[];
    readonly onPressAction: (event: { nativeEvent: { event: string } }) => void;
  }) => {
    const [open, setOpen] = useState(false);
    return (
      <div>
        {props.children(() => setOpen(true))}
        {open
          ? props.actions.map((action) => (
              <button
                key={action.id}
                data-menu-action={action.id}
                disabled={action.attributes?.disabled}
                onClick={() => {
                  setOpen(false);
                  props.onPressAction({ nativeEvent: { event: action.id! } });
                }}
              >
                {action.title}
              </button>
            ))
          : null}
      </div>
    );
  },
}));

it("retains workspace search and filter interactions when native accessibility labels are localized", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const require = NodeModule.createRequire(import.meta.url);
  const assets = ["search.xml", "filter.xml", "filter-filled.xml"].map((name) => {
    const path = require.resolve(`../../../assets/icons/${name}`);
    const previous = require.cache[path];
    const asset = new NodeModule.Module(path);
    asset.filename = path;
    asset.exports = 1;
    asset.loaded = true;
    require.cache[path] = asset;
    return { path, previous };
  });
  try {
    const { WorkspaceAppBar, WorkspaceAppBarScope } = await import("./WorkspaceAppBar.android");
    for (const locale of ["en", "zh-CN"] as const) {
      fixture.locale = locale;
      const actions = [
        { id: "active", title: "Settings" },
        { id: "disabled", title: "Disabled filter", attributes: { disabled: true } },
      ];
      const original = structuredClone(actions);
      const onSelect = vi.fn();
      function Screen(props: { readonly customLabels?: boolean }) {
        const [searching, setSearching] = useState(false);
        return (
          <WorkspaceAppBarScope>
            <WorkspaceAppBar
              title="Settings"
              localizeTitle={false}
              search={{
                accessibilityLabel: props.customLabels ? "Find my saved threads" : "Search threads",
                active: searching,
                field: <input aria-label="query" defaultValue="Settings" />,
                onOpen: () => setSearching(true),
                onClose: () => setSearching(false),
              }}
              filter={{
                accessibilityLabel: props.customLabels ? "My custom filters" : "Filter threads",
                customized: true,
                actions,
                onSelect,
              }}
            />
          </WorkspaceAppBarScope>
        );
      }
      const container = document.createElement("div");
      document.body.append(container);
      const root = createRoot(container);
      const byLabel = (label: string) =>
        container.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;
      const select = () => {
        const disabled = container.querySelector<HTMLButtonElement>(
          '[data-menu-action="disabled"]',
        )!;
        expect(disabled.disabled).toBe(true);
        act(() => disabled.click());
        act(() =>
          container.querySelector<HTMLButtonElement>('[data-menu-action="active"]')!.click(),
        );
      };
      try {
        act(() => root.render(<Screen />));
        const searchLabel = locale === "zh-CN" ? "搜索任务" : "Search threads";
        const filterLabel = locale === "zh-CN" ? "筛选任务" : "Filter threads";
        const closeLabel = locale === "zh-CN" ? "关闭搜索" : "Close search";
        expect(container.textContent).toContain("Settings");
        act(() => byLabel(filterLabel).click());
        select();
        expect(onSelect.mock.calls).toEqual([["active"]]);
        expect(container.querySelector("[data-menu-action]")).toBeNull();
        act(() => byLabel(searchLabel).closest("button")!.click());
        expect(container.querySelector<HTMLInputElement>("input")?.value).toBe("Settings");
        act(() => byLabel(filterLabel).click());
        select();
        expect(onSelect.mock.calls).toEqual([["active"], ["active"]]);
        act(() => byLabel(closeLabel).click());
        expect(container.querySelector("input")).toBeNull();
        act(() => root.render(<Screen customLabels />));
        expect(byLabel("Find my saved threads")).not.toBeNull();
        act(() => byLabel("My custom filters").click());
        select();
        expect(onSelect.mock.calls).toEqual([["active"], ["active"], ["active"]]);
        expect(actions).toEqual(original);
      } finally {
        act(() => root.unmount());
        container.remove();
      }
    }
  } finally {
    for (const { path, previous } of assets) {
      if (previous) require.cache[path] = previous;
      else delete require.cache[path];
    }
    vi.unstubAllGlobals();
  }
});
