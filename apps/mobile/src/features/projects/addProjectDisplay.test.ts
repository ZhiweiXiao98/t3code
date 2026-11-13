import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import {
  SourceControlProviderKind,
  type SourceControlDiscoveryResult,
  type SourceControlProviderDiscoveryItem,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import { expect, it, vi } from "vite-plus/test";
import {
  addProjectConnectionFailureMessage,
  addProjectSourceRows,
  existingProjectMessage,
} from "./addProjectDisplay";

function provider(
  overrides: Partial<SourceControlProviderDiscoveryItem> = {},
): SourceControlProviderDiscoveryItem {
  return {
    kind: SourceControlProviderKind.make("github"),
    label: "GitHub",
    status: "available",
    version: Option.none(),
    installHint: "Settings",
    detail: Option.none(),
    auth: {
      status: "authenticated",
      account: Option.none(),
      host: Option.none(),
      detail: Option.none(),
    },
    ...overrides,
  };
}

function discovery(
  ...providers: SourceControlProviderDiscoveryItem[]
): SourceControlDiscoveryResult {
  return { versionControlSystems: [], sourceControlProviders: providers };
}

it("separates owned readiness fallbacks from matching remote installation and authentication messages", () => {
  for (const locale of ["en", "zh-CN"] as const) {
    const unavailable = "Provider status unavailable. Open Source Control settings and rescan.";
    const fallback =
      "Settings is not authenticated. Open Source Control settings for setup guidance.";
    for (const remote of ["Settings", "Open", "~/Settings/{0}/$&", unavailable, fallback]) {
      const missing = provider({ status: "missing", installHint: remote });
      const signedOut = provider({
        auth: { ...provider().auth, status: "unauthenticated", detail: Option.some(remote) },
      });
      for (const item of [missing, signedOut]) {
        expect(
          addProjectSourceRows(discovery(item), true, locale).find(
            (row) => row.source === "github",
          ),
        ).toMatchObject({ ready: false, subtitle: remote });
      }
    }
    expect(
      addProjectSourceRows(null, true, locale).find((row) => row.source === "github"),
    ).toMatchObject({
      ready: false,
      subtitle:
        locale === "en" ? unavailable : "提供方状态不可用。请打开源代码管理设置并重新扫描。",
    });
    for (const label of ["Settings", "Open", "{0} $&"])
      expect(
        addProjectSourceRows(
          discovery(
            provider({
              label,
              auth: { ...provider().auth, status: "unauthenticated" },
            }),
          ),
          true,
          locale,
        ).find((row) => row.source === "github"),
      ).toMatchObject({
        ready: false,
        subtitle:
          locale === "en"
            ? `${label} is not authenticated. Open Source Control settings for setup guidance.`
            : `${label} 尚未认证。请打开源代码管理设置查看配置指引。`,
      });
  }
});

it("preserves registry labels and path syntax while permission changes retain source order", () => {
  const originalGet = sourceControlClients.get;
  for (const label of ["Settings", "Open", "{0} $&"]) {
    const pathHint = "{1}/Open/$&";
    using _get = vi.spyOn(sourceControlClients, "get").mockImplementation((kind) => {
      const definition = originalGet(kind);
      return kind === "github"
        ? { ...definition, pickerLabel: label, repositoryPathHint: pathHint }
        : definition;
    });
    const result = discovery(
      provider({ auth: { ...provider().auth, status: "unknown", detail: Option.some("Open") } }),
    );
    for (const locale of ["en", "zh-CN"] as const) {
      const allowed = addProjectSourceRows(result, true, locale);
      const denied = addProjectSourceRows(result, false, locale);
      expect(allowed.find((row) => row.source === "github")).toMatchObject({
        ready: true,
        title: locale === "en" ? `${label} repository` : `${label} 仓库`,
        subtitle: locale === "en" ? `Clone ${label} ${pathHint}` : `克隆 ${label} ${pathHint}`,
      });
      expect(allowed[0]).toMatchObject({
        source: "url",
        ready: true,
        subtitle: locale === "en" ? "Clone from a remote URL" : "从远程 URL 克隆",
      });
      expect(allowed[1]?.source).toBe("github");
      expect(denied.map((row) => row.source)).toEqual(allowed.map((row) => row.source));
      expect(denied.every((row) => !row.ready)).toBe(true);
      for (const row of denied)
        expect(row.subtitle).toBe(
          locale === "en" ? "This connection cannot clone projects." : "此连接无权克隆项目。",
        );
    }
  }
});

it("keeps project titles and workspace paths opaque in both existing-project outcomes", () => {
  for (const locale of ["en", "zh-CN"] as const) {
    for (const value of ["Settings", "Open", "{0}/$&", "Open\n{1}"]) {
      expect(existingProjectMessage(value, true, locale)).toBe(value);
      expect(existingProjectMessage(value, false, locale)).toBe(
        locale === "en"
          ? `${value} is still archived. Try again later.`
          : `${value} 仍处于归档状态。请稍后重试。`,
      );
      expect(addProjectConnectionFailureMessage(value, locale)).toBe(
        locale === "en"
          ? `This connection cannot add projects right now. Any existing files remain at ${value}.`
          : `此连接目前无法添加项目。现有文件仍保留在 ${value}。`,
      );
    }
  }
});
