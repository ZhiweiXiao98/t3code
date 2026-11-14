import type { ReactNode } from "react";
import { ProviderInstanceId } from "@t3tools/contracts";
import { createModelCapabilities } from "@t3tools/shared/model";
import { expect, it, vi } from "vite-plus/test";
import { render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { MAX_CUSTOM_MODEL_LENGTH } from "../../modelSelection";
import { ProviderModelsSection } from "./ProviderModelsSection";
import { CustomModelEditor } from "./CustomModelEditor";

function localized(locale: "en" | "zh-CN", children: ReactNode) {
  return (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => undefined,
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      {children}
    </WebI18nContext>
  );
}

it.each([
  ["", "Enter a model slug.", "请输入模型标识。"],
  ["built-in", "That model is already built in.", "该模型已内置。"],
  [
    "x".repeat(MAX_CUSTOM_MODEL_LENGTH + 1),
    `Model slugs must be ${MAX_CUSTOM_MODEL_LENGTH} characters or less.`,
    `模型标识不能超过 ${MAX_CUSTOM_MODEL_LENGTH} 个字符。`,
  ],
  ["saved", "That custom model is already saved.", "该自定义模型已保存。"],
])("keeps cached model validation current for %s", async (input, english, chinese) => {
  const onChange = vi.fn();
  const surface = (locale: "en" | "zh-CN") =>
    localized(
      locale,
      <ProviderModelsSection
        instanceId={ProviderInstanceId.make("test")}
        driverKind={null}
        models={[{ slug: "built-in", name: "Built in", isCustom: false, capabilities: null }]}
        customModels={[{ slug: "saved", name: "saved", capabilities: null }]}
        canManageCustomModels
        hiddenModels={[]}
        favoriteModels={[]}
        modelOrder={[]}
        onChange={onChange}
        onHiddenModelsChange={() => {}}
        onFavoriteModelsChange={() => {}}
        onToggleFavorite={() => {}}
        onModelOrderChange={() => {}}
      />,
    );
  await using screen = await render(surface("en"));
  await screen.getByRole("button", { name: "Add custom model" }).click();
  const field = screen.getByPlaceholder("model-slug");
  await field.fill(input);
  await screen.getByRole("button", { name: "Add", exact: true }).click();
  await expect.element(screen.getByText(english, { exact: true })).toBeVisible();
  const error = screen.getByText(english, { exact: true }).element();
  await screen.rerender(surface("zh-CN"));
  await expect.poll(() => error.textContent).toBe(chinese);
  await screen.rerender(surface("en"));
  await expect.poll(() => error.textContent).toBe(english);
  await expect.element(field).toHaveValue(input);
  expect(onChange).not.toHaveBeenCalled();
});

it("localizes a cached owned option problem without editing literal IDs or saving", async () => {
  const onSave = vi.fn();
  const id = "literal $& {0} 中文";
  const value = "opaque $1 {value}";
  const surface = (locale: "en" | "zh-CN") =>
    localized(
      locale,
      <CustomModelEditor
        instanceId="test"
        driverKind={null}
        entry={{
          slug: "custom",
          name: "Custom",
          capabilities: createModelCapabilities({
            optionDescriptors: [
              { id, label: "", type: "select", options: [{ id: value, label: value }] },
            ],
          }),
        }}
        builtInModels={[]}
        onSave={onSave}
        onCancel={() => {}}
      />,
    );
  await using screen = await render(surface("en"));
  await screen.getByRole("button", { name: "Save", exact: true }).click();
  const english = "Option 1 needs a label.";
  await expect.element(screen.getByText(english, { exact: true })).toBeVisible();
  const error = screen.getByText(english, { exact: true }).element();
  await screen.rerender(surface("zh-CN"));
  await expect.poll(() => error.textContent).toBe("选项 1 需要填写名称。");
  await screen.rerender(surface("en"));
  await expect.poll(() => error.textContent).toBe(english);
  await expect.element(screen.getByRole("textbox", { name: "Option id" })).toHaveValue(id);
  await expect.element(screen.getByRole("textbox", { name: "Choice value" })).toHaveValue(value);
  expect(onSave).not.toHaveBeenCalled();
});

it.each(["id", "choice"] as const)(
  "preserves opaque duplicate %s in cached validation",
  async (kind) => {
    const onSave = vi.fn();
    const literal = "opaque $& {0} 中文";
    const option = {
      id: literal,
      label: "Literal",
      type: "select" as const,
      options: [
        { id: literal, label: "First" },
        ...(kind === "choice" ? [{ id: literal, label: "Second" }] : []),
      ],
    };
    const surface = (locale: "en" | "zh-CN") =>
      localized(
        locale,
        <CustomModelEditor
          instanceId="duplicates"
          driverKind={null}
          entry={{
            slug: "custom",
            name: "Custom",
            capabilities: createModelCapabilities({
              optionDescriptors: kind === "id" ? [option, option] : [option],
            }),
          }}
          builtInModels={[]}
          onSave={onSave}
          onCancel={() => {}}
        />,
      );
    await using screen = await render(surface("en"));
    await screen.getByRole("button", { name: "Save", exact: true }).click();
    const position = kind === "id" ? 2 : 1;
    const english = `Option ${position}: ${kind} "${literal}" is used twice.`;
    await expect.element(screen.getByText(english, { exact: true })).toBeVisible();
    const error = screen.getByText(english, { exact: true }).element();
    await screen.rerender(surface("zh-CN"));
    await expect
      .poll(() => error.textContent)
      .toBe(`选项 ${position}：${kind === "id" ? "标识" : "选项值"}“${literal}”重复使用。`);
    await screen.rerender(surface("en"));
    await expect.poll(() => error.textContent).toBe(english);
    expect(onSave).not.toHaveBeenCalled();
  },
);
