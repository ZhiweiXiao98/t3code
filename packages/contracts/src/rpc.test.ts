import { describe, expect, it } from "vite-plus/test";
import * as Exit from "effect/Exit";
import * as Cause from "effect/Cause";
import * as Rpc from "effect/rpc/Rpc";
import * as Schema from "effect/Schema";

import { ORCHESTRATION_V2_WS_METHODS } from "./orchestrationV2.ts";
import { WS_METHODS, WsRpcGroup } from "./rpc.ts";
import { ServerSelfUpdateError } from "./server.ts";

describe("WebSocket RPC contracts", () => {
  it("rejects server-internal commands sent to dispatchCommand", () => {
    const dispatchCommand = WsRpcGroup.requests.get(ORCHESTRATION_V2_WS_METHODS.dispatchCommand);
    if (dispatchCommand === undefined) throw new Error("dispatchCommand is not registered");
    const decode = Schema.decodeUnknownExit(dispatchCommand.payloadSchema);

    expect(
      Exit.isFailure(
        decode({
          type: "checkpoint.rollback.fail",
          commandId: "forged-rollback-failure",
          threadId: "thread-1",
          requestId: "rollback-1",
          message: "Forged failure.",
        }),
      ),
    ).toBe(true);
    expect(
      Exit.isSuccess(
        decode({
          type: "checkpoint.rollback",
          commandId: "rollback-1",
          threadId: "thread-1",
          scopeId: "scope-1",
          checkpointId: "checkpoint-1",
        }),
      ),
    ).toBe(true);
  });

  it("lets the server pick a new worktree's folder", () => {
    const createWorktree = WsRpcGroup.requests.get(WS_METHODS.vcsCreateWorktree);
    if (createWorktree === undefined) throw new Error("vcs.createWorktree is not registered");
    const decode = Schema.decodeUnknownExit(createWorktree.payloadSchema);
    const request = { cwd: "/repo", refName: "main", newRefName: "feature/x" };

    expect(Exit.isSuccess(decode({ ...request, path: null }))).toBe(true);
    expect(Exit.isFailure(decode({ ...request, path: "/repo/.git/hooks" }))).toBe(true);
  });
});

const updateFailureRpcCases = [
  WS_METHODS.serverUpdateServer,
  WS_METHODS.serverUpdateServerWithProgress,
  WS_METHODS.serverCommitDesktopUpdate,
].map((method) => {
  const rpc = WsRpcGroup.requests.get(method);
  if (rpc === undefined) throw new Error("Update RPC is not registered");
  const codec = Schema.toCodecJson(Rpc.exitSchema(rpc));
  return { method, encode: Schema.encodeSync(codec), decode: Schema.decodeUnknownSync(codec) };
});
const selfUpdateErrorCodec = Schema.toCodecJson(ServerSelfUpdateError);
const encodeSelfUpdateError = Schema.encodeSync(selfUpdateErrorCodec);
const decodeSelfUpdateError = Schema.decodeUnknownSync(selfUpdateErrorCodec);
const isSelfUpdateError = Schema.is(ServerSelfUpdateError);
const legacyUpdateErrorCodec = Schema.toCodecJson(
  Schema.TaggedStruct("ServerSelfUpdateError", {
    reason: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  }),
);
const encodeLegacyUpdateError = Schema.encodeSync(legacyUpdateErrorCodec);
const decodeLegacyUpdateError = Schema.decodeUnknownSync(legacyUpdateErrorCodec);

describe("update failure RPC compatibility", () => {
  it.each(updateFailureRpcCases)(
    "preserves diagnostics and optional reason provenance through $method",
    ({ encode, decode }) => {
      const reason = "The desktop app found no build of version-$& {version} 中文.";
      const reasonMessage = {
        code: "build-not-found" as const,
        version: "version-$& {version} 中文",
      };
      const error = new ServerSelfUpdateError({
        reason,
        reasonMessage,
        cause: new Error("opaque diagnostic"),
      });
      const wire = JSON.parse(JSON.stringify(encode(Exit.fail(error))));
      const decoded = decode(wire);
      expect(Exit.isFailure(decoded)).toBe(true);
      if (!Exit.isFailure(decoded)) return;
      const failure = Cause.squash(decoded.cause);
      expect(isSelfUpdateError(failure)).toBe(true);
      if (!isSelfUpdateError(failure)) return;
      expect(failure.reason).toBe(reason);
      expect(failure.message).toBe(error.message);
      expect(failure.reasonMessage).toEqual(reasonMessage);
      expect(encode(decoded)).toEqual(wire);

      for (const descriptor of [
        undefined,
        null,
        { code: "future-reason" },
        { code: "build-not-found" },
        { code: "build-not-found", version: 12 },
        { code: "managed-updates", organization: "Acme", switchToStable: "yes" },
      ]) {
        const modifiedWire = JSON.parse(
          JSON.stringify(wire, (_key, value) =>
            value && typeof value === "object" && value._tag === "ServerSelfUpdateError"
              ? { ...value, reasonMessage: descriptor }
              : value,
          ),
        );
        const result = decode(modifiedWire);
        expect(Exit.isFailure(result)).toBe(true);
        if (!Exit.isFailure(result)) continue;
        const rawFailure = Cause.squash(result.cause);
        expect(isSelfUpdateError(rawFailure)).toBe(true);
        if (!isSelfUpdateError(rawFailure)) continue;
        expect(rawFailure.reason).toBe(reason);
        expect(rawFailure.message).toBe(error.message);
        expect(rawFailure.reasonMessage).toBeUndefined();
        expect(rawFailure.cause).toEqual(failure.cause);
      }

      const legacy = decodeLegacyUpdateError(
        JSON.parse(JSON.stringify(encodeSelfUpdateError(error))),
      );
      expect(legacy.reason).toBe(reason);
      expect(Object.hasOwn(legacy, "reasonMessage")).toBe(false);
      const back = decodeSelfUpdateError(
        JSON.parse(JSON.stringify(encodeLegacyUpdateError(legacy))),
      );
      expect(back.message).toBe(error.message);
      expect(back.reasonMessage).toBeUndefined();
    },
  );
});
