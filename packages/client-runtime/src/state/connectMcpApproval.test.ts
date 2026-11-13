import {
  AuthMcpApprovalError,
  AuthMcpAuthorizationRequest,
  AuthMcpApprovalDecisionRequest,
  EnvironmentId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { Atom, AtomRegistry } from "effect/reactivity";
import { expect, it } from "@effect/vitest";
import * as RemoteEnvironmentAuthorization from "../authorization/service.ts";
import * as ManagedRelay from "../relay/managedRelay.ts";
import * as RpcHttp from "../rpc/http.ts";
import {
  createConnectMcpApprovalCommand,
  readConnectMcpApprovalRefusalError,
  type ConnectMcpApprovalCall,
} from "./connectMcpApproval.ts";

const encodeApprovalError = Schema.encodeSync(Schema.toCodecJson(AuthMcpApprovalError));
const encodeAuthorization = Schema.encodeSync(AuthMcpAuthorizationRequest);
const encodeDecision = Schema.encodeSync(AuthMcpApprovalDecisionRequest);

it.each(["approval", "decision"] as const)(
  "retains decoded refusal provenance through the real %s HTTP command without changing its payload",
  async (kind) => {
    const environmentId = EnvironmentId.make("opaque-env");
    const authorization = {
      client_id: "opaque/$&/{client}",
      state: Redacted.make("literal/{state}"),
    };
    const call: ConnectMcpApprovalCall =
      kind === "approval"
        ? { kind, payload: authorization }
        : {
            kind,
            payload: {
              authorization,
              decision: { _tag: "browser-session", access: "read-only", csrfToken: "opaque-csrf" },
            },
          };
    const message = "That pairing code is unknown, expired, or already used.";
    const requests: { url: string; init: RequestInit }[] = [];
    const remote = RemoteEnvironmentAuthorization.RemoteEnvironmentAuthorization.of({
      authorizeBearer: () => Effect.die("Unexpected bearer authorization"),
      authorizeDpop: () => Effect.die("Unexpected socket authorization"),
      authorizeDpopHttp: () =>
        Effect.succeed({
          environmentId,
          label: "Opaque /$&/{environment}",
          httpBaseUrl: "https://environment.test",
          httpAuthorization: {
            _tag: "Dpop",
            accessToken: "fixture-token",
            expiresAtEpochMs: 3_600_000,
          },
        }),
      rememberCheckedDescriptor: () => Effect.void,
      renewDpopBeforeExpiry: () => Effect.die("Unexpected socket renewal"),
    });
    const signer = ManagedRelay.ManagedRelayDpopSigner.of({
      thumbprint: Effect.succeed("fixture-thumbprint"),
      createProof: () => Effect.succeed("fixture-proof"),
    });
    const http = RpcHttp.layerRemoteHttpClient(async (url, init) => {
      requests.push({ url: String(url), init: init ?? {} });
      return Response.json(encodeApprovalError(new AuthMcpApprovalError({ message })), {
        status: 400,
      });
    });
    const runtime = Atom.runtime(
      Layer.mergeAll(
        http,
        Layer.succeed(RemoteEnvironmentAuthorization.RemoteEnvironmentAuthorization, remote),
        Layer.succeed(ManagedRelay.ManagedRelayDpopSigner, signer),
      ),
    );
    const command = createConnectMcpApprovalCommand(runtime);
    const registry = AtomRegistry.make();
    try {
      const result = await command.run(registry, { environmentId, call });
      expect(result._tag).toBe("Success");
      if (result._tag !== "Success") return;
      expect(result.value.answer).toEqual({ kind: "refused", message });
      const error = readConnectMcpApprovalRefusalError(result.value.answer);
      expect(error).not.toBeNull();
      expect(Object.getPrototypeOf(error)).toBe(AuthMcpApprovalError.prototype);
      expect(error?.message).toBe(message);
      expect(readConnectMcpApprovalRefusalError({ kind: "refused", message })).toBeNull();
      expect(readConnectMcpApprovalRefusalError({ ...result.value.answer })).toBeNull();
      expect(result.value.environmentLabel).toBe("Opaque /$&/{environment}");
      expect(requests).toHaveLength(1);
      expect(new URL(requests[0]!.url).pathname).toBe(`/oauth/mcp/${kind}`);
      expect(requests[0]!.init.method).toBe("POST");
      expect(await new Response(requests[0]!.init.body).json()).toEqual(
        call.kind === "approval" ? encodeAuthorization(call.payload) : encodeDecision(call.payload),
      );
    } finally {
      registry.dispose();
    }
  },
);
