import { assert, it } from "@effect/vitest";
import { type ManagedPolicyDocument } from "@t3tools/contracts";
import { ManagedPolicyFileError } from "@t3tools/shared/managedPolicyFile";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as DesktopManagedPolicy from "../app/DesktopManagedPolicy.ts";
import * as DesktopUpdatePolicy from "./DesktopUpdatePolicy.ts";
import * as DesktopUpdates from "./DesktopUpdates.ts";
import { makeHarness } from "./updatesTestHarness.ts";

it.effect.each([
  { organization: "Acme $& {path} 中文", path: undefined },
  { organization: undefined, path: "C:\\Program Files\\T3\\$& {organization} 中文.json" },
])(
  "retains the actual policy source through disabled reasons: $organization $path",
  ({ organization, path }) =>
    Effect.gen(function* () {
      const input =
        path === undefined
          ? ({
              schemaVersion: 1,
              organization: organization!,
              limits: { updates: { mode: "off" } },
            } satisfies ManagedPolicyDocument)
          : new ManagedPolicyFileError({ path, reason: "opaque failure" });
      const policy = yield* DesktopUpdatePolicy.DesktopUpdatePolicy.pipe(
        Effect.provide(
          DesktopUpdatePolicy.layer.pipe(Layer.provide(DesktopManagedPolicy.layerTest(input))),
        ),
      );
      const expected =
        path === undefined
          ? { code: "managed-updates" as const, organization }
          : { code: "policy-file-unavailable" as const, path };
      assert.deepEqual(policy.messageDescriptor, expected);
      const harness = makeHarness({ policy });
      yield* Effect.scoped(
        Effect.gen(function* () {
          const updates = yield* DesktopUpdates.DesktopUpdates;
          yield* updates.configure;
          const reason = yield* updates.disabledReason;
          assert.equal(Option.getOrNull(reason), policy.message);
          assert.deepEqual(DesktopUpdates.describeDesktopUpdateDisabledReason(reason), expected);
          assert.equal(harness.checkCount(), 0);
        }),
      ).pipe(Effect.provide(harness.layer));
    }),
);
