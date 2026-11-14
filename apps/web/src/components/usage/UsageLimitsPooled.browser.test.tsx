import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { CHATGPT_USAGE_URL } from "@t3tools/shared/usageLimits";
import { describe, expect, it } from "vite-plus/test";

import { render } from "../../../test/render";
import { UsageLimitsPooled } from "./UsageLimitsPooled";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";

const checkedAt = "2026-10-25T16:00:00.000Z";

function managedChatGpt(instanceId: string, displayName: string): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make(instanceId),
    driver: ProviderDriverKind.make("codex"),
    displayName,
    enabled: true,
    installed: true,
    version: "0.164.0",
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt,
    models: [],
    slashCommands: [],
    skills: [],
    usageLimits: {
      checkedAt,
      windows: [],
      unavailable: { reason: "unsupported", message: "Track usage in ChatGPT." },
      externalUsage: { label: "ChatGPT usage", url: CHATGPT_USAGE_URL },
    },
  };
}

describe("UsageLimitsPooled ChatGPT usage card", () => {
  it("updates owned pooled labels on locale changes while preserving untagged collisions", async () => {
    const scoped = "Settings/$&/{0}";
    const provider = {
      ...managedChatGpt("claude", "Settings"),
      driver: ProviderDriverKind.make("claudeAgent"),
      usageLimits: {
        checkedAt,
        windows: [
          {
            id: "owned",
            kind: "session" as const,
            label: "Session",
            labelDescriptor: { code: "session" as const },
            usedPercent: 40,
          },
          { id: "raw", kind: "session" as const, label: "Session", usedPercent: 40 },
          {
            id: "scoped",
            kind: "weekly" as const,
            label: `Weekly · ${scoped}`,
            labelDescriptor: { code: "weeklyScoped" as const, displayName: scoped },
            usedPercent: 40,
          },
        ],
      },
    };
    const presentations = new Map([
      [
        EnvironmentId.make("desk"),
        {
          entry: { target: { label: "Settings" } },
          serverConfig: { providers: [provider] },
        },
      ],
    ]);
    const surface = (locale: "en" | "zh-CN") => (
      <WebI18nContext
        value={{
          locale,
          appLocale: locale,
          setAppLocale: () => undefined,
          t: (key, values) => translateWebMessage(locale, key, values),
        }}
      >
        <UsageLimitsPooled presentations={presentations} now={Date.parse(checkedAt)} />
      </WebI18nContext>
    );
    await using screen = await render(surface("en"));
    const sessionLabels = screen.getByText("Session", { exact: true }).elements();
    expect(sessionLabels).toHaveLength(2);
    const scopedLabel = screen.getByText(`Weekly · ${scoped}`, { exact: true }).element();
    await screen.rerender(surface("zh-CN"));
    await expect
      .poll(() => sessionLabels.map((element) => element.textContent))
      .toEqual(["会话", "Session"]);
    await expect.poll(() => scopedLabel.textContent).toBe(`每周 · ${scoped}`);
    await screen.rerender(surface("en"));
    await expect
      .poll(() => sessionLabels.map((element) => element.textContent))
      .toEqual(["Session", "Session"]);
    await expect.poll(() => scopedLabel.textContent).toBe(`Weekly · ${scoped}`);
  });

  it("updates owned unavailable notices without translating identical raw messages", async () => {
    const message = "Codex CLI is not authenticated. Run `codex login` and try again.";
    const providers = ["Owned/$&/{0}", "Raw/$&/{0}"].map((displayName, index) => ({
      ...managedChatGpt(`account-${index}`, displayName),
      usageLimits: {
        checkedAt,
        windows: [],
        unavailable: {
          reason: "probeFailed" as const,
          message,
          ...(index === 0
            ? { messageDescriptor: { code: "codexUsageLoginRequired" as const } }
            : {}),
        },
      },
    }));
    const presentations = new Map([
      [
        EnvironmentId.make("desk"),
        {
          entry: { target: { label: "Settings/$&/{0}" } },
          serverConfig: { providers },
        },
      ],
    ]);
    const surface = (locale: "en" | "zh-CN") => (
      <WebI18nContext
        value={{
          locale,
          appLocale: locale,
          setAppLocale: () => undefined,
          t: (key, values) => translateWebMessage(locale, key, values),
        }}
      >
        <UsageLimitsPooled presentations={presentations} now={Date.parse(checkedAt)} />
      </WebI18nContext>
    );
    await using screen = await render(surface("en"));
    const noticeContainer = screen
      .getByText(`Owned/$&/{0}: ${message}`, { exact: true })
      .element().parentElement!;
    await screen.rerender(surface("zh-CN"));
    await expect
      .poll(() => noticeContainer.textContent)
      .toContain("Owned/$&/{0}: Codex CLI 尚未登录。请运行 `codex login` 后重试。");
    await expect.element(screen.getByText(`Raw/$&/{0}: ${message}`, { exact: true })).toBeVisible();
    await screen.rerender(surface("en"));
    await expect.poll(() => noticeContainer.textContent).toContain(`Owned/$&/{0}: ${message}`);
    await expect.element(screen.getByText(`Raw/$&/{0}: ${message}`, { exact: true })).toBeVisible();
  });

  it("names the managed connections it covers", async () => {
    const presentations = new Map([
      [
        EnvironmentId.make("desk"),
        {
          entry: { target: { label: "Desk" } },
          serverConfig: {
            providers: [
              managedChatGpt("chatgpt_work", "ChatGPT Work"),
              managedChatGpt("chatgpt_personal", "ChatGPT Personal"),
            ],
          },
        },
      ],
    ]);
    await using screen = await render(
      <UsageLimitsPooled presentations={presentations} now={Date.parse(checkedAt)} />,
    );

    await expect
      .element(screen.getByText("ChatGPT Work on Desk, ChatGPT Personal on Desk"))
      .toBeVisible();
    await expect
      .element(screen.getByText("View usage in ChatGPT with your connected account."))
      .toBeVisible();
  });
});
