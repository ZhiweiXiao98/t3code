import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";

const require = NodeModule.createRequire(import.meta.url);
// oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone repair script has no Effect runtime.
const hostPlatform = NodeOS.platform();
// oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone repair script has no Effect runtime.
const hostArch = NodeOS.arch();

function getPlatformPath() {
  switch (hostPlatform) {
    case "darwin":
      return "Electron.app/Contents/MacOS/Electron";
    case "freebsd":
    case "openbsd":
    case "linux":
      return "electron";
    case "win32":
      return "electron.exe";
    default:
      throw new Error(`Electron builds are not available on platform: ${hostPlatform}`);
  }
}

function ensureExecutable(filePath) {
  if (hostPlatform !== "win32") {
    NodeFS.chmodSync(filePath, 0o755);
  }
}

function repairPathFile(electronDir, platformPath) {
  const pathFile = NodePath.join(electronDir, "path.txt");
  const currentPath = NodeFS.existsSync(pathFile)
    ? NodeFS.readFileSync(pathFile, "utf8")
    : undefined;

  if (currentPath !== platformPath) {
    NodeFS.writeFileSync(pathFile, platformPath);
  }
}

function getRequiredRuntimePaths(electronDir, platformPath) {
  const paths = [NodePath.join(electronDir, "dist", platformPath)];

  if (hostPlatform === "darwin") {
    paths.push(
      NodePath.join(electronDir, "dist", "Electron.app", "Contents", "Info.plist"),
      NodePath.join(
        electronDir,
        "dist",
        "Electron.app",
        "Contents",
        "Frameworks",
        "Electron Framework.framework",
        "Electron Framework",
      ),
    );
  }

  return paths;
}

function isMachO(filePath) {
  if (hostPlatform !== "darwin") {
    return true;
  }

  const result = NodeChildProcess.spawnSync("file", ["-b", filePath], {
    encoding: "utf8",
  });

  return result.status === 0 && result.stdout.includes("Mach-O");
}

function missingRuntimePaths(electronDir, platformPath) {
  return getRequiredRuntimePaths(electronDir, platformPath).filter((runtimePath) => {
    return !NodeFS.existsSync(runtimePath);
  });
}

function invalidRuntimePaths(electronDir, platformPath) {
  if (hostPlatform !== "darwin") {
    return [];
  }

  return [
    NodePath.join(electronDir, "dist", platformPath),
    NodePath.join(
      electronDir,
      "dist",
      "Electron.app",
      "Contents",
      "Frameworks",
      "Electron Framework.framework",
      "Electron Framework",
    ),
  ].filter((runtimePath) => NodeFS.existsSync(runtimePath) && !isMachO(runtimePath));
}

function runChecked(command, args) {
  const result = NodeChildProcess.spawnSync(command, args, {
    encoding: "utf8",
    stdio: "inherit",
  });

  if (result.status === 0) {
    return;
  }

  throw new Error(
    `${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`,
  );
}

function sha256(filePath) {
  const hash = NodeCrypto.createHash("sha256");
  hash.update(NodeFS.readFileSync(filePath));
  return hash.digest("hex");
}

function downloadElectronArchive(zipPath, version, archiveName) {
  // oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone repair script reads optional mirror overrides.
  const configuredMirror = process.env.T3_ELECTRON_MIRROR ?? process.env.ELECTRON_MIRROR;
  const mirrorUrls = [configuredMirror, "https://npmmirror.com/mirrors/electron/"]
    .filter(Boolean)
    .map((baseUrl) => `${baseUrl.replace(/\/$/u, "")}/${version}/${archiveName}`);
  const urls = [
    ...mirrorUrls,
    `https://github.com/electron/electron/releases/download/v${version}/${archiveName}`,
  ];
  const partialPath = `${zipPath}.partial`;

  for (const url of [...new Set(urls)]) {
    NodeFS.rmSync(partialPath, { force: true });
    const result = NodeChildProcess.spawnSync(
      "curl",
      ["-fsSL", "--retry", "3", "--retry-delay", "2", url, "-o", partialPath],
      { encoding: "utf8", stdio: "inherit" },
    );
    if (result.status === 0) {
      NodeFS.renameSync(partialPath, zipPath);
      return;
    }
  }

  throw new Error(`Unable to download ${archiveName} from the configured Electron mirrors.`);
}

function installElectronRuntime(electronDir, version, expectedChecksum) {
  const archiveName = `electron-v${version}-${hostPlatform}-${hostArch}.zip`;
  const repoRoot = NodeURL.fileURLToPath(new URL("../../..", import.meta.url));
  const cacheDir = NodePath.join(repoRoot, ".electron-runtime", "downloads");
  const zipPath = NodePath.join(cacheDir, archiveName);

  NodeFS.mkdirSync(cacheDir, { recursive: true });
  if (NodeFS.existsSync(zipPath) && sha256(zipPath) !== expectedChecksum) {
    NodeFS.rmSync(zipPath, { force: true });
  }
  if (!NodeFS.existsSync(zipPath)) {
    downloadElectronArchive(zipPath, version, archiveName);
  }
  if (sha256(zipPath) !== expectedChecksum) {
    NodeFS.rmSync(zipPath, { force: true });
    throw new Error(`Checksum verification failed for ${archiveName}.`);
  }

  const distDir = NodePath.join(electronDir, "dist");
  NodeFS.mkdirSync(distDir, { recursive: true });
  if (hostPlatform === "darwin") {
    runChecked("ditto", ["-x", "-k", zipPath, distDir]);
  } else if (hostPlatform === "win32") {
    runChecked("tar", ["-xf", zipPath, "-C", distDir]);
  } else {
    runChecked("python3", [
      "-c",
      "import os, sys, zipfile; os.makedirs(sys.argv[2], exist_ok=True); zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])",
      zipPath,
      distDir,
    ]);
  }
}

export function ensureElectronRuntime() {
  const electronPackageJsonPath = require.resolve("electron/package.json");
  const electronPackageJson = JSON.parse(NodeFS.readFileSync(electronPackageJsonPath, "utf8"));
  const electronDir = NodePath.dirname(electronPackageJsonPath);
  const archiveName = `electron-v${electronPackageJson.version}-${hostPlatform}-${hostArch}.zip`;
  const checksums = JSON.parse(
    NodeFS.readFileSync(NodePath.join(electronDir, "checksums.json"), "utf8"),
  );
  const expectedChecksum = checksums[archiveName];
  if (typeof expectedChecksum !== "string") {
    throw new Error(`Electron checksum is unavailable for ${archiveName}.`);
  }
  const platformPath = getPlatformPath();
  const electronPath = NodePath.join(electronDir, "dist", platformPath);
  const missingBeforeInstall = missingRuntimePaths(electronDir, platformPath);
  const invalidBeforeInstall = invalidRuntimePaths(electronDir, platformPath);

  if (missingBeforeInstall.length > 0 || invalidBeforeInstall.length > 0) {
    if (NodeFS.existsSync(NodePath.join(electronDir, "dist"))) {
      NodeFS.rmSync(NodePath.join(electronDir, "dist"), { recursive: true, force: true });
    }
    NodeFS.rmSync(NodePath.join(electronDir, "path.txt"), { force: true });
    installElectronRuntime(electronDir, electronPackageJson.version, expectedChecksum);
  }

  const missingAfterInstall = missingRuntimePaths(electronDir, platformPath);
  const invalidAfterInstall = invalidRuntimePaths(electronDir, platformPath);
  if (missingAfterInstall.length > 0 || invalidAfterInstall.length > 0) {
    throw new Error(
      `Electron runtime is incomplete after install.\nMissing:\n${missingAfterInstall
        .map((runtimePath) => `- ${runtimePath}`)
        .join("\n")}\nInvalid:\n${invalidAfterInstall
        .map((runtimePath) => `- ${runtimePath}`)
        .join("\n")}`,
    );
  }

  ensureExecutable(electronPath);
  repairPathFile(electronDir, platformPath);

  return electronPath;
}

// `file://${argv[1]}` never matches on Windows (drive letters need `file:///C:/`).
if (process.argv[1] && NodeURL.pathToFileURL(process.argv[1]).href === import.meta.url) {
  const electronPath = ensureElectronRuntime();
  process.stdout.write(`${electronPath}\n`);
}
