import type { EnvironmentCatalogState } from "@t3tools/client-runtime/state/connections";
import { primaryEnvironmentIdAtom } from "~/state/primaryEnvironment";
import "~/index.css";
import { RegistryContext } from "@effect/atom-react";
import { EnvironmentId, type DatabaseStorageStatus } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult, AtomRegistry } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { act, render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";

const fixture = vi.hoisted(() => ({ locale: "en" as "en" | "zh-CN", reclaim: vi.fn() }));
vi.mock("~/connection/catalog", async (original) => {
  const actual = await original<typeof import("~/connection/catalog")>();
  const { Atom } = await import("effect/reactivity");
  return {
    ...actual,
    environmentCatalog: {
      ...actual.environmentCatalog,
      catalogValueAtom: Atom.make<EnvironmentCatalogState>({ isReady: true, entries: new Map() }),
    },
  };
});
vi.mock("../../state/server", async (original) => {
  const actual = await original<typeof import("../../state/server")>();
  const { Atom } = await import("effect/reactivity");
  const { EnvironmentId } = await import("@t3tools/contracts");
  const status: DatabaseStorageStatus = {
    databaseBytes: 4 * 1024 ** 3,
    reclaimableBytes: 2 * 1024 ** 3,
    incrementalVacuumEnabled: false,
    compactCommand: "fixture command never executed",
    canReclaim: true,
  };
  const recommendations = Atom.make([
    { environmentId: EnvironmentId.make("reclaim-fixture"), status },
  ]);
  const permission = Atom.make(true);
  return {
    ...actual,
    serverEnvironment: {
      ...actual.serverEnvironment,
      databaseCompactionRecommendations: () => recommendations,
      reclaimDatabaseSpace: {
        ...actual.serverEnvironment.reclaimDatabaseSpace,
        permissionAtom: () => permission,
      },
    },
  };
});
vi.mock("../../state/use-atom-command", async (original) => {
  const actual = await original<typeof import("../../state/use-atom-command")>();
  return {
    ...actual,
    useAtomCommand: ((command, options) =>
      (command as unknown) === serverEnvironment.reclaimDatabaseSpace
        ? fixture.reclaim
        : actual.useAtomCommand(command, options)) as typeof actual.useAtomCommand,
  };
});
vi.mock("../../i18n/readWebI18n", async (original) => ({
  ...(await original<typeof import("../../i18n/readWebI18n")>()),
  readWebI18n: () => {
    const locale = fixture.locale;
    return {
      locale,
      t: (
        key: Parameters<typeof translateWebMessage>[1],
        values: Parameters<typeof translateWebMessage>[2],
      ) => translateWebMessage(locale, key, values),
    };
  },
}));
import { serverEnvironment } from "../../state/server";
import { toastManager } from "../ui/toast";
import { DatabaseStorageNotice } from "./DatabaseStorageNotice";

it.each(["owned", "raw", "empty", "interrupted", "cancel"] as const)(
  "uses settlement locale for database reclaim failure: %s",
  async (kind) => {
    fixture.locale = "en";
    fixture.reclaim.mockReset();
    using stack = new DisposableStack();
    const registry = stack.adopt(AtomRegistry.make(), (value) => value.dispose());
    expect(registry.get(primaryEnvironmentIdAtom)).toBeNull();
    stack.defer(() => {
      fixture.locale = "en";
    });
    const originalGet = Storage.prototype.getItem;
    using get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (
      this: Storage,
      key,
    ) {
      return key === "database-storage-notice-dismissed" ? null : originalGet.call(this, key);
    });
    using set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    using toast = vi.spyOn(toastManager, "add").mockImplementation(() => "fixture-toast");
    const environmentId = EnvironmentId.make("reclaim-fixture");
    const label = "Literal $& {environment}";
    let finish!: (result: AsyncResult.AsyncResult<never, unknown>) => void;
    const pending = new Promise<AsyncResult.AsyncResult<never, unknown>>((resolve) => {
      finish = resolve;
    });
    fixture.reclaim.mockReturnValue(pending);
    const surface = (locale: "en" | "zh-CN") => (
      <WebI18nContext
        value={{
          locale,
          appLocale: locale,
          setAppLocale: () => {},
          t: (key, values) => translateWebMessage(locale, key, values),
        }}
      >
        <RegistryContext.Provider value={registry}>
          <DatabaseStorageNotice environments={[{ environmentId, label }]} />
        </RegistryContext.Provider>
      </WebI18nContext>
    );
    await using screen = await render(surface("en"));
    await using _drain = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          finish(AsyncResult.failure(Cause.interrupt()));
          await pending;
        });
      },
    };
    await screen.getByRole("button", { name: "Reclaim", exact: true }).click();
    const confirm = page.getByRole("button", { name: "Restart and reclaim", exact: true });
    await expect.element(confirm).toBeVisible();
    expect(fixture.reclaim).not.toHaveBeenCalled();
    if (kind === "cancel") {
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect.element(confirm).not.toBeInTheDocument();
      expect(fixture.reclaim).not.toHaveBeenCalled();
      expect(toast).not.toHaveBeenCalled();
    } else {
      await confirm.click();
      expect(fixture.reclaim).toHaveBeenCalledExactlyOnceWith({ environmentId, input: {} });
      const restarting = screen.getByRole("button", { name: "Restarting…", exact: true });
      await expect.element(restarting).toBeDisabled();
      await act(() => {
        restarting
          .element()
          .dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
      });
      expect(fixture.reclaim).toHaveBeenCalledTimes(1);
      expect(toast).not.toHaveBeenCalled();
      fixture.locale = "zh-CN";
      await screen.rerender(surface("zh-CN"));
      await act(async () => {
        finish(
          AsyncResult.failure(
            kind === "interrupted"
              ? Cause.interrupt()
              : Cause.fail(
                  kind === "raw"
                    ? new Error("Literal $& {reclaim}")
                    : kind === "empty"
                      ? new Error("")
                      : null,
                ),
          ),
        );
        await pending;
      });
      if (kind === "interrupted") expect(toast).not.toHaveBeenCalled();
      else
        expect(toast).toHaveBeenCalledExactlyOnceWith({
          type: "error",
          title: `无法回收 ${label} 上的空间`,
          description:
            kind === "raw" ? "Literal $& {reclaim}" : kind === "empty" ? "" : "发生错误。",
        });
      fixture.locale = "en";
      await screen.rerender(surface("en"));
      expect(toast).toHaveBeenCalledTimes(kind === "interrupted" ? 0 : 1);
      expect(fixture.reclaim).toHaveBeenCalledTimes(1);
    }
    await expect
      .element(screen.getByRole("button", { name: "Reclaim", exact: true }))
      .toBeEnabled();
    expect(set).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledWith("database-storage-notice-dismissed");
  },
);
