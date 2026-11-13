import * as mobileStrings from "../../i18n/mobileStrings";
import { EnvironmentId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  createProviderCatalogRefreshRunner,
  providerCatalogRefreshError,
} from "./provider-catalog-refresh";

describe("mobile provider catalog refresh", () => {
  it("requests model discovery for the selected environment and deduplicates pending taps", async () => {
    let resolveRefresh: ((value: "refreshed") => void) | undefined;
    const refreshProviders = vi.fn(
      () =>
        new Promise<"refreshed">((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    const refresh = createProviderCatalogRefreshRunner(refreshProviders);
    const environmentId = EnvironmentId.make("environment-mobile");

    const first = refresh(environmentId);
    const second = refresh(environmentId);

    expect(second).toBe(first);
    expect(refreshProviders).toHaveBeenCalledOnce();
    expect(refreshProviders).toHaveBeenCalledWith({
      environmentId,
      input: { refreshModels: true },
    });

    resolveRefresh?.("refreshed");
    await expect(first).resolves.toBe("refreshed");
  });

  it("reports a discovery error and allows retry after the failed command settles", async () => {
    const failure = AsyncResult.failure<never, Error>(Cause.fail(new Error("discovery failed")));
    const success = AsyncResult.success("refreshed");
    let callCount = 0;
    const refreshProviders = vi.fn(async () => (callCount++ === 0 ? failure : success));
    const refresh = createProviderCatalogRefreshRunner(refreshProviders);
    const environmentId = EnvironmentId.make("environment-mobile");

    expect(providerCatalogRefreshError(await refresh(environmentId))).toBe("discovery failed");
    expect(providerCatalogRefreshError(await refresh(environmentId))).toBeNull();
    expect(refreshProviders).toHaveBeenCalledTimes(2);
    const localize = mobileStrings.localizeMobileString;
    for (const locale of ["en", "zh-CN"] as const) {
      using localeSpy = vi
        .spyOn(mobileStrings, "localizeMobileString")
        .mockImplementation((message) => localize(message, locale));
      for (const message of ["Settings", "Provider discovery failed.", "{0} $&", ""]) {
        expect(
          providerCatalogRefreshError(AsyncResult.failure(Cause.fail(new Error(message)))),
        ).toBe(message);
      }
      expect(localeSpy).not.toHaveBeenCalled();
      expect(providerCatalogRefreshError(AsyncResult.failure(Cause.fail(null)))).toBe(
        locale === "en" ? "Provider discovery failed." : "提供方发现失败。",
      );
      expect(localeSpy).toHaveBeenCalledOnce();
      expect(providerCatalogRefreshError(AsyncResult.failure(Cause.interrupt(1)))).toBeNull();
    }
  });
});
