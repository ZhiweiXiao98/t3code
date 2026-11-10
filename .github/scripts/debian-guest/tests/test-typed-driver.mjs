import * as NodeFS from "node:fs";
import * as NodeAssert from "node:assert/strict";
const s = NodeFS.readFileSync(new URL("../check-debian-cjk-ui.mjs", import.meta.url), "utf8");
const start = s.indexOf('if (values.kind === "appimage") {');
const end = s.indexOf("NodeAssert.equal(digest(NodeFS.readFileSync(new URL", start);
NodeAssert.ok(start > 0 && end > start);
const check = new Function(
  "values",
  "manifest",
  "NodeFS",
  "NodeChildProcess",
  "NodeAssert",
  s.slice(start, end),
);
const distroStart = s.indexOf("NodeAssert.equal(distro.ID, values.kind");
const distroEnd = s.indexOf("const { _electron }", distroStart);
const oscheck = new Function("values", "distro", "NodeAssert", s.slice(distroStart, distroEnd));
function run(
  kind,
  mode,
  same,
  owner = "t3code",
  id = kind === "deb" ? "ubuntu" : "debian",
  version = kind === "deb" ? "24.04" : "13",
) {
  const values = { kind, asset: "asset", executable: same ? "asset" : "exe" };
  check(
    values,
    {
      mode,
      installerSha256: "a",
      executableSha256: kind === "appimage" ? "a" : "b",
      debPackage: "t3code",
    },
    { realpathSync: (x) => x },
    { execFileSync: () => owner + ": /opt/t3code" },
    NodeAssert,
  );
  oscheck(values, { ID: id, VERSION_ID: version }, NodeAssert);
}
run("appimage", "same-full-run-debian13-v1", true);
run("deb", "same-full-run-native-deb-v1", false);
for (const a of [
  ["appimage", "same-full-run-debian13-v1", false],
  ["deb", "same-full-run-native-deb-v1", true],
  ["deb", "same-full-run-debian13-v1", false],
  ["deb", "same-full-run-native-deb-v1", false, "other"],
  ["deb", "same-full-run-native-deb-v1", false, "t3code", "debian", "13"],
  ["appimage", "same-full-run-debian13-v1", true, "t3code", "ubuntu", "24.04"],
])
  NodeAssert.throws(() => run(...a));
const tail = s.match(
  /NodeAssert\.equal\(digest\(NodeFS\.readFileSync\(values\.asset\)\), expected\.installer\);/g,
);
NodeAssert.equal(tail.length, 2);
const endCheck = new Function("NodeAssert", "digest", "NodeFS", "values", "expected", tail[1]);
endCheck(
  NodeAssert,
  (x) => x,
  { readFileSync: () => "verified-hash" },
  { asset: "synthetic" },
  { installer: "verified-hash" },
);
NodeAssert.throws(() =>
  endCheck(
    NodeAssert,
    (x) => x,
    { readFileSync: () => "changed-hash" },
    { asset: "synthetic" },
    { installer: "verified-hash" },
  ),
);
console.log(
  "10 actual-JavaScript typed runtime and final asset-integrity cases passed; no app execution",
);
