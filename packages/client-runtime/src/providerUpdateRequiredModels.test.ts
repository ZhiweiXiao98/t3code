import { ProviderDriverKind, type ServerProvider } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { formatProviderUpdateRequiredNotice } from "./providerUpdateRequiredModels.ts";

const models = [
  { slug: "alpha", name: "Settings", minVersion: "1.9.0" },
  { slug: "beta", name: "Open, and {0} $&", minVersion: "v1.10.0" },
  { slug: "gamma", name: "Unknown", minVersion: "1.2.0" },
];
const provider: Pick<ServerProvider, "driver" | "updateRequiredModels"> = {
  driver: ProviderDriverKind.make("codex"),
  updateRequiredModels: models,
};

it("keeps default English, catalog order and highest-version selection across filtered model lists", () => {
  expect(formatProviderUpdateRequiredNotice(provider)).toBe(
    "Update the Codex CLI to v1.10.0 or newer to use Settings, Open, and {0} $&, and Unknown.",
  );
  expect(
    formatProviderUpdateRequiredNotice({ ...provider, updateRequiredModels: models.slice(0, 2) }),
  ).toBe("Update the Codex CLI to v1.10.0 or newer to use Settings and Open, and {0} $&.");
  expect(formatProviderUpdateRequiredNotice(provider, "  ALPHA ")).toBe(
    "Update the Codex CLI to v1.9.0 or newer to use Settings.",
  );
  expect(formatProviderUpdateRequiredNotice(provider, "settings")).toBe(
    "Update the Codex CLI to v1.9.0 or newer to use Settings.",
  );
  expect(formatProviderUpdateRequiredNotice(provider, "missing")).toBeNull();
});

it("formats owned templates while never passing opaque model names or driver IDs as templates", () => {
  const before = structuredClone(provider);
  const seen: string[] = [];
  const format = vi.fn((template: string, values: ReadonlyArray<string>) => {
    seen.push(template);
    return `[${template.replace(/\{(\d+)\}/g, (token, index: string) => values[Number(index)] ?? token)}]`;
  });
  const result = formatProviderUpdateRequiredNotice(provider, "", format);
  expect(result).toBe(
    "[Update [the Codex CLI] to v1.10.0 or newer to use [[Settings, Open, and {0} $&], and Unknown].]",
  );
  expect(seen).toEqual([
    "the Codex CLI",
    "{0}, {1}",
    "{0}, and {1}",
    "Update {0} to {1} or newer to use {2}.",
  ]);
  expect(provider).toEqual(before);
  format.mockClear();
  expect(formatProviderUpdateRequiredNotice(provider, "missing", format)).toBeNull();
  expect(format).not.toHaveBeenCalled();
  const custom = {
    ...provider,
    driver: ProviderDriverKind.make("Settings"),
    updateRequiredModels: models.slice(0, 1),
  };
  expect(formatProviderUpdateRequiredNotice(custom, "", format)).toBe(
    "[Update Settings to v1.9.0 or newer to use Settings.]",
  );
  expect(format).toHaveBeenCalledExactlyOnceWith("Update {0} to {1} or newer to use {2}.", [
    "Settings",
    "v1.9.0",
    "Settings",
  ]);
});
