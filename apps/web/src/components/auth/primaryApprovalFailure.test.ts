import { AuthMcpApprovalError } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";
import { approvalFailureMessage, primaryApprovalFailure } from "./primaryApprovalFailure";

// This is the error schema of both /oauth/mcp/approval and /oauth/mcp/decision.
const codec = Schema.toCodecJson(AuthMcpApprovalError);
const encode = Schema.encodeSync(codec);
const decode = Schema.decodeUnknownSync(codec);

const owned = [
  "This sign-in link names an unknown app. Start the sign-in again from it.",
  "This sign-in link sends you to an address the app did not register.",
  "Linking needs a plain pairing code, not an app approval code.",
  "The code could not be checked. Try again.",
  "Your session cannot approve this request. Enter a pairing code instead.",
  "That pairing code cannot grant this access. It has not been used, so choose an access level it grants, or create a code with the standard scopes.",
  "That is not a one-time pairing code.",
  "That pairing code is unknown, expired, or already used.",
];

describe("primary consent failure provenance", () => {
  it.each(owned)(
    "preserves the decoded response and rerenders a retained failure: %s",
    (message) => {
      const wire = encode(new AuthMcpApprovalError({ message }));
      const error = decode(wire);
      const failure = primaryApprovalFailure(error);
      expect(failure).not.toBeNull();
      if (failure === null) return;
      for (const locale of ["en", "zh-CN", "en"] as const) {
        const display = approvalFailureMessage(locale, failure);
        if (locale === "en") expect(display).toBe(message);
        else expect(display).toMatch(/[\u3400-\u9fff]/);
        expect(failure.message).toBe(message);
        expect(encode(error)).toEqual(wire);
      }
      expect(approvalFailureMessage("zh-CN", { ...failure })).toBe(message);
      expect(primaryApprovalFailure(new Error(message))).toBeNull();
      expect(primaryApprovalFailure({ _tag: "AuthMcpApprovalError", message })).toBeNull();
    },
  );

  it("preserves unknown HTTP messages and colliding custom-transport text", () => {
    for (const message of [
      "provider /opaque/$&/{name}/中文",
      `${owned[0]}\nextra`,
      `external: ${owned[0]}`,
      "constructor",
      "__proto__",
      "",
    ]) {
      const error = decode(encode(new AuthMcpApprovalError({ message })));
      expect(primaryApprovalFailure(error)).toBeNull();
      expect(approvalFailureMessage("zh-CN", { kind: "error", message })).toBe(message);
    }
    for (const message of owned) {
      const customAnswer = { kind: "error", message } as const;
      expect(approvalFailureMessage("zh-CN", customAnswer)).toBe(message);
    }
  });
});
