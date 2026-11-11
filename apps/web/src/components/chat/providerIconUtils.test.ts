import { ProviderDriverKind } from "@t3tools/contracts";
import { expect, it } from "vite-plus/test";
import { getDisplayModelName, getTriggerDisplayModelName } from "./providerIconUtils";

it("localizes reserved automatic model selection without changing provider data", () => {
  const model = Object.freeze({ slug: "auto", name: "Auto" });
  for (const driver of ["cursor", "kiro"] as const) {
    const driverKind = ProviderDriverKind.make(driver);
    expect(getDisplayModelName(model, { driverKind, locale: "zh-CN" })).toBe("自动");
    expect(getTriggerDisplayModelName(model, driverKind, "zh-CN")).toBe("自动");
    expect(getDisplayModelName(model, { driverKind, locale: "en" })).toBe("Auto");
    expect(
      getDisplayModelName({ ...model, name: "My custom Auto" }, { driverKind, locale: "zh-CN" }),
    ).toBe("My custom Auto");
    expect(getDisplayModelName({ ...model, slug: "custom" }, { driverKind, locale: "zh-CN" })).toBe(
      "Auto",
    );
    expect(
      getTriggerDisplayModelName({ ...model, shortName: "My Auto" }, driverKind, "zh-CN"),
    ).toBe("My Auto");
  }
  expect(
    getDisplayModelName(model, {
      driverKind: ProviderDriverKind.make("opencode"),
      locale: "zh-CN",
    }),
  ).toBe("Auto");
  expect(
    getDisplayModelName(
      { ...model, subProvider: "custom" },
      { driverKind: ProviderDriverKind.make("cursor"), locale: "zh-CN" },
    ),
  ).toBe("Auto");
  const kiro = ProviderDriverKind.make("kiro");
  const defaultAuto = { slug: "default", name: "Auto", isDefault: true, aliases: ["auto"] };
  expect(getDisplayModelName(defaultAuto, { driverKind: kiro, locale: "zh-CN" })).toBe("自动");
  expect(getTriggerDisplayModelName(defaultAuto, kiro, "zh-CN")).toBe("自动");
  expect(
    getDisplayModelName(
      { ...defaultAuto, aliases: ["named-model"] },
      { driverKind: kiro, locale: "zh-CN" },
    ),
  ).toBe("Auto");
  expect(
    getDisplayModelName(
      { ...defaultAuto, isDefault: false },
      { driverKind: kiro, locale: "zh-CN" },
    ),
  ).toBe("Auto");
  expect(
    getDisplayModelName({ ...defaultAuto, name: "Claude" }, { driverKind: kiro, locale: "zh-CN" }),
  ).toBe("Claude");
  expect(model).toEqual({ slug: "auto", name: "Auto" });
});
