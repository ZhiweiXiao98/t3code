import { DEFAULT_HOSTED_APP_URL } from "@t3tools/shared/connectAuth";
import { afterEach, expect, it, vi } from "vite-plus/test";

import appleAppSiteAssociation from "../web/public/.well-known/apple-app-site-association.json";
import assetLinks from "../web/public/.well-known/assetlinks.json";

// Keep config parsing independent of local env files and build credentials.
vi.mock("../../scripts/lib/public-config.ts", () => ({
  loadRepoEnv: () =>
    Object.fromEntries(
      ["APP_VARIANT", "T3CODE_MOBILE_VERSION", "T3CODE_MOBILE_VERSION_CODE"]
        .filter((key) => process.env[key] !== undefined)
        .map((key) => [key, process.env[key]]),
    ),
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

async function loadConfig(variant: string | undefined) {
  vi.resetModules();
  vi.stubEnv("APP_VARIANT", variant);
  vi.stubEnv("EXPO_PUBLIC_APP_LOCALE", undefined);
  return (await import("./app.config.ts")).default;
}

it.each(["prod", ""])("rejects APP_VARIANT=%j before selecting production IDs", async (value) => {
  await expect(loadConfig(value)).rejects.toThrow(
    "APP_VARIANT must be community, development, preview, or production.",
  );
});

it.each([
  [undefined, "com.t3tools.t3code"],
  ["development", "com.t3tools.t3code.dev"],
  ["preview", "com.t3tools.t3code.preview"],
  ["production", "com.t3tools.t3code"],
])("keeps the iOS and Android identifiers for APP_VARIANT=%j", async (value, identifier) => {
  const config = await loadConfig(value);
  expect(config.version).toBe("2.3.0");
  expect(config.android?.versionCode).toBe(1);
  expect(config.ios?.bundleIdentifier).toBe(identifier);
  expect(config.android?.package).toBe(identifier);
  // Copied thread links open this app only while app.t3.codes lists it.
  const host = new URL(DEFAULT_HOSTED_APP_URL).host;
  expect(config.ios?.associatedDomains).toContain(`applinks:${host}`);
  expect(appleAppSiteAssociation.applinks.details[0]?.appIDs).toContain(
    `${config.ios?.appleTeamId}.${identifier}`,
  );
  expect(config.android?.intentFilters?.[0]?.data).toEqual([
    { scheme: "https", host, pathPrefix: "/threads/" },
  ]);
  expect(assetLinks.map((link) => link.target.package_name)).toContain(identifier);
});

// The hosted domain's association files register official variants, not the community identity.
it("keeps the community identity and Chinese defaults separate from official variants", async () => {
  const config = await loadConfig("community");
  expect(config.ios?.bundleIdentifier).toBe("com.zhiweixiao.t3code.zhcn");
  expect(config.android?.package).toBe("com.zhiweixiao.t3code.zhcn");
  expect(config.version).toBe("0.1.9-zh.1");
  expect(config.android?.versionCode).toBe(1000416);
  expect(process.env.EXPO_PUBLIC_APP_LOCALE).toBe("zh-CN");
});

it("uses explicit community build metadata without changing official identifiers", async () => {
  vi.stubEnv("T3CODE_MOBILE_VERSION", "0.1.9-zh.1");
  vi.stubEnv("T3CODE_MOBILE_VERSION_CODE", "1000416");
  const config = await loadConfig("community");
  expect(config.version).toBe("0.1.9-zh.1");
  expect(config.android?.versionCode).toBe(1000416);
  expect(config.android?.package).toBe("com.zhiweixiao.t3code.zhcn");
});
