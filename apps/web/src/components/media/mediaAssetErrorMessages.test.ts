import {
  AssetAttachmentNotFoundError,
  AssetPreviewTypeValidationError,
  AssetProjectFaviconNotFoundError,
  AssetSigningKeyLoadError,
  AssetSourceControlMediaUrlValidationError,
  AssetWorkspaceAssetInspectionError,
  AssetWorkspaceAssetNotFoundError,
  AssetWorkspaceContextNotFoundError,
  AssetWorkspaceContextResolutionError,
  AssetWorkspacePathValidationError,
  AssetWorkspaceResolutionError,
  AssetWorkspaceRootNormalizationError,
  EnvironmentAuthorizationError,
  AuthFilesystemReadScope,
  ThreadId,
  TurnItemId,
  WS_METHODS,
  WsRpcGroup,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import { Rpc } from "effect/rpc";
import { describe, expect, it } from "vite-plus/test";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { mediaActionErrorMessage } from "./mediaActionErrors";

const threadId = ThreadId.make("opaque-thread-$&");
const workspace = {
  _tag: "workspace-file",
  threadId,
  path: "目录/{name}/Media file was not found..png",
} as const;
const media = { ...workspace, _tag: "media-file" } as const;
const draft = { _tag: "draft-workspace-file", cwd: "/opaque/$&", path: "{name}.png" } as const;
const tool = {
  _tag: "tool-output-image",
  threadId,
  itemId: TurnItemId.make("opaque-item"),
  index: 7,
} as const;
const attachment = {
  _tag: "attachment",
  attachmentId: "opaque-id",
  fileName: "{name}/$&.png",
} as const;
const cause = new Error("provider /opaque/$&/{name}/中文");
const cases = [
  new AssetWorkspaceContextNotFoundError({ resource: workspace }),
  new AssetWorkspaceContextResolutionError({ resource: media, cause }),
  new AssetWorkspaceRootNormalizationError({ resource: draft, cause }),
  new AssetWorkspacePathValidationError({ resource: workspace, cause }),
  new AssetPreviewTypeValidationError({ resource: workspace }),
  new AssetPreviewTypeValidationError({ resource: media }),
  new AssetWorkspaceAssetInspectionError({ resource: media, cause }),
  new AssetWorkspaceAssetInspectionError({ resource: tool, cause }),
  new AssetWorkspaceAssetNotFoundError({ resource: media, checkedPath: "/opaque/$&/{name}" }),
  new AssetWorkspaceAssetNotFoundError({ resource: workspace }),
  new AssetWorkspaceAssetNotFoundError({ resource: tool }),
  new AssetWorkspaceResolutionError({ resource: workspace, cause }),
  new AssetAttachmentNotFoundError({ resource: attachment }),
  new AssetSourceControlMediaUrlValidationError({}),
  new AssetSigningKeyLoadError({ resource: draft, cause }),
];
const rpc = [...WsRpcGroup.requests.values()].find(
  (entry) => entry._tag === WS_METHODS.assetsCreateUrl,
)!;
const codec = Schema.toCodecJson(Rpc.exitSchema(rpc));
const encode = Schema.encodeSync(codec);
const decode = Schema.decodeUnknownSync(codec);

describe("media asset RPC presentation", () => {
  it("decodes all 15 real owned messages through the actual RPC exit schema and preserves opaque data", () => {
    expect(new Set(cases.map((error) => error._tag)).size).toBe(11);
    expect(new Set(cases.map((error) => error.message)).size).toBe(15);
    for (const original of cases) {
      const wire = encode(Exit.fail(original));
      const decoded = decode(wire);
      expect(decoded._tag).toBe("Failure");
      if (decoded._tag !== "Failure") continue;
      const error = squashAtomCommandFailure(decoded);
      const beforeDisplay = encode(decoded);
      for (const locale of ["en", "zh-CN", "en"] as const) {
        const message =
          mediaActionErrorMessage(locale, error) ?? (error instanceof Error ? error.message : null);
        if (locale === "en") expect(message).toBe(original.message);
        else expect(message).toMatch(/[\u3400-\u9fff]/);
      }
      expect(encode(decoded)).toEqual(beforeDisplay);
      expect(beforeDisplay).toEqual(wire);
      if ("resource" in original) expect(error).toMatchObject({ resource: original.resource });
      expect(mediaActionErrorMessage("zh-CN", new Error(original.message))).toBeNull();
      expect(mediaActionErrorMessage("zh-CN", { ...original })).toBeNull();
    }
  });

  it("excludes unsupported resources, favicon errors, authorization and defects", () => {
    const favicon = { _tag: "project-favicon", cwd: "/opaque/$&" } as const;
    for (const error of [
      new AssetWorkspaceContextNotFoundError({ resource: favicon }),
      new AssetWorkspaceAssetNotFoundError({ resource: attachment }),
      new AssetPreviewTypeValidationError({ resource: tool }),
      new AssetWorkspaceResolutionError({ resource: media, cause }),
      new AssetSigningKeyLoadError({ resource: favicon, cause }),
      new AssetProjectFaviconNotFoundError({ resource: favicon }),
      new EnvironmentAuthorizationError({
        requiredScope: AuthFilesystemReadScope,
        message: "Workspace context was not found.",
      }),
      Cause.squash(Cause.die(cause)),
      {
        _tag: "AssetGitHubMediaUrlValidationError",
        message:
          "Only media a source control host keeps behind a credential can be fetched with one.",
      },
    ])
      expect(mediaActionErrorMessage("zh-CN", error)).toBeNull();
  });
});
