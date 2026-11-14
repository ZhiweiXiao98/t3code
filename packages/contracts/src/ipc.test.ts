import { expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { DesktopSnapShotSetupOutcome } from "./ipc.ts";

it("round-trips setup outcomes without trimming public messages or app names", () => {
  const decode = Schema.decodeUnknownSync(DesktopSnapShotSetupOutcome);
  const encode = Schema.encodeSync(DesktopSnapShotSetupOutcome);
  for (const outcome of [
    { _tag: "Success" },
    { _tag: "Failure", message: "" },
    { _tag: "Failure", message: null },
    { _tag: "Failure", message: " native $& {0} 中文\n " },
    {
      _tag: "Failure",
      message: "owned English",
      messageDescriptor: {
        code: "setup",
        action: "test-mac-capture",
        reason: "setup-failed",
        step: "capture-window",
        status: "exited",
        exitCode: -9,
        appName: ' App "$&" {0}\n中文 ',
      },
    },
  ]) {
    const value = decode(outcome);
    expect(decode(JSON.parse(JSON.stringify(encode(value))))).toEqual(value);
    expect(value).toEqual(outcome);
  }
});

it("preserves Failure and raw text when future or malformed ownership metadata is received", () => {
  const decode = Schema.decodeUnknownSync(DesktopSnapShotSetupOutcome);
  for (const messageDescriptor of [
    { code: "future" },
    { code: "setup" },
    { code: "setup", action: "future", reason: "setup-failed" },
    { code: "setup", action: "test-mac-capture", reason: "setup-failed", exitCode: "9" },
    null,
  ]) {
    const value = decode({
      _tag: "Failure",
      message: "Could not capture a test snapshot.",
      messageDescriptor,
    });
    expect(value).toEqual({
      _tag: "Failure",
      message: "Could not capture a test snapshot.",
      messageDescriptor: undefined,
    });
  }
});
