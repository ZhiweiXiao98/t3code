import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import {
  ProviderAuthState,
  ChatGptHandoffState,
  ProviderSetupError,
  providerAuthMessage,
  formatProviderAuthMessage,
} from "./providerSetup.ts";

const decodeState = Schema.decodeUnknownSync(ProviderAuthState);

describe("provider auth state", () => {
  it("drops auth variants from newer servers instead of rejecting the state", () => {
    const method = { id: "browser", name: "Browser", description: null, type: "agent" };
    expect(
      decodeState({
        instanceId: "cursor",
        phase: "waiting",
        flowId: null,
        authorizationUrl: null,
        expiresAt: null,
        message: null,
        methods: [method, { ...method, id: "passkey", type: "passkey" }],
        interaction: { type: "passkey", id: "passkey" },
        credentialOwner: "keychain",
      }),
    ).toEqual({
      instanceId: "cursor",
      phase: "waiting",
      flowId: null,
      authorizationUrl: null,
      expiresAt: null,
      message: null,
      methods: [method],
    });
  });
});

it("keeps auth state, nested handoff and errors compatible across JSON peers", () => {
  const { messageDescriptor: _descriptor, ...legacyFields } = ProviderAuthState.fields;
  const legacyState = Schema.Struct(legacyFields);
  const state = decodeState({
    instanceId: "cursor",
    phase: "waiting",
    flowId: "test-flow",
    authorizationUrl: "https://example.test/auth?code=fake-only",
    expiresAt: null,
    ...providerAuthMessage("auth.completeSignIn"),
  });
  const codec = Schema.toCodecJson(ProviderAuthState);
  const wire = JSON.parse(JSON.stringify(Schema.encodeSync(codec)(state)));
  expect(Schema.decodeUnknownSync(codec)(wire)).toEqual(state);
  const oldState = Schema.decodeUnknownSync(legacyState)(wire);
  expect(oldState).toEqual({ ...state, messageDescriptor: undefined });
  expect(decodeState(JSON.parse(JSON.stringify(oldState))).messageDescriptor).toBeUndefined();
  const handoff = { phase: "auth" as const, state };
  const handoffCodec = Schema.toCodecJson(ChatGptHandoffState);
  const handoffWire = JSON.parse(JSON.stringify(Schema.encodeSync(handoffCodec)(handoff)));
  expect(Schema.decodeUnknownSync(handoffCodec)(handoffWire)).toEqual(handoff);
  const legacyHandoff = Schema.Struct({ phase: Schema.Literal("auth"), state: legacyState });
  expect(Schema.decodeUnknownSync(legacyHandoff)(handoffWire).state).toEqual(oldState);
  for (const messageDescriptor of [
    undefined,
    null,
    { code: "future.auth" },
    { code: 1 },
    { code: "auth.completeSignIn", params: { secret: "fake-only" } },
  ]) {
    const decoded = Schema.decodeUnknownSync(handoffCodec)(
      JSON.parse(
        JSON.stringify({
          ...handoffWire,
          state: { ...wire, messageDescriptor },
        }),
      ),
    );
    expect(decoded.phase).toBe("auth");
    if (decoded.phase === "auth") {
      expect(decoded.state.message).toBe(state.message);
      expect(decoded.state.messageDescriptor).toBeUndefined();
      expect(decoded.state.authorizationUrl).toBe(state.authorizationUrl);
    }
  }
  const error = new ProviderSetupError({
    instanceId: state.instanceId,
    operation: "complete",
    detail: state.message!,
    messageDescriptor: state.messageDescriptor,
  });
  const errorCodec = Schema.toCodecJson(ProviderSetupError);
  const errorWire = JSON.parse(JSON.stringify(Schema.encodeSync(errorCodec)(error)));
  const decodedError = Schema.decodeUnknownSync(errorCodec)(errorWire);
  expect(decodedError.message).toBe(error.detail);
  expect(decodedError.messageDescriptor).toEqual(state.messageDescriptor);
  const legacyError = Schema.TaggedStruct("ProviderSetupError", {
    instanceId: Schema.String,
    operation: Schema.String,
    detail: Schema.String,
  });
  const oldError = Schema.decodeUnknownSync(legacyError)(errorWire);
  expect(Schema.decodeSync(errorCodec)(oldError).messageDescriptor).toBeUndefined();
  expect(
    Schema.decodeUnknownSync(errorCodec)({
      ...errorWire,
      messageDescriptor: { code: "future.auth" },
    }).message,
  ).toBe(error.detail);
});

it("uses only proven message provenance and keeps ACP external suffixes in the original field", () => {
  const translate = (source: string) =>
    source === "The ACP agent could not complete sign-in."
      ? "ACP 智能体无法完成登录。"
      : source === "Starting sign-in."
        ? "正在开始登录。"
        : source;
  for (const suffix of [
    "Settings",
    "Open",
    "$& {0} 中文\nsecond line",
    "https://example.test/oauth?code=fake-code token=fake-token",
    "A".repeat(500) + "…",
  ]) {
    const message = `The ACP agent could not complete sign-in. ${suffix}`;
    const value = { message, messageDescriptor: { code: "acp.completeFailed" as const } };
    expect(JSON.stringify(value.messageDescriptor)).toBe('{"code":"acp.completeFailed"}');
    expect(formatProviderAuthMessage(value, translate)).toBe(`ACP 智能体无法完成登录。 ${suffix}`);
    expect(formatProviderAuthMessage(value, (source) => source)).toBe(message);
    expect(formatProviderAuthMessage({ message }, translate)).toBe(message);
  }
  expect(formatProviderAuthMessage(providerAuthMessage("auth.starting"), translate)).toBe(
    "正在开始登录。",
  );
  expect(formatProviderAuthMessage({ message: "Starting sign-in." }, translate)).toBe(
    "Starting sign-in.",
  );
  expect(
    formatProviderAuthMessage(
      { message: "Open", messageDescriptor: { code: "auth.starting" } },
      translate,
    ),
  ).toBe("Open");
  expect(
    formatProviderAuthMessage(
      { message: "Open", messageDescriptor: { code: "acp.completeFailed" } },
      translate,
    ),
  ).toBe("Open");
  expect(
    formatProviderAuthMessage(
      { message: null, messageDescriptor: { code: "auth.starting" } },
      translate,
    ),
  ).toBeNull();
});
