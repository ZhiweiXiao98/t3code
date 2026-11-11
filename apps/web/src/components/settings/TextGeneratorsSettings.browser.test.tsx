import { EnvironmentId, ProviderInstanceId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";

import { render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";

const state = vi.hoisted(() => ({
  update: vi.fn(),
  check: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));
vi.mock("../../hooks/useSettings", async (original) => ({
  ...(await original()),
  useEnvironmentSettings: () => ({
    textGenerators: {},
    providerInstances: {},
    textGenerationModelSelection: { instanceId: "existing", model: "model/id" },
    sourceControlWriterModelSelection: null,
    speechPostProcessingModelSelection: null,
  }),
  useUpdateEnvironmentSettings: () => state.update,
}));
vi.mock("../../textGenerators", async (original) => ({
  ...(await original()),
  checkTextGeneratorConfig: state.check,
  rereadTextGeneratorModels: () => undefined,
  useTextGenerationTargets: () => ({ entries: [], providers: [] }),
}));
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

import { TextGeneratorsSettings } from "./TextGeneratorsSettings";

function setup() {
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
