import { AdvertisedEndpoint } from "@t3tools/contracts";
import { createAdvertisedEndpoint } from "@t3tools/shared/advertisedEndpoint";
import * as Schema from "effect/Schema";
import * as Struct from "effect/Struct";
import { expect, it } from "vite-plus/test";
import { advertisedEndpointLabel } from "./advertisedEndpointMessages";
import { endpointDefaultPreferenceKey } from "./ConnectionsSettings.logic";

const encode = Schema.encodeSync(AdvertisedEndpoint);
const decode = Schema.decodeUnknownSync(AdvertisedEndpoint);
const legacySchema = AdvertisedEndpoint.mapFields(Struct.omit(["labelSource"]));
const decodeLegacy = Schema.decodeUnknownSync(legacySchema);
const jsonRoundTrip = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

it.each([
  ["desktop.this-machine", "This machine", "本机", false],
  ["desktop.local-network", "Local network", "本地网络", false],
  ["desktop.custom-https", "Custom HTTPS", "自定义 HTTPS", true],
  ["desktop.custom-endpoint", "Custom endpoint", "自定义端点", true],
] as const)(
  "round trips %s display provenance without changing raw labels or preference keys",
  (labelSource, label, chinese, manual) => {
    const endpoint = createAdvertisedEndpoint({
      id: "opaque/{id}/$&",
      label,
      labelSource,
      provider: {
        id: manual ? "manual" : "desktop-core",
        label: "opaque provider/{label}/$&",
        kind: manual ? "manual" : "core",
        isAddon: false,
      },
      source: manual ? "user" : "desktop-core",
      httpBaseUrl: "https://example.test:7443",
      reachability: "public",
    });
    const originalKey = endpointDefaultPreferenceKey(endpoint);
    const wire = encode(endpoint);
    const restored = decode(jsonRoundTrip(wire));
    expect(advertisedEndpointLabel(restored, "en")).toBe(label);
    expect(advertisedEndpointLabel(restored, "zh-CN")).toBe(chinese);
    expect(advertisedEndpointLabel(restored, "en")).toBe(label);
    expect(endpointDefaultPreferenceKey(restored)).toBe(originalKey);
    expect(restored).toEqual(endpoint);
    const legacy = decodeLegacy(jsonRoundTrip(wire));
    expect(legacy).not.toHaveProperty("labelSource");
    expect(legacy.label).toBe(label);
    expect(advertisedEndpointLabel(decode(jsonRoundTrip(encode(legacy))), "zh-CN")).toBe(label);
    for (const future of ["future.label", null, 17, { code: labelSource }]) {
      const forward = decode(jsonRoundTrip({ ...wire, labelSource: future }));
      expect(forward.labelSource).toBeUndefined();
      expect(advertisedEndpointLabel(forward, "zh-CN")).toBe(label);
      expect(endpointDefaultPreferenceKey(forward)).toBe(originalKey);
      expect(forward.httpBaseUrl).toBe(endpoint.httpBaseUrl);
    }
    expect(advertisedEndpointLabel({ ...restored, source: "server" }, "zh-CN")).toBe(label);
    expect(
      advertisedEndpointLabel(
        { ...restored, provider: { ...restored.provider, isAddon: true } },
        "zh-CN",
      ),
    ).toBe(label);
    expect(advertisedEndpointLabel({ ...restored, label: "opaque/{label}/$&" }, "zh-CN")).toBe(
      "opaque/{label}/$&",
    );
  },
);
