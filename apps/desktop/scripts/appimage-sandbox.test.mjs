import * as HostProcess from "@t3tools/shared/HostProcess";
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeModule from "node:module";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { assert, describe, it } from "vite-plus/test";

const require = NodeModule.createRequire(import.meta.url);
const builderRequire = NodeModule.createRequire(require.resolve("electron-builder/package.json"));
const { generateAppRunScript } = builderRequire(
  "app-builder-lib/out/targets/appimage/appImageUtil.js",
);

// AppImage launchers use POSIX Bash and executable modes; Windows does not run this package.
describe.skipIf(HostProcess.Platform.defaultValue() === "win32")(
  "packaged AppImage sandbox arguments",
  () => {
    const cases = ["success", "failure", "missing"].flatMap((probe) =>
      [[], ["--user-data-dir=/tmp/profile with spaces", "project name"]].map((args) => ({
        probe,
        args,
      })),
    );
    it.each(cases)("preserves $args with $probe unshare", async ({ probe, args }) => {
      const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-apprun-"));
      try {
        const bin = NodePath.join(root, "bin");
        await NodeFSP.mkdir(bin);
        if (probe !== "missing") {
          await NodeFSP.writeFile(
            NodePath.join(bin, "unshare"),
            `#!/bin/bash\nexit ${probe === "success" ? 0 : 1}\n`,
            { mode: 0o755 },
          );
        }
        const capture = NodePath.join(root, "arguments.json");
        await NodeFSP.writeFile(
          NodePath.join(root, "capture.cjs"),
          "require('node:fs').writeFileSync(process.env.T3_TEST_CAPTURE, JSON.stringify(process.argv.slice(2)));\n",
        );
        await NodeFSP.writeFile(
          NodePath.join(root, "t3code"),
          `#!/bin/bash\nexec '${process.execPath.replaceAll("'", "'\\''")}' "$APPDIR/capture.cjs" "$@"\n`,
          { mode: 0o755 },
        );
        const launcher = NodePath.join(root, "AppRun");
        await NodeFSP.writeFile(launcher, generateAppRunScript({ ExecutableName: "t3code" }));
        NodeChildProcess.execFileSync("/bin/bash", [launcher, ...args], {
          env: { APPDIR: root, PATH: bin, T3_TEST_CAPTURE: capture },
          encoding: "utf8",
        });
        assert.deepEqual(JSON.parse(await NodeFSP.readFile(capture, "utf8")), args);
      } finally {
        await NodeFSP.rm(root, { recursive: true, force: true });
      }
    });
  },
);
