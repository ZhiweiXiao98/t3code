import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import type { ThirdPartyLicenseIssue } from "@t3tools/shared/thirdPartyLicenses";
const messages = {
  "entry-not-object": ["License entry {value} is not an object.", "许可证条目 {value} 不是对象。"],
  "entry-invalid": [
    "License entry {value} has an invalid shape.",
    "许可证条目 {value} 的结构无效。",
  ],
  "format-unsupported": [
    "The open-source license manifest has an unsupported format.",
    "开源许可证清单的格式不受支持。",
  ],
  "entry-duplicate": [
    "The open-source license manifest contains a duplicate entry: {value}",
    "开源许可证清单包含重复条目：{value}",
  ],
} as const;
export function licenseIssueMessage(
  issue: ThirdPartyLicenseIssue,
  locale: ResolvedAppLocale,
): string {
  return messages[issue.code][locale === "zh-CN" ? 1 : 0].replace("{value}", () => issue.value);
}
