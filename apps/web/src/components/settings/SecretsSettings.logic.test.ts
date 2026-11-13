import { translateWebSource } from "~/i18n/messages";
import { ServerSettings } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { expect, it } from "vite-plus/test";

import { secretProviderUses } from "./SecretsSettings.logic";

const personal = (reference: string) => ({ provider: "personal", reference });
const work = { provider: "work", reference: "op://Work/token" };

const settings = Schema.decodeSync(ServerSettings)({
  providerInstances: {
    antigravity_work: {
      driver: "antigravity",
      displayName: "Antigravity Work",
      environment: [
        { name: "API_TOKEN", value: "", secret: personal("op://a/env") },
        { name: "OTHER_TOKEN", value: "", secret: work },
      ],
    },
    codex_plain: {
      driver: "codex",
      environment: [{ name: "CODEX_TOKEN", value: "", secret: personal("op://c/env") }],
    },
  },
  sourceControlHosts: {
    github: { tokens: { "github.com": personal("op://gh"), "ghe.acme.test": work } },
  },
  usageLimitSources: {
    hub: { kind: "cliproxy", url: "https://hub.test", managementKey: personal("op://hub") },
  },
  easDeviceHosts: [
    { kind: "eas", id: "eas", label: "EAS Simulator", accessToken: personal("op://expo") },
  ],
  simlockDeviceHosts: [
    {
      kind: "simlock",
      id: "pool",
      label: "Simlock Pool",
      gatewayUrl: "https://simlock.test",
      agentToken: personal("op://simlock"),
    },
  ],
  cloudSpeechCredentials: { openai: personal("op://voice"), xai: "" },
});

it.each([
  [
    "personal",
    [
      "Antigravity Work · API_TOKEN",
      "Codex · CODEX_TOKEN",
      "GitHub · github.com",
      "https://hub.test · Management Key",
      "EAS Simulator · Access Token",
      "Simlock Pool · Agent Token",
      "Voice · OpenAI",
    ],
  ],
  ["work", ["Antigravity Work · OTHER_TOKEN", "GitHub · ghe.acme.test"]],
  ["unused", []],
])("lists what reads from secret provider %s", (providerId, uses) => {
  expect(secretProviderUses(settings, providerId).map((use) => use.label)).toEqual(uses);
});

it("formats owned secret-use labels without translating owner, variable, host or reference values", () => {
  const localized = secretProviderUses(settings, "personal", (source) =>
    translateWebSource("zh-CN", source),
  );
  const original = secretProviderUses(settings, "personal");
  expect(localized.map(({ id }) => id)).toEqual(original.map(({ id }) => id));
  expect(localized.map(({ label }) => label)).toEqual([
    "Antigravity Work · API_TOKEN",
    "Codex · CODEX_TOKEN",
    "GitHub · github.com",
    "https://hub.test · 管理密钥",
    "EAS Simulator · 访问令牌",
    "Simlock Pool · 智能体令牌",
    "语音 · OpenAI",
  ]);
  expect(
    secretProviderUses(settings, "work", (source) => translateWebSource("zh-CN", source)),
  ).toEqual(secretProviderUses(settings, "work"));
});
