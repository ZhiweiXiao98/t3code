import { ProviderInstanceId } from "@t3tools/contracts";
import type { ModelOption } from "../lib/modelOptions";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vite-plus/test";

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  TextInput: () => null,
  Pressable: ({
    children,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    accessibilityLabel?: string;
  }) => <button aria-label={accessibilityLabel}>{children}</button>,
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ScrollView: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock("react-native-reanimated", () => ({
  default: { View: ({ children }: { children?: ReactNode }) => <div>{children}</div> },
  FadeIn: { duration: () => undefined },
  useReducedMotion: () => true,
}));
vi.mock("./ui/useAndroidControlSizing", () => ({
  useAndroidControlSizing: () => ({ scale: 1, smallIconSize: 14 }),
}));
vi.mock("./ui/AppSymbol", () => ({ SymbolView: () => null }));
vi.mock("../i18n/mobileStrings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../i18n/mobileStrings")>();
  return {
    ...actual,
    localizeMobileString: (value: string) => actual.localizeMobileString(value, "zh-CN"),
  };
});

vi.mock("./ProviderIcon", () => ({
  ProviderIcon: () => null,
  ProviderInstanceIcon: () => null,
  providerInstanceNameLabel: (props: { displayName: string; showBadge: boolean }) =>
    props.showBadge ? props.displayName : null,
}));

import { AppText } from "./ui/AppText";
import { ComposerModelControl } from "./ComposerModelControl";
import { ComposerInlineControl } from "./ComposerToolbar";

it("preserves opaque composer labels and accessible names that collide with UI copy", () => {
  for (const name of ["Chat", "Settings", "Auto", "Cancel", "feature/{0}/$&"]) {
    const escaped = name.replaceAll("&", "&amp;");
    expect(
      renderToStaticMarkup(<ComposerInlineControl label={name} localizeLabel={false} />),
    ).toContain(`<button aria-label="${escaped}"><div><span>${escaped}</span>`);
    expect(renderToStaticMarkup(<AppText localize={false}>{name}</AppText>)).toBe(
      `<span>${escaped}</span>`,
    );
  }
  expect(renderToStaticMarkup(<ComposerInlineControl label="Chat" />)).toContain(
    '<button aria-label="聊天"><div><span>聊天</span>',
  );
});

it("localizes the empty model control but preserves named models in its provider suffix", () => {
  const base = {
    selection: null,
    provider: undefined,
    prompt: "",
    surfaceColor: "white",
    onPress: () => {},
  };
  const empty = renderToStaticMarkup(<ComposerModelControl {...base} modelOption={null} />);
  expect(empty).toContain("选择模型");
  expect(empty).toContain("模型与推理设置");
  expect(empty).not.toContain("Choose model");
  for (const name of ["Auto", "Default", "Chat", "feature/{0}/$&"]) {
    const modelOption: ModelOption = {
      key: name,
      label: name,
      shortName: name,
      subtitle: "",
      providerKey: "codex",
      providerLabel: "Codex",
      providerDriver: "codex",
      providerBadge: { displayName: "Settings", showBadge: true },
      isDefault: false,
      isLegacy: false,
      capabilities: null,
      selection: { instanceId: ProviderInstanceId.make("codex"), model: name },
    };
    const markup = renderToStaticMarkup(
      <ComposerModelControl {...base} modelOption={modelOption} />,
    );
    const escaped = name.replaceAll("&", "&amp;");
    expect(markup).toContain(`<span>${escaped}</span>`);
    expect(markup).toContain(`<span>Settings</span>`);
    expect(markup).toContain(`模型与推理设置, ${escaped}, Settings`);
  }
});
