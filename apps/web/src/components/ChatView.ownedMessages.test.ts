import {
  EnvironmentId,
  MessageId,
  ProviderInstanceId,
  type ChatFileAttachment,
} from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import {
  getStartedThreadModelChangeBlockReason,
  makeModelDisabledReason,
  resolveFileAttachmentUrl,
  prepareRevertedMessageAttachments,
} from "./ChatView.logic";

it("keeps provider-switch eligibility identical while localizing the owned denial and tooltip", () => {
  const currentModelSelection = {
    instanceId: ProviderInstanceId.make("provider-a"),
    model: "literal/$&",
  };
  const nextModelSelection = {
    instanceId: ProviderInstanceId.make("provider-b"),
    model: "other/$&",
  };
  const input = { hasStartedSession: true, currentModelSelection, nextModelSelection };
  const english = getStartedThreadModelChangeBlockReason(input);
  expect(english?.title).toBe("Start a new chat to switch providers");
  expect(getStartedThreadModelChangeBlockReason({ ...input, locale: "zh-CN" })?.description).toBe(
    "此会话启动后不支持切换提供商。",
  );
  expect(getStartedThreadModelChangeBlockReason({ ...input, locale: "en" })).toEqual(english);
  expect(
    getStartedThreadModelChangeBlockReason({
      ...input,
      locale: "zh-CN",
      supportsProviderSwitchingViaHandoff: true,
    }),
  ).toBeNull();
  expect(
    getStartedThreadModelChangeBlockReason({ ...input, locale: "zh-CN", hasStartedSession: false }),
  ).toBeNull();
  expect(
    makeModelDisabledReason({ ...input, locale: "zh-CN" })(
      nextModelSelection.instanceId,
      nextModelSelection.model,
    ),
  ).toBe("此会话启动后不支持切换提供商。请新建会话以使用此模型。");
  expect(input.nextModelSelection).toEqual(nextModelSelection);
});

it("translates only owned attachment failures at their source and keeps external same-text errors intact", async () => {
  const attachment = {
    type: "file",
    id: "opaque",
    name: "{name}/$&:\n.txt",
    mimeType: "text/plain",
    sizeBytes: 1,
  } satisfies ChatFileAttachment;
  let locale: "en" | "zh-CN" = "en";
  const input = {
    attachment,
    environmentId: EnvironmentId.make("env"),
    httpBaseUrl: "https://example.test",
    readLocale: () => locale,
    createAssetUrl: vi.fn(async () =>
      AsyncResult.success({ relativeUrl: "http://[", expiresAt: 1 }),
    ),
  };
  await expect(resolveFileAttachmentUrl(input)).rejects.toThrow(
    "The environment returned an invalid attachment URL.",
  );
  locale = "zh-CN";
  await expect(resolveFileAttachmentUrl(input)).rejects.toThrow("环境返回了无效的附件 URL。");
  const external = new Error("The environment returned an invalid attachment URL.");
  await expect(
    resolveFileAttachmentUrl({
      ...input,
      createAssetUrl: async () => {
        throw external;
      },
    }),
  ).rejects.toBe(external);
  expect(external.message).toBe("The environment returned an invalid attachment URL.");
  locale = "en";
  await expect(resolveFileAttachmentUrl(input)).rejects.toThrow(external.message);
  expect(input.createAssetUrl).toHaveBeenCalledWith({
    environmentId: input.environmentId,
    input: {
      resource: {
        _tag: "attachment",
        attachmentId: attachment.id,
        fileName: attachment.name,
        mimeType: attachment.mimeType,
      },
    },
  });
});

it("preserves attachment names and fetch arguments in a localized restore failure", async () => {
  const name = "{name}/$&:\n.txt";
  const attachment = {
    type: "file",
    id: "opaque",
    name,
    mimeType: "text/plain",
    sizeBytes: 1,
  } satisfies ChatFileAttachment;
  const message = {
    id: MessageId.make("attachment-message"),
    role: "user",
    text: "literal/{text}/$&",
    runId: null,
    streaming: false,
    createdAt: "2026-11-13T00:00:00.000Z",
    updatedAt: "2026-11-13T00:00:00.000Z",
    attachments: [attachment],
  } satisfies Parameters<typeof prepareRevertedMessageAttachments>[0]["message"];
  const fetch = vi.fn(async () => new Response("server-owned or external body", { status: 404 }));
  vi.stubGlobal("fetch", fetch);
  try {
    const restore = (locale: "en" | "zh-CN") =>
      prepareRevertedMessageAttachments({
        message,
        environmentId: EnvironmentId.make("env"),
        httpBaseUrl: "https://example.test",
        readLocale: () => locale,
        createAssetUrl: async () =>
          AsyncResult.success({ relativeUrl: "/api/assets/opaque", expiresAt: 1 }),
      });
    await expect(restore("zh-CN")).rejects.toThrow(`无法恢复附件：${name}`);
    await expect(restore("en")).rejects.toThrow(`Could not restore attachment: ${name}`);
    expect(fetch).toHaveBeenCalledWith("https://example.test/api/assets/opaque", {
      signal: expect.any(AbortSignal),
    });
    expect(message.attachments?.[0]?.name).toBe(name);
  } finally {
    vi.unstubAllGlobals();
  }
});
