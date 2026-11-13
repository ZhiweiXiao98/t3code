import {
  decodeThirdPartyLicenseManifest,
  thirdPartyLicenseIssue,
} from "@t3tools/shared/thirdPartyLicenses";
import { expect, it } from "vite-plus/test";
import { licenseIssueMessage } from "./licenseIssueMessage";

const entry = {
  kind: "package",
  bundles: ["web"],
  license: "MIT",
  name: "opaque/{value}/$&",
  version: "1",
  noticeText: "literal/{notice}/$&",
  sourceUrl: null,
};
it("presents actual decoder failures in the current locale while keeping raw Error and duplicate key data", () => {
  for (const [input, expected] of [
    [null, "开源许可证清单的格式不受支持。"],
    [{ schemaVersion: 1, entries: [null] }, "许可证条目 1 不是对象。"],
    [{ schemaVersion: 1, entries: [{}] }, "许可证条目 1 的结构无效。"],
    [{ schemaVersion: 1, entries: [entry, entry] }, null],
  ] as const) {
    let failure: unknown;
    try {
      decodeThirdPartyLicenseManifest(input);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error)) throw new Error("Expected decoder failure");
    const raw = failure.message;
    const issue = thirdPartyLicenseIssue(failure);
    if (!issue) throw new Error("Expected local decoder provenance");
    expect(licenseIssueMessage(issue, "en")).toBe(raw);
    expect(licenseIssueMessage(issue, "zh-CN")).toBe(
      expected ?? `开源许可证清单包含重复条目：${issue.value}`,
    );
    if (expected === null) {
      const rawKey = JSON.stringify([entry.kind, entry.name, entry.version]);
      expect(issue.value).toBe(encodeURIComponent(rawKey));
      expect(decodeURIComponent(issue.value)).toBe(rawKey);
      expect(raw).toBe(
        `The open-source license manifest contains a duplicate entry: ${issue.value}`,
      );
    }
    expect(failure.message).toBe(raw);
    expect(licenseIssueMessage(issue, "en")).toBe(raw);
    expect(thirdPartyLicenseIssue(new Error(raw))).toBeUndefined();
    expect(
      thirdPartyLicenseIssue({ ...failure, message: raw, code: issue.code, value: issue.value }),
    ).toBeUndefined();
  }
  expect(
    decodeThirdPartyLicenseManifest({ schemaVersion: 1, entries: [entry] }).entries[0],
  ).toEqual(entry);
});
