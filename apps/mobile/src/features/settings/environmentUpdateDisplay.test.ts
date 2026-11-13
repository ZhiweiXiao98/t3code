import { ServerSelfUpdateError } from "@t3tools/contracts";
import {
  createServerUpdateFailedState,
  describeServerUpdateFailure,
  describeServerUpdateStateFailure,
  ServerUpdateResumeTimeoutError,
  ServerUpdateProgressIncompleteError,
} from "@t3tools/client-runtime/state/server";
import * as Schema from "effect/Schema";
import { expect, it } from "vite-plus/test";
import {
  captureEnvironmentActionFailure,
  mobileServerUpdateFailure,
} from "./environmentUpdateDisplay";

it("keeps raw command errors separate from update provenance and preserves cached English across locale changes", () => {
  const version = "Settings {0} $&";
  const error = new ServerUpdateResumeTimeoutError({
    environmentId: "Open",
    targetVersion: version,
  });
  const cached = captureEnvironmentActionFailure(error, describeServerUpdateFailure);
  expect(cached.message).toBe(error.message);
  expect(mobileServerUpdateFailure(cached.message, cached.updateMessage, "en")).toBe(error.message);
  expect(mobileServerUpdateFailure(cached.message, cached.updateMessage, "zh-CN")).toBe(
    `无法确认服务器已恢复运行 t3@${version}。请重新连接以检查更新结果。`,
  );
  expect(mobileServerUpdateFailure(cached.message, cached.updateMessage, "en")).toBe(error.message);
  expect(Object.keys(cached).sort()).toEqual(["message", "updateMessage"]);
  for (const raw of [new Error("Settings"), new Error(error.message)]) {
    const result = captureEnvironmentActionFailure(raw, describeServerUpdateFailure);
    expect(result).toEqual({ message: raw.message });
    expect(mobileServerUpdateFailure(result.message, result.updateMessage, "zh-CN")).toBe(
      raw.message,
    );
  }
  const nonUpdate = captureEnvironmentActionFailure(error);
  expect(nonUpdate).toEqual({ message: error.message });
  const fallback = captureEnvironmentActionFailure(null);
  expect(fallback).not.toHaveProperty("updateMessage");
  const updateFallback = captureEnvironmentActionFailure(null, describeServerUpdateFailure);
  expect(updateFallback.updateMessage).toEqual({ code: "unknown" });
  expect(
    mobileServerUpdateFailure(updateFallback.message, updateFallback.updateMessage, "zh-CN"),
  ).toBe("服务器更新失败。");
  expect(
    mobileServerUpdateFailure(updateFallback.message, updateFallback.updateMessage, "en"),
  ).toBe(updateFallback.message);
});

it("renders only recorded failed-state provenance and does not relabel copied state or diagnostics", () => {
  const error = new ServerUpdateProgressIncompleteError({ targetVersion: "Open {0} $&" });
  const state = createServerUpdateFailedState(
    { stage: "resuming", fromVersion: "Settings", targetVersion: error.targetVersion },
    error,
  );
  const before = structuredClone(state);
  expect(
    mobileServerUpdateFailure(state.message, describeServerUpdateStateFailure(state), "zh-CN"),
  ).toBe(`t3@${error.targetVersion} 更新在服务器接受重启请求前已结束。`);
  const copy = { ...state };
  expect(
    mobileServerUpdateFailure(copy.message, describeServerUpdateStateFailure(copy), "zh-CN"),
  ).toBe(state.message);
  expect(describeServerUpdateStateFailure({ status: "idle" })).toBeUndefined();
  expect(state).toEqual(before);
});

const decodeSelfUpdateError = Schema.decodeUnknownSync(ServerSelfUpdateError);

it("uses coherent reason descriptors while preserving mismatched metadata and opaque parameters", () => {
  const raw = "Settings\n{0} $&";
  const cases = [
    { reason: raw, reasonMessage: undefined, expected: raw },
    {
      reason: `The desktop app found no build of ${raw}.`,
      reasonMessage: { code: "build-not-found" as const, version: raw },
      expected: `桌面应用未找到 ${raw} 的构建版本。`,
    },
    {
      reason: `${raw} manages T3 Code updates. Switch to the stable channel to keep getting updates.`,
      reasonMessage: { code: "managed-updates" as const, organization: raw, switchToStable: true },
      expected: `${raw} 负责管理 T3 Code 更新。 请切换到稳定版通道，以继续获取更新。`,
    },
    {
      reason: `Updates are off because T3 Code cannot use the managed policy at ${raw}. Contact your administrator.`,
      reasonMessage: { code: "policy-file-unavailable" as const, path: raw },
      expected: `T3 Code 无法使用位于 ${raw} 的受管策略，因此已关闭更新。请联系管理员。`,
    },
  ];
  for (const { reason, reasonMessage, expected } of cases) {
    const error = new ServerSelfUpdateError({
      reason,
      ...(reasonMessage ? { reasonMessage } : {}),
    });
    const descriptor = describeServerUpdateFailure(error);
    expect(mobileServerUpdateFailure(error.message, descriptor, "en")).toBe(error.message);
    expect(mobileServerUpdateFailure(error.message, descriptor, "zh-CN")).toBe(
      `服务器更新失败：${expected}`,
    );
    expect(error.reason).toBe(reason);
    if (reasonMessage) {
      for (const mismatch of [raw, ` ${reason}`, `${reason}\nraw diagnostic`]) {
        const stale = new ServerSelfUpdateError({ reason: mismatch, reasonMessage });
        expect(
          mobileServerUpdateFailure(stale.message, describeServerUpdateFailure(stale), "zh-CN"),
        ).toBe(`服务器更新失败：${mismatch}`);
      }
    }
  }
  for (const reasonMessage of [
    { code: "future-reason", version: "Ignored" },
    { code: "build-not-found" },
  ]) {
    const decoded = decodeSelfUpdateError(
      JSON.parse(JSON.stringify({ _tag: "ServerSelfUpdateError", reason: raw, reasonMessage })),
    );
    expect(decoded.reasonMessage).toBeUndefined();
    expect(
      mobileServerUpdateFailure(decoded.message, describeServerUpdateFailure(decoded), "zh-CN"),
    ).toBe(`服务器更新失败：${raw}`);
  }
});
