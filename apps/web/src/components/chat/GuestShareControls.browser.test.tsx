import "~/index.css";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult, Atom } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { appAtomRegistry, AppAtomRegistryProvider } from "../../rpc/atomRegistry";
import { guestShareDialogThreadAtom } from "./guestShareDialogState";

const fixture = vi.hoisted(() => ({
  create: vi.fn(),
  permission: null as unknown,
  copy: vi.fn(),
}));
vi.mock("../../state/server", async (original) => {
  const actual = await original<typeof import("../../state/server")>();
  return {
    ...actual,
    serverEnvironment: {
      ...actual.serverEnvironment,
      createGuestShare: { permissionAtom: () => fixture.permission },
    },
  };
});
vi.mock("../../state/use-atom-command", async (original) => ({
  ...(await original<typeof import("../../state/use-atom-command")>()),
  useAtomCommand: () => fixture.create,
}));
vi.mock("../../state/entities", async (original) => ({
  ...(await original<typeof import("../../state/entities")>()),
  useQuietThreadProjection: () => null,
}));
vi.mock("../../hooks/useCopyToClipboard", async (original) => ({
  ...(await original<typeof import("../../hooks/useCopyToClipboard")>()),
  useCopyToClipboard: () => ({ copyToClipboard: fixture.copy, isCopied: false }),
}));
import { GuestShareDialogHost } from "./GuestShareControls";
const thread = {
  environmentId: EnvironmentId.make("mock-environment"),
  threadId: ThreadId.make("mock-thread"),
};
function setup(allowed = true) {
  fixture.permission = Atom.make(allowed);
  appAtomRegistry.set(guestShareDialogThreadAtom, thread);
  fixture.create.mockReset().mockResolvedValue(AsyncResult.failure(Cause.fail(null)));
  fixture.copy.mockReset().mockResolvedValue(undefined);
  return {
    [Symbol.dispose]() {
      appAtomRegistry.set(guestShareDialogThreadAtom, null);
    },
  };
}
function surface(locale: "en" | "zh-CN") {
  return (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => undefined,
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <AppAtomRegistryProvider>
        <GuestShareDialogHost />
      </AppAtomRegistryProvider>
    </WebI18nContext>
  );
}
const alertText = () => document.querySelector('[role="alert"]')?.textContent;
it("keeps owned guest creation failure current without creating another link", async () => {
  using _session = setup();
  let finish!: (result: ReturnType<typeof AsyncResult.failure>) => void;
  fixture.create.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await using screen = await render(surface("en"));
  await page.getByRole("button", { name: "Create link", exact: true }).click();
  await expect
    .element(page.getByRole("button", { name: "Creating...", exact: true }))
    .toBeDisabled();
  await expect.element(page.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
  await screen.rerender(surface("zh-CN"));
  finish(AsyncResult.failure(Cause.fail(null)));
  await expect.poll(alertText).toBe("无法创建访客链接。");
  for (const locale of ["en", "zh-CN", "en"] as const) {
    await screen.rerender(surface(locale));
    await expect
      .poll(alertText)
      .toBe(locale === "en" ? "Could not create a guest link." : "无法创建访客链接。");
  }
  expect(fixture.create).toHaveBeenCalledExactlyOnceWith({
    environmentId: thread.environmentId,
    input: { threadId: thread.threadId },
  });
  expect(fixture.copy).not.toHaveBeenCalled();
});
it.each(["Could not create a guest link.", ""])(
  "preserves raw guest creation failure %j",
  async (message) => {
    using _session = setup();
    fixture.create.mockResolvedValue(AsyncResult.failure(Cause.fail(new Error(message))));
    await using screen = await render(surface("en"));
    await page.getByRole("button", { name: "Create link", exact: true }).click();
    for (const locale of ["en", "zh-CN", "en"] as const) {
      await screen.rerender(surface(locale));
      await expect.element(page.getByRole("alert")).toBeInTheDocument();
      await expect.poll(alertText).toBe(message);
    }
    expect(fixture.create).toHaveBeenCalledTimes(1);
  },
);
it("returns interrupted guest creation to idle without an error", async () => {
  using _session = setup();
  fixture.create.mockResolvedValue(AsyncResult.failure(Cause.interrupt()));
  await using _screen = await render(surface("en"));
  await page.getByRole("button", { name: "Create link", exact: true }).click();
  await expect
    .element(page.getByRole("button", { name: "Create link", exact: true }))
    .toBeEnabled();
  await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
  expect(fixture.create).toHaveBeenCalledTimes(1);
});
it("disables guest creation without permission", async () => {
  using _session = setup(false);
  await using _screen = await render(surface("en"));
  await expect
    .element(page.getByRole("button", { name: "Create link", exact: true }))
    .toBeDisabled();
  expect(fixture.create).not.toHaveBeenCalled();
});
it("clears a failed guest creation when retry is interrupted", async () => {
  using _session = setup();
  fixture.create
    .mockResolvedValueOnce(AsyncResult.failure(Cause.fail(null)))
    .mockResolvedValueOnce(AsyncResult.failure(Cause.interrupt()));
  await using _screen = await render(surface("en"));
  await page.getByRole("button", { name: "Create link", exact: true }).click();
  await expect.poll(alertText).toBe("Could not create a guest link.");
  await page.getByRole("button", { name: "Create link", exact: true }).click();
  await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
  expect(fixture.create).toHaveBeenCalledTimes(2);
});
