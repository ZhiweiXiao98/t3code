import "~/index.css";
import type { EnvironmentCatalogState } from "@t3tools/client-runtime/state/connections";
import { RegistryContext } from "@effect/atom-react";
import { AsyncResult, AtomRegistry } from "effect/reactivity";
import { primaryEnvironmentIdAtom } from "~/state/primaryEnvironment";
import { EnvironmentId, ProviderInstanceId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";

import { act, render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";

const state = vi.hoisted(() => ({
  update: vi.fn(),
  modelsMode: false,
  locale: "en" as "en" | "zh-CN",
  refresh: vi.fn(),
  check: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));
vi.mock("../../hooks/useSettings", async (original) => ({
  ...(await original()),
  useEnvironmentSettings: () => ({
    textGenerators: state.modelsMode
      ? {
          fixtureGenerator: {
            kind: "openaiCompatible",
            baseUrl: "https://fixture.invalid/v1",
            apiKey: "fixture-not-a-secret",
            label: "Literal $& {name}",
            enabled: true,
          },
        }
      : {},
    providerInstances: {},
    textGenerationModelSelection: { instanceId: "existing", model: "model/id" },
    sourceControlWriterModelSelection: null,
    speechPostProcessingModelSelection: null,
  }),
  useUpdateEnvironmentSettings: () => state.update,
}));
vi.mock("../../textGenerators", async (original) => {
  const actual = await original<typeof import("../../textGenerators")>();
  return {
    ...actual,
    refreshTextGeneratorModels: (...args: Parameters<typeof actual.refreshTextGeneratorModels>) =>
      state.modelsMode ? state.refresh(...args) : actual.refreshTextGeneratorModels(...args),
    useTextGeneratorModels: (...args: Parameters<typeof actual.useTextGeneratorModels>) =>
      state.modelsMode
        ? AsyncResult.success([{ id: "literal/model", name: "Literal model" }])
        : actual.useTextGeneratorModels(...args),
    checkTextGeneratorConfig: state.check,
    rereadTextGeneratorModels: () => undefined,
    useTextGenerationTargets: () => ({ entries: [], providers: [] }),
  };
});
vi.mock("~/connection/catalog", async (original) => {
  const actual = await original<typeof import("~/connection/catalog")>();
  const { Atom } = await import("effect/reactivity");
  return {
    ...actual,
    environmentCatalog: {
      ...actual.environmentCatalog,
      catalogValueAtom: Atom.make<EnvironmentCatalogState>({ isReady: true, entries: new Map() }),
    },
  };
});
vi.mock("~/i18n/readWebI18n", async (original) => {
  const actual = await original<typeof import("~/i18n/readWebI18n")>();
  return {
    ...actual,
    readWebI18n: () => {
      if (!state.modelsMode) return actual.readWebI18n();
      const locale = state.locale;
      return {
        locale,
        t: (
          key: Parameters<typeof translateWebMessage>[1],
          values: Parameters<typeof translateWebMessage>[2],
        ) => translateWebMessage(locale, key, values),
      };
    },
  };
});
vi.mock("../chat/ProviderModelPicker", () => ({ ProviderModelPicker: () => null }));
vi.mock("./SecretSourceInput", () => ({
  useSecretSources: () => [],
  SecretSourceInput: ({
    id,
    value,
    onChange,
    "aria-label": label,
  }: {
    id: string;
    value: string;
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    "aria-label": string;
  }) => <input id={id} value={value} onChange={onChange} aria-label={label} />,
}));

import { toastManager } from "../ui/toast";
import { TextGeneratorsSettings } from "./TextGeneratorsSettings";

function setup() {
  state.modelsMode = false;
  state.update.mockReset();
  state.check
    .mockReset()
    .mockResolvedValue({ models: [{ id: "model/id", name: "Original Model" }] });
}

function settings(locale: ResolvedAppLocale) {
  return (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => undefined,
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <TextGeneratorsSettings
        environmentId={EnvironmentId.make("fixture")}
        environmentLabel="Host {name}"
        providers={[]}
        readOnly={false}
      />
    </WebI18nContext>
  );
}

it.each([
  ["en", "Add generator", "Name (optional)", "API key", "Connect", "Back", "Cancel", "Done"],
  ["zh-CN", "添加生成器", "名称（可选）", "API 密钥", "连接", "返回", "取消", "完成"],
] as const)(
  "preserves inputs on error/back and uses the same generator when saving again in %s",
  async (locale, add, name, key, connect, back, cancel, done) => {
    setup();
    await using screen = await render(settings(locale));
    await userEvent.click(screen.getByRole("button", { name: add }));
    const dialog = page.getByRole("dialog");
    await userEvent.fill(dialog.getByLabelText(key, { exact: true }), "fixture-not-a-secret");
    await userEvent.fill(dialog.getByLabelText(name), "My generator {name}");
    state.check.mockResolvedValueOnce({ error: "MODEL_LOOKUP_ERROR {original}" });
    await userEvent.click(dialog.getByRole("button", { name: connect, exact: true }));
    await expect
      .element(dialog.getByRole("alert"))
      .toHaveTextContent("MODEL_LOOKUP_ERROR {original}");
    await expect.element(dialog.getByLabelText(name)).toHaveValue("My generator {name}");
    expect(state.update).not.toHaveBeenCalled();
    await userEvent.click(dialog.getByRole("button", { name: connect, exact: true }));
    await expect.element(dialog.getByRole("button", { name: done, exact: true })).toBeVisible();
    const savedId = ProviderInstanceId.make("openai");
    expect(state.update.mock.calls[0]?.[0]).toEqual({
      textGenerators: {
        [savedId]: {
          kind: "openaiCompatible",
          baseUrl: "https://api.openai.com/v1",
          apiKey: "fixture-not-a-secret",
          label: "My generator {name}",
          enabled: true,
        },
      },
    });
    await userEvent.click(dialog.getByRole("button", { name: back, exact: true }));
    await expect.element(dialog.getByLabelText(name)).toHaveValue("My generator {name}");
    await userEvent.fill(dialog.getByLabelText(name), "Changed {name}");
    await userEvent.click(dialog.getByRole("button", { name: connect, exact: true }));
    await expect.element(dialog.getByRole("button", { name: done, exact: true })).toBeVisible();
    expect(Object.keys(state.update.mock.calls[1]?.[0].textGenerators)).toEqual([savedId]);
    expect(state.update.mock.calls[1]?.[0].textGenerators[savedId].label).toBe("Changed {name}");
    await userEvent.click(dialog.getByRole("button", { name: done, exact: true }));
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: add }));
    await expect.element(page.getByRole("dialog").getByLabelText(name)).toHaveValue("");
    await userEvent.click(
      page.getByRole("dialog").getByRole("button", { name: cancel, exact: true }),
    );
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    expect(state.update).toHaveBeenCalledTimes(2);
  },
);

it.each(["raw", "empty", "success"] as const)(
  "uses settlement locale for text generator model refresh: %s",
  async (kind) => {
    setup();
    state.modelsMode = true;
    state.locale = "en";
    state.refresh.mockReset();
    using stack = new DisposableStack();
    const registry = stack.adopt(AtomRegistry.make(), (value) => value.dispose());
    expect(registry.get(primaryEnvironmentIdAtom)).toBeNull();
    stack.defer(() => {
      state.modelsMode = false;
      state.locale = "en";
    });
    using toast = vi.spyOn(toastManager, "add").mockImplementation(() => "fixture-toast");
    let finish!: (result: { error: string } | { count: number }) => void;
    const pending = new Promise<{ error: string } | { count: number }>((resolve) => {
      finish = resolve;
    });
    state.refresh.mockReturnValue(pending);
    const surface = (locale: ResolvedAppLocale) => (
      <RegistryContext.Provider value={registry}>{settings(locale)}</RegistryContext.Provider>
    );
    await using screen = await render(surface("en"));
    await using _drain = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          finish({ count: 1 });
          await pending;
        });
      },
    };
    await screen
      .getByRole("button", { name: "More actions for Literal $& {name}", exact: true })
      .click();
    await page.getByRole("menuitem", { name: "Show models", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect.element(dialog.getByText("Literal model", { exact: true })).toBeVisible();
    const refresh = dialog.getByRole("button", { name: "Refresh", exact: true });
    await refresh.click();
    expect(state.refresh).toHaveBeenCalledExactlyOnceWith(
      EnvironmentId.make("fixture"),
      ProviderInstanceId.make("fixtureGenerator"),
    );
    await expect.element(refresh).toBeDisabled();
    await expect.element(refresh).toHaveAttribute("aria-busy", "true");
    await act(() => {
      refresh.element().dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    });
    expect(state.refresh).toHaveBeenCalledTimes(1);
    expect(toast).not.toHaveBeenCalled();
    state.locale = "zh-CN";
    await screen.rerender(surface("zh-CN"));
    await act(async () => {
      finish(
        kind === "success" ? { count: 1 } : { error: kind === "raw" ? "Literal $& {error}" : "" },
      );
      await pending;
    });
    if (kind === "success") expect(toast).not.toHaveBeenCalled();
    else
      expect(toast).toHaveBeenCalledExactlyOnceWith({
        type: "error",
        title: "无法加载 Literal $& {name} 的模型",
        description: kind === "raw" ? "Literal $& {error}" : "",
      });
    const settled = dialog.getByRole("button", { name: "刷新", exact: true });
    await expect.element(settled).toBeEnabled();
    await expect.element(settled).toHaveAttribute("aria-busy", "false");
    await expect.element(dialog.getByText("Literal model", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "完成", exact: true }).click();
    await expect.element(dialog).not.toBeInTheDocument();
    expect(state.update).not.toHaveBeenCalled();
    expect(state.check).not.toHaveBeenCalled();
    expect(state.refresh).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledTimes(kind === "success" ? 0 : 1);
  },
);
