import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { AndroidConfig, compileModsAsync } from "expo/config-plugins";
import { expect, it } from "vite-plus/test";

import withAppLocale from "./withAppLocale.cjs";

function fixture() {
  const projectRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "native-app-locale-"));
  const manifestPath = NodePath.join(projectRoot, "android/app/src/main/AndroidManifest.xml");
  NodeFS.mkdirSync(NodePath.dirname(manifestPath), { recursive: true });
  NodeFS.writeFileSync(
    manifestPath,
    `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <uses-permission android:name="android.permission.INTERNET"/>
      <application android:name=".MainApplication">
        <meta-data android:name="UnrelatedSetting" android:value="keep"/>
        <meta-data android:name="T3AppLocale" android:value="stale"/>
      </application>
    </manifest>`,
  );
  return {
    projectRoot,
    manifestPath,
    [Symbol.dispose]() {
      NodeFS.rmSync(projectRoot, { recursive: true, force: true });
    },
  };
}

it.each([
  ["zh-CN", "zh-CN"],
  ["en", "en"],
  [undefined, "en"],
  ["zh-TW", "en"],
  ["", "en"],
])("writes %j as the same native locale on both platforms", async (locale, expected) => {
  using files = fixture();
  const config = withAppLocale(
    { name: "T3 Code", slug: "t3-code", ios: { infoPlist: { UnrelatedSetting: "keep" } } },
    { locale },
  );
  const ios = await compileModsAsync(config, {
    projectRoot: files.projectRoot,
    platforms: ["ios"],
    introspect: true,
  });
  expect(ios.ios?.infoPlist).toMatchObject({ T3AppLocale: expected, UnrelatedSetting: "keep" });

  for (let pass = 0; pass < 2; pass++) {
    await compileModsAsync(withAppLocale({ name: "T3 Code", slug: "t3-code" }, { locale }), {
      projectRoot: files.projectRoot,
      platforms: ["android"],
    });
    const manifest = await AndroidConfig.Manifest.readAndroidManifestAsync(files.manifestPath);
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    const metadata = application["meta-data"]?.toSorted((left, right) =>
      left.$["android:name"].localeCompare(right.$["android:name"]),
    );
    expect(metadata).toEqual([
      { $: { "android:name": "T3AppLocale", "android:value": expected } },
      { $: { "android:name": "UnrelatedSetting", "android:value": "keep" } },
    ]);
    expect(application.$).toEqual({ "android:name": ".MainApplication" });
    expect(manifest.manifest["uses-permission"]).toEqual([
      { $: { "android:name": "android.permission.INTERNET" } },
    ]);
  }
});
