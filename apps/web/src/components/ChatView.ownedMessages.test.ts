import {
  EnvironmentId,
  MessageId,
  ProviderInstanceId,
  PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
  type ChatFileAttachment,
  type ChatUnknownAttachment,
  ThreadId,
} from "@t3tools/contracts";
import type { SetStateAction } from "react";
import { AsyncResult } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import {
  getStartedThreadModelChangeBlockReason,
  makeModelDisabledReason,
  resolveFileAttachmentUrl,
  prepareRevertedMessageAttachments,
  readOwnedRewindFailure,
  makeThreadErrorSetter,
  formatLocalThreadError,
  shouldPromoteLocalThreadError,
  type LocalThreadErrorEntry,
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
    const error = await restore("zh-CN").catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) throw new Error("Expected restore failure");
    expect(error.message).toBe(`无法恢复附件：${name}`);
    expect(readOwnedRewindFailure(error)).toEqual({
      error: `Could not restore attachment: ${name}`,
      ownedCode: "rewindRestoreAttachment",
      ownedName: name,
    });
    expect(readOwnedRewindFailure(new Error(error.message))).toBeUndefined();
    expect(
      readOwnedRewindFailure(
        Object.assign(new Error(error.message), {
          ownedCode: "rewindRestoreAttachment",
          ownedName: name,
        }),
      ),
    ).toBeUndefined();
    error.message = "changed";
    expect(readOwnedRewindFailure(error)).toBeUndefined();
    await expect(restore("en")).rejects.toThrow(`Could not restore attachment: ${name}`);
    expect(fetch).toHaveBeenCalledWith("https://example.test/api/assets/opaque", {
      signal: expect.any(AbortSignal),
    });
    expect(message.attachments?.[0]?.name).toBe(name);
  } finally {
    vi.unstubAllGlobals();
  }
});

it("keeps actual unsupported attachment ownership and direct messages separate from raw collisions", async () => {
  const source = "This message has an attachment that cannot be restored.";
  const attachment = {
    type: "future-attachment",
    id: "unknown",
    name: "literal-$&-{file}",
    mimeType: "application/x-future",
    sizeBytes: 1,
  } satisfies ChatUnknownAttachment;
  const ref = {
    environmentId: EnvironmentId.make("unknown-attachment"),
    threadId: ThreadId.make("unknown-attachment"),
  };
  const message = {
    id: MessageId.make("unknown-message"),
    role: "user",
    text: "opaque",
    runId: null,
    streaming: false,
    createdAt: "2026-11-13T00:00:00.000Z",
    updatedAt: "2026-11-13T00:00:00.000Z",
    attachments: [attachment],
  } satisfies Parameters<typeof prepareRevertedMessageAttachments>[0]["message"];
  const createAssetUrl = vi.fn(async () =>
    AsyncResult.success({ relativeUrl: "/opaque", expiresAt: 1 }),
  );
  let entries: Record<string, LocalThreadErrorEntry> = {};
  const set = makeThreadErrorSetter({
    routeThreadRef: ref,
    routeThreadKey: "unknown",
    draftId: null,
    serverThreadRef: ref,
    setLocalServerErrorsByThreadKey: (update) => {
      entries = typeof update === "function" ? update(entries) : update;
    },
    setLocalDraftErrorsByDraftId: () => undefined,
  });
  for (const locale of ["en", "zh-CN", "en"] as const) {
    const readLocale = vi.fn(() => locale);
    const failure = await prepareRevertedMessageAttachments({
      message,
      environmentId: ref.environmentId,
      httpBaseUrl: "https://example.invalid",
      readLocale,
      createAssetUrl,
    }).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error)) throw new Error("Expected attachment error");
    expect(failure.message).toBe(locale === "en" ? source : "此消息包含无法恢复的附件。");
    expect(readLocale).toHaveBeenCalledTimes(1);
    const owned = readOwnedRewindFailure(failure);
    expect(owned).toEqual({ error: source, ownedCode: "rewindUnsupportedAttachment" });
    if (!owned) throw new Error("Expected owned error");
    set(ref.threadId, owned.error, owned.ownedCode);
    expect(formatLocalThreadError(source, entries.unknown, "zh-CN")).toBe(
      "此消息包含无法恢复的附件。",
    );
    expect(formatLocalThreadError(source, entries.unknown, "en")).toBe(source);
    set(ref.threadId, source);
    expect(entries.unknown?.ownedCode).toBeUndefined();
    expect(formatLocalThreadError(source, entries.unknown, "zh-CN")).toBe(source);
    expect(readOwnedRewindFailure(new Error(failure.message))).toBeUndefined();
    expect(
      readOwnedRewindFailure(
        Object.assign(new Error(failure.message), { ownedCode: "rewindUnsupportedAttachment" }),
      ),
    ).toBeUndefined();
    failure.message = "changed";
    expect(readOwnedRewindFailure(failure)).toBeUndefined();
  }
  expect(createAssetUrl).not.toHaveBeenCalled();
  expect(message.attachments).toEqual([attachment]);
});

it("marks only the real rewind invalid URL constructor, not the file-opening helper", async () => {
  const source = "The environment returned an invalid attachment URL.";
  const attachment = {
    type: "file",
    id: "opaque-file",
    name: "literal-file-$&-{file}.txt",
    mimeType: "text/plain",
    sizeBytes: 1,
  } satisfies ChatFileAttachment;
  const environmentId = EnvironmentId.make("invalid-url");
  const message = {
    id: MessageId.make("invalid-url-message"),
    role: "user",
    text: "opaque",
    runId: null,
    streaming: false,
    createdAt: "2026-11-13T00:00:00.000Z",
    updatedAt: "2026-11-13T00:00:00.000Z",
    attachments: [attachment],
  } satisfies Parameters<typeof prepareRevertedMessageAttachments>[0]["message"];
  const createAssetUrl = vi.fn(async () =>
    AsyncResult.success({ relativeUrl: "http://[", expiresAt: 1 }),
  );
  for (const locale of ["en", "zh-CN", "en"] as const) {
    const readLocale = vi.fn(() => locale);
    const failure = await prepareRevertedMessageAttachments({
      message,
      environmentId,
      httpBaseUrl: "https://example.invalid",
      readLocale,
      createAssetUrl,
    }).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error)) throw new Error("Expected invalid URL error");
    expect(failure.message).toBe(locale === "en" ? source : "环境返回了无效的附件 URL。");
    expect(readLocale).toHaveBeenCalledTimes(1);
    const owned = readOwnedRewindFailure(failure);
    expect(owned).toEqual({ error: source, ownedCode: "rewindInvalidAttachmentUrl" });
    if (!owned) throw new Error("Expected owned error");
    const entry = { message: owned.error, ownedCode: owned.ownedCode, at: 1 };
    expect(formatLocalThreadError(source, entry, "zh-CN")).toBe("环境返回了无效的附件 URL。");
    expect(formatLocalThreadError(source, entry, "en")).toBe(source);
    expect(formatLocalThreadError(source, { message: source, at: 1 }, "zh-CN")).toBe(source);
    expect(readOwnedRewindFailure(new Error(failure.message))).toBeUndefined();
    expect(
      readOwnedRewindFailure(
        Object.assign(new Error(failure.message), { ownedCode: "rewindInvalidAttachmentUrl" }),
      ),
    ).toBeUndefined();
    failure.message = "changed";
    expect(readOwnedRewindFailure(failure)).toBeUndefined();
    const direct = await resolveFileAttachmentUrl({
      attachment,
      environmentId,
      httpBaseUrl: "https://example.invalid",
      readLocale: () => locale,
      createAssetUrl,
    }).catch((error: unknown) => error);
    expect(direct).toBeInstanceOf(Error);
    expect(readOwnedRewindFailure(direct)).toBeUndefined();
  }
  expect(createAssetUrl).toHaveBeenCalledTimes(6);
  expect(createAssetUrl).toHaveBeenCalledWith({
    environmentId,
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

it.each(["server", "draft"] as const)(
  "pairs dynamic restore names atomically in the %s map",
  (kind) => {
    const ref = {
      environmentId: EnvironmentId.make("dynamic"),
      threadId: ThreadId.make("dynamic"),
    };
    let entries: Record<string, LocalThreadErrorEntry> = {};
    const update = (value: SetStateAction<Record<string, LocalThreadErrorEntry>>) => {
      entries = typeof value === "function" ? value(entries) : value;
    };
    const set = makeThreadErrorSetter({
      routeThreadRef: ref,
      routeThreadKey: "dynamic",
      draftId: null,
      serverThreadRef: kind === "server" ? ref : null,
      setLocalServerErrorsByThreadKey: update,
      setLocalDraftErrorsByDraftId: update,
    });
    for (const name of ["{name}/$&:\n.txt", "other", ""] as const) {
      const source = `Could not restore attachment: ${name}`;
      set(ref.threadId, source, "rewindRestoreAttachment", name);
      const entry = entries.dynamic!;
      expect(entry).toMatchObject({
        message: source,
        ownedCode: "rewindRestoreAttachment",
        ownedName: name,
      });
      for (const locale of ["en", "zh-CN", "en"] as const)
        expect(formatLocalThreadError(source, entry, locale)).toBe(
          locale === "en" ? source : `无法恢复附件：${name}`,
        );
      set(ref.threadId, source, "rewindRestoreAttachment", name);
      expect(entries.dynamic).toBe(entry);
      expect(
        shouldPromoteLocalThreadError(entry, { ...entry, ownedName: name + "different" }),
      ).toBe(true);
      expect(shouldPromoteLocalThreadError(entry, { ...entry })).toBe(false);
      expect(formatLocalThreadError(source, { ...entry, ownedName: name + "wrong" }, "zh-CN")).toBe(
        source,
      );
      expect(formatLocalThreadError(source + "stale", entry, "zh-CN")).toBe(source + "stale");
      set(ref.threadId, source);
      expect(entries.dynamic?.ownedCode).toBeUndefined();
      expect(entries.dynamic?.ownedName).toBeUndefined();
      expect(formatLocalThreadError(source, entries.dynamic, "zh-CN")).toBe(source);
      set(ref.threadId, source, "rewindRestoreAttachment");
      expect(entries.dynamic?.ownedCode).toBeUndefined();
      set(ref.threadId, source, "rewindRestoreAttachment", name + "wrong");
      expect(entries.dynamic?.ownedName).toBeUndefined();
    }
    for (const raw of ["", "   ", null]) {
      set(ref.threadId, raw);
      expect(entries.dynamic?.message).toBe(raw);
    }
    const name = "literal is not connected.";
    set(ref.threadId, `Could not restore attachment: ${name}`, "rewindRestoreAttachment", name);
    expect(entries.dynamic?.message).toBeNull();
    expect(entries.dynamic?.ownedCode).toBeUndefined();
    expect(entries.dynamic?.ownedName).toBeUndefined();
  },
);

it("pairs queued edit fallback ownership without claiming raw collisions", () => {
  const source = "Could not save the edited queued message.";
  const ref = { environmentId: EnvironmentId.make("edit"), threadId: ThreadId.make("edit") };
  let entries: Record<string, LocalThreadErrorEntry> = {};
  const set = makeThreadErrorSetter({
    routeThreadRef: ref,
    routeThreadKey: "edit",
    draftId: null,
    serverThreadRef: ref,
    setLocalServerErrorsByThreadKey: (update) => {
      entries = typeof update === "function" ? update(entries) : update;
    },
    setLocalDraftErrorsByDraftId: () => undefined,
  });
  set(ref.threadId, source, "queuedEditSaveFailed");
  expect(entries.edit?.ownedCode).toBe("queuedEditSaveFailed");
  for (const locale of ["en", "zh-CN", "en"] as const)
    expect(formatLocalThreadError(source, entries.edit, locale)).toBe(
      locale === "en" ? source : "无法保存编辑后的队列消息。",
    );
  set(ref.threadId, source);
  expect(entries.edit?.ownedCode).toBeUndefined();
  expect(formatLocalThreadError(source, entries.edit, "zh-CN")).toBe(source);
});

it("pairs queued attachment limit ownership without claiming raw collisions", () => {
  const source = `A message can have at most ${PROVIDER_SEND_TURN_MAX_ATTACHMENTS} attachments.`;
  const ref = { environmentId: EnvironmentId.make("limit"), threadId: ThreadId.make("limit") };
  let entries: Record<string, LocalThreadErrorEntry> = {};
  const set = makeThreadErrorSetter({
    routeThreadRef: ref,
    routeThreadKey: "limit",
    draftId: null,
    serverThreadRef: ref,
    setLocalServerErrorsByThreadKey: (update) => {
      entries = typeof update === "function" ? update(entries) : update;
    },
    setLocalDraftErrorsByDraftId: () => undefined,
  });
  set(ref.threadId, source, "queuedEditAttachmentLimit");
  expect(entries.limit?.ownedCode).toBe("queuedEditAttachmentLimit");
  for (const locale of ["en", "zh-CN", "en"] as const)
    expect(formatLocalThreadError(source, entries.limit, locale)).toBe(
      locale === "en"
        ? source
        : `每条消息最多可添加 ${PROVIDER_SEND_TURN_MAX_ATTACHMENTS} 个附件。`,
    );
  set(ref.threadId, source);
  expect(entries.limit?.ownedCode).toBeUndefined();
  expect(formatLocalThreadError(source, entries.limit, "zh-CN")).toBe(source);
  const wrongCount = `A message can have at most ${PROVIDER_SEND_TURN_MAX_ATTACHMENTS + 1} attachments.`;
  set(ref.threadId, wrongCount, "queuedEditAttachmentLimit");
  expect(entries.limit?.ownedCode).toBeUndefined();
  expect(formatLocalThreadError(wrongCount, entries.limit, "zh-CN")).toBe(wrongCount);
  set(ref.threadId, source, "queuedEditAttachmentLimit", "unexpected name");
  expect(entries.limit?.ownedCode).toBeUndefined();
  expect(entries.limit?.ownedName).toBeUndefined();
});

it("pairs queued upload fallback ownership without claiming raw collisions", () => {
  const source = "Retry or remove failed uploads before saving.";
  const ref = { environmentId: EnvironmentId.make("edit"), threadId: ThreadId.make("edit") };
  let entries: Record<string, LocalThreadErrorEntry> = {};
  const set = makeThreadErrorSetter({
    routeThreadRef: ref,
    routeThreadKey: "edit",
    draftId: null,
    serverThreadRef: ref,
    setLocalServerErrorsByThreadKey: (update) => {
      entries = typeof update === "function" ? update(entries) : update;
    },
    setLocalDraftErrorsByDraftId: () => undefined,
  });
  set(ref.threadId, source, "queuedEditUploadFailed");
  expect(entries.edit?.ownedCode).toBe("queuedEditUploadFailed");
  for (const locale of ["en", "zh-CN", "en"] as const)
    expect(formatLocalThreadError(source, entries.edit, locale)).toBe(
      locale === "en" ? source : "保存前请重试或移除上传失败的附件。",
    );
  set(ref.threadId, source);
  expect(entries.edit?.ownedCode).toBeUndefined();
  expect(formatLocalThreadError(source, entries.edit, "zh-CN")).toBe(source);
});

it.each(["server", "draft"] as const)("pairs reconnect labels atomically in the %s map", (kind) => {
  const ref = {
    environmentId: EnvironmentId.make("dynamic"),
    threadId: ThreadId.make("dynamic"),
  };
  let entries: Record<string, LocalThreadErrorEntry> = {};
  const update = (value: SetStateAction<Record<string, LocalThreadErrorEntry>>) => {
    entries = typeof value === "function" ? value(entries) : value;
  };
  const set = makeThreadErrorSetter({
    routeThreadRef: ref,
    routeThreadKey: "dynamic",
    draftId: null,
    serverThreadRef: kind === "server" ? ref : null,
    setLocalServerErrorsByThreadKey: update,
    setLocalDraftErrorsByDraftId: update,
  });
  for (const name of ["{name}/$&:\n.txt", "other", ""] as const) {
    const source = `Reconnect ${name} before reverting checkpoints.`;
    set(ref.threadId, source, "rewindReconnect", name);
    const entry = entries.dynamic!;
    expect(entry).toMatchObject({
      message: source,
      ownedCode: "rewindReconnect",
      ownedName: name,
    });
    for (const locale of ["en", "zh-CN", "en"] as const)
      expect(formatLocalThreadError(source, entry, locale)).toBe(
        locale === "en" ? source : `请重新连接 ${name} 后再还原检查点。`,
      );
    set(ref.threadId, source, "rewindReconnect", name);
    expect(entries.dynamic).toBe(entry);
    expect(shouldPromoteLocalThreadError(entry, { ...entry, ownedName: name + "different" })).toBe(
      true,
    );
    expect(shouldPromoteLocalThreadError(entry, { ...entry })).toBe(false);
    expect(formatLocalThreadError(source, { ...entry, ownedName: name + "wrong" }, "zh-CN")).toBe(
      source,
    );
    expect(formatLocalThreadError(source + "stale", entry, "zh-CN")).toBe(source + "stale");
    set(ref.threadId, source);
    expect(entries.dynamic?.ownedCode).toBeUndefined();
    expect(entries.dynamic?.ownedName).toBeUndefined();
    expect(formatLocalThreadError(source, entries.dynamic, "zh-CN")).toBe(source);
    set(ref.threadId, source, "rewindReconnect");
    expect(entries.dynamic?.ownedCode).toBeUndefined();
    set(ref.threadId, source, "rewindReconnect", name + "wrong");
    expect(entries.dynamic?.ownedName).toBeUndefined();
  }
  for (const raw of ["", "   ", null]) {
    set(ref.threadId, raw);
    expect(entries.dynamic?.message).toBe(raw);
  }
  const name = "literal SocketCloseError label";
  set(ref.threadId, `Reconnect ${name} before reverting checkpoints.`, "rewindReconnect", name);
  expect(entries.dynamic?.message).toBeNull();
  expect(entries.dynamic?.ownedCode).toBeUndefined();
  expect(entries.dynamic?.ownedName).toBeUndefined();
});

it("pairs side chat fork ownership without claiming raw collisions", () => {
  const source = "Could not start a side chat.";
  const ref = { environmentId: EnvironmentId.make("edit"), threadId: ThreadId.make("edit") };
  let entries: Record<string, LocalThreadErrorEntry> = {};
  const set = makeThreadErrorSetter({
    routeThreadRef: ref,
    routeThreadKey: "edit",
    draftId: null,
    serverThreadRef: ref,
    setLocalServerErrorsByThreadKey: (update) => {
      entries = typeof update === "function" ? update(entries) : update;
    },
    setLocalDraftErrorsByDraftId: () => undefined,
  });
  set(ref.threadId, source, "sideChatForkFailed");
  expect(entries.edit?.ownedCode).toBe("sideChatForkFailed");
  for (const locale of ["en", "zh-CN", "en"] as const)
    expect(formatLocalThreadError(source, entries.edit, locale)).toBe(
      locale === "en" ? source : "无法启动旁支对话。",
    );
  set(ref.threadId, source);
  expect(entries.edit?.ownedCode).toBeUndefined();
  expect(formatLocalThreadError(source, entries.edit, "zh-CN")).toBe(source);
});

it.each([
  [
    "sideChatMissingShell",
    "The side chat was created, but it did not reach this client.",
    "旁支对话已创建，但尚未同步到此客户端。",
  ],
  ["sideChatUnavailable", "The side chat is no longer available.", "旁支对话已不可用。"],
  [
    "sideChatModeFailed",
    "Could not set the side chat's permission mode.",
    "无法设置旁支对话的权限模式。",
  ],
  ["sideChatSendFailed", "Could not send the side chat message.", "无法发送旁支对话消息。"],
] as const)("pairs side chat stage %s without raw lookup", (code, source, chinese) => {
  const ref = {
    environmentId: EnvironmentId.make("side-stages"),
    threadId: ThreadId.make("side-stages"),
  };
  let entries: Record<string, LocalThreadErrorEntry> = {};
  const set = makeThreadErrorSetter({
    routeThreadRef: ref,
    routeThreadKey: "side",
    draftId: null,
    serverThreadRef: ref,
    setLocalServerErrorsByThreadKey: (update) => {
      entries = typeof update === "function" ? update(entries) : update;
    },
    setLocalDraftErrorsByDraftId: () => undefined,
  });
  set(ref.threadId, source, code);
  expect(entries.side?.ownedCode).toBe(code);
  for (const locale of ["en", "zh-CN", "en"] as const)
    expect(formatLocalThreadError(source, entries.side, locale)).toBe(
      locale === "en" ? source : chinese,
    );
  expect(formatLocalThreadError(source + " stale", entries.side, "zh-CN")).toBe(source + " stale");
  set(ref.threadId, source);
  expect(entries.side?.ownedCode).toBeUndefined();
  expect(formatLocalThreadError(source, entries.side, "zh-CN")).toBe(source);
});

it("pairs multiple-model fallback ownership without claiming raw collisions", () => {
  const source = "Failed to send messages.";
  const ref = { environmentId: EnvironmentId.make("edit"), threadId: ThreadId.make("edit") };
  let entries: Record<string, LocalThreadErrorEntry> = {};
  const set = makeThreadErrorSetter({
    routeThreadRef: ref,
    routeThreadKey: "edit",
    draftId: null,
    serverThreadRef: ref,
    setLocalServerErrorsByThreadKey: (update) => {
      entries = typeof update === "function" ? update(entries) : update;
    },
    setLocalDraftErrorsByDraftId: () => undefined,
  });
  set(ref.threadId, source, "multipleModelsFailed");
  expect(entries.edit?.ownedCode).toBe("multipleModelsFailed");
  for (const locale of ["en", "zh-CN", "en"] as const)
    expect(formatLocalThreadError(source, entries.edit, locale)).toBe(
      locale === "en" ? source : "发送消息失败。",
    );
  set(ref.threadId, source);
  expect(entries.edit?.ownedCode).toBeUndefined();
  expect(formatLocalThreadError(source, entries.edit, "zh-CN")).toBe(source);
});

it("pairs script failure literal names without claiming raw collisions", () => {
  const name = "Literal $& {name}\nscript";
  const source = `Failed to run script "${name}".`;
  const ref = { environmentId: EnvironmentId.make("script"), threadId: ThreadId.make("script") };
  let entries: Record<string, LocalThreadErrorEntry> = {};
  const set = makeThreadErrorSetter({
    routeThreadRef: ref,
    routeThreadKey: "script",
    draftId: null,
    serverThreadRef: ref,
    setLocalServerErrorsByThreadKey: (update) => {
      entries = typeof update === "function" ? update(entries) : update;
    },
    setLocalDraftErrorsByDraftId: () => undefined,
  });
  set(ref.threadId, source, "scriptFailed", name);
  expect(entries.script?.ownedCode).toBe("scriptFailed");
  for (const locale of ["en", "zh-CN", "en"] as const)
    expect(formatLocalThreadError(source, entries.script, locale)).toBe(
      locale === "en" ? source : `无法运行脚本“${name}”。`,
    );
  expect(formatLocalThreadError(source, { ...entries.script!, ownedName: "other" }, "zh-CN")).toBe(
    source,
  );
  set(ref.threadId, source, "scriptFailed");
  expect(entries.script?.ownedCode).toBeUndefined();
  set(ref.threadId, source, "scriptFailed", name);
  set(ref.threadId, source);
  expect(entries.script?.ownedName).toBeUndefined();
  expect(formatLocalThreadError(source, entries.script, "zh-CN")).toBe(source);
  const transportName = "literal SocketCloseError name";
  set(ref.threadId, `Failed to run script "${transportName}".`, "scriptFailed", transportName);
  expect(entries.script?.message).toBeNull();
  expect(entries.script?.ownedCode).toBeUndefined();
});
