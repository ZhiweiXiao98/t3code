import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import { ChildProcessSpawner } from "effect/process";

import * as DesktopConfig from "../app/DesktopConfig.ts";
import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as DesktopManagedPolicy from "../app/DesktopManagedPolicy.ts";
import * as DesktopWslEnvironment from "./DesktopWslEnvironment.ts";
import { localizeWslFailureReason } from "./WslPreflightMessages.ts";

interface ProcessResult {
  readonly stdout: string;
  readonly stderr?: string;
  readonly exitCode: number;
}

const layerWsl = (results: ReadonlyArray<ProcessResult>) => {
  const pending = [...results];
  return DesktopWslEnvironment.layer.pipe(
    Layer.provide(
      Layer.succeed(
        ChildProcessSpawner.ChildProcessSpawner,
        ChildProcessSpawner.make(() =>
          Effect.sync(() => {
            const result = pending.shift();
            if (!result) throw new Error("Unexpected WSL command");
            return ChildProcessSpawner.makeHandle({
              pid: ChildProcessSpawner.ProcessId(123),
              stdout: Stream.encodeText(Stream.make(result.stdout)),
              stderr: Stream.encodeText(Stream.make(result.stderr ?? "")),
              all: Stream.empty,
              stdin: Sink.drain,
              getInputFd: () => Sink.drain,
              getOutputFd: () => Stream.empty,
              exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(result.exitCode)),
              isRunning: Effect.succeed(false),
              kill: () => Effect.void,
              unref: Effect.succeed(Effect.void),
            });
          }),
        ),
      ),
    ),
    Layer.provide(
      DesktopEnvironment.layer({
        dirname: "/repo/apps/desktop/src",
        homeDirectory: "/home/test",
        platform: "linux",
        processArch: "x64",
        appVersion: "1.0.0",
        appPath: "/repo",
        isPackaged: false,
        resourcesPath: "/repo",
        runningUnderArm64Translation: false,
      }).pipe(Layer.provide(Layer.mergeAll(DesktopConfig.layerTest({}), Path.layer))),
    ),
    Layer.provide(DesktopManagedPolicy.layerTest()),
    Layer.provide(FileSystem.layerNoop({ exists: () => Effect.succeed(false) })),
  );
};

const externalDetail = "WSL has no default distribution: /home/Test User's/发行版";
const nodeProbe =
  "nodePath:/home/Test User's/node\nnodeVersion:24.0.0\nresolvedPath:/home/Test User's/bin:/usr/bin\n";

describe("WSL preflight display provenance", () => {
  it.effect("preserves runtime executable paths and raw stderr in both languages", () =>
    Effect.gen(function* () {
      const wsl = yield* DesktopWslEnvironment.DesktopWslEnvironment;
      const root = "/home/Test User's/运行时";
      const result = yield* wsl.probeRuntime("Custom Distro", root);
      assert.isFalse(result.ok);
      if (result.ok) return;
      assert.equal(result.reason, `${root}/t3 --version failed (exit 127): ${externalDetail}`);
      assert.equal(localizeWslFailureReason(result, "en"), result.reason);
      assert.equal(
        localizeWslFailureReason(result, "zh-CN"),
        `${root}/t3 --version 失败（退出码 127）：${externalDetail}`,
      );
    }).pipe(Effect.provide(layerWsl([{ stdout: "", stderr: externalDetail, exitCode: 127 }]))),
  );

  it.effect.each([
    {
      name: "missing tools",
      results: [
        { stdout: "", exitCode: 127 },
        { stdout: "missing:node\nmissing:make\n", exitCode: 0 },
      ],
      fragment: "WSL 发行版缺少所需工具：node、make",
      retained: "`sudo apt install -y build-essential python3`",
      allowBuild: true,
    },
    {
      name: "node version",
      results: [{ stdout: nodeProbe.replace("24.0.0", "18.0.0"), exitCode: 0 }],
      fragment: "WSL Node.js 18.0.0 不满足",
      retained: ">=24",
      allowBuild: false,
    },
    {
      name: "missing packaged binary",
      results: [{ stdout: nodeProbe, exitCode: 4 }],
      fragment: "此 T3 Code 构建缺少 WSL 支持",
      retained: "node-pty",
      allowBuild: false,
    },
    {
      name: "build failure",
      results: [
        { stdout: nodeProbe, exitCode: 1 },
        { stdout: "nodeVersion:24.0.0\n", exitCode: 0 },
        { stdout: "", stderr: externalDetail, exitCode: 2 },
      ],
      fragment: "node-pty Linux 构建失败（退出码 2）",
      retained: externalDetail,
      allowBuild: true,
    },
  ])(
    "attaches display provenance to $name without rewriting tool output",
    ({ results, fragment, retained, allowBuild }) =>
      Effect.gen(function* () {
        const wsl = yield* DesktopWslEnvironment.DesktopWslEnvironment;
        const result = yield* wsl.ensureNodePty("Custom Distro", "/mnt/c/User's App", {
          allowBuild,
          nodeEngineRange: ">=24",
        });
        assert.isFalse(result.ok);
        if (result.ok) return;
        assert.isTrue(result.fatal);
        assert.equal(localizeWslFailureReason(result, "en"), result.reason);
        assert.include(localizeWslFailureReason(result, "zh-CN"), fragment);
        assert.include(localizeWslFailureReason(result, "zh-CN"), retained);
        assert.include(result.reason, retained);
      }).pipe(Effect.provide(layerWsl(results))),
  );

  it.effect("keeps raw installation output separate from its localized wrapper", () =>
    Effect.gen(function* () {
      const wsl = yield* DesktopWslEnvironment.DesktopWslEnvironment;
      const result = yield* wsl.prepareRuntime("Custom Distro", {
        windowsPath: "C:\\User's App\\wsl-runtime.tar.gz",
        runtimeId: "runtime-id",
        sha256: "a".repeat(64),
      });
      assert.isFalse(result.ok);
      if (result.ok) return;
      assert.equal(result.reason, `WSL runtime installation failed (exit 2): ${externalDetail}`);
      assert.equal(
        localizeWslFailureReason(result, "zh-CN"),
        `WSL 运行时安装失败（退出码 2）：${externalDetail}`,
      );
    }).pipe(
      Effect.provide(
        layerWsl([
          { stdout: "/mnt/c/User's App/wsl-runtime.tar.gz\n", exitCode: 0 },
          { stdout: "", stderr: externalDetail, exitCode: 2 },
        ]),
      ),
    ),
  );

  it.effect("retains translated provenance through the distro-list error schema", () =>
    Effect.gen(function* () {
      const wsl = yield* DesktopWslEnvironment.DesktopWslEnvironment;
      const error = yield* wsl.probeDistros.pipe(Effect.flip);
      assert.equal(error.message, "wsl.exe --list --verbose exited with code 17");
      assert.equal(
        localizeWslFailureReason(error, "zh-CN"),
        "wsl.exe --list --verbose 已退出，退出码为 17",
      );
    }).pipe(Effect.provide(layerWsl([{ stdout: "", exitCode: 17 }]))),
  );
});
