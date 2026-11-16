import "~/index.css";
import { RegistryContext } from "@effect/atom-react";
import { EnvironmentId, PeerLinkSummary } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as DateTime from "effect/DateTime";
import * as Cause from "effect/Cause";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { act, render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";

const fixture = vi.hoisted(() => ({
  locale: "en" as "en" | "zh-CN",
  unlink: vi.fn(),
  direct: false,
  createLink: vi.fn(),
  mint: vi.fn(),
  confirm: vi.fn(),
}));
vi.mock("~/confirmDialog", async (original) => ({
  ...(await original<typeof import("~/confirmDialog")>()),
  requestConfirmDialog: fixture.confirm,
}));
vi.mock("~/state/use-atom-command", async (original) => {
  const actual = await original<typeof import("~/state/use-atom-command")>();
  return {
    ...actual,
    useAtomCommand: ((command, options) =>
      (command as unknown) === peerLinkEnvironment.unlink
        ? fixture.unlink
        : fixture.direct && (command as unknown) === peerLinkEnvironment.link
          ? fixture.createLink
          : actual.useAtomCommand(command, options)) as typeof actual.useAtomCommand,
  };
});
vi.mock("~/state/peerLinks", async (original) => {
  const actual = await original<typeof import("~/state/peerLinks")>();
  return {
    ...actual,
    useLinkableMachines: (...args: Parameters<typeof actual.useLinkableMachines>) =>
      fixture.direct ? [] : actual.useLinkableMachines(...args),
  };
});
vi.mock("~/state/peerPairingCode", async (original) => ({
  ...(await original<typeof import("~/state/peerPairingCode")>()),
  mintPairingCodeOn: fixture.mint,
}));
vi.mock("~/i18n/readWebI18n", async (original) => ({
  ...(await original<typeof import("~/i18n/readWebI18n")>()),
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
import { peerLinkEnvironment } from "../../state/peerLinks";
import { toastManager } from "../ui/toast";
import { LinkedEnvironmentsSettings } from "./LinkedEnvironmentsSettings";
const environmentId = EnvironmentId.make("local-fixture");
const link = Schema.decodeSync(PeerLinkSummary)({
  environmentId: "remote-fixture",
  label: "Literal $& {peer}",
  urls: ["https://fixture.invalid"],
  access: "read-only",
  linkedAt: DateTime.makeUnsafe("2026-01-01T00:00:00Z"),
  expiresAt: DateTime.makeUnsafe("2100-01-01T00:00:00Z"),
  lastReachedAt: null,
  lastError: null,
  status: "reachable",
});
const loaded = AsyncResult.success({ links: [link] });
const links = Atom.make(loaded);
const allowed = Atom.make(true);
const denied = Atom.make(false);
it.each(["owned", "raw", "empty", "interrupted", "cancel", "denied"] as const)(
  "uses settlement locale for linked environment forget failure: %s",
  async (kind) => {
    fixture.locale = "en";
    fixture.unlink.mockReset();
    fixture.confirm.mockReset().mockResolvedValue(kind !== "cancel");
    using stack = new DisposableStack();
    const registry = stack.adopt(AtomRegistry.make(), (r) => r.dispose());
    stack.defer(() => {
      fixture.locale = "en";
    });
    using _list = vi.spyOn(peerLinkEnvironment, "list").mockReturnValue(links);
    using _linkPermission = vi
      .spyOn(peerLinkEnvironment.link, "permissionAtom")
      .mockReturnValue(denied);
    using _unlinkPermission = vi
      .spyOn(peerLinkEnvironment.unlink, "permissionAtom")
      .mockReturnValue(kind === "denied" ? denied : allowed);
    using toast = vi.spyOn(toastManager, "add").mockImplementation(() => "fixture");
    let finish!: (result: ReturnType<typeof AsyncResult.failure>) => void;
    const pending = new Promise<ReturnType<typeof AsyncResult.failure>>((resolve) => {
      finish = resolve;
    });
    fixture.unlink.mockReturnValue(pending);
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
          <LinkedEnvironmentsSettings
            environmentId={environmentId}
            environmentLabel={null}
            isSearchTarget={false}
          />
        </RegistryContext.Provider>
      </WebI18nContext>
    );
    await using screen = await render(surface("en"));
    expect(_list).toHaveBeenCalledWith({ environmentId, input: {} });
    await using _drain = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          finish(AsyncResult.failure(Cause.interrupt()));
          await pending;
        });
      },
    };
    if (kind === "denied") {
      await expect.element(screen.getByText(link.label, { exact: true })).toBeVisible();
      expect(screen.getByRole("button", { name: "Forget", exact: true }).query()).toBeNull();
      expect(fixture.confirm).not.toHaveBeenCalled();
      expect(fixture.unlink).not.toHaveBeenCalled();
      return;
    }
    await screen.getByRole("button", { name: "Forget", exact: true }).click();
    expect(fixture.confirm).toHaveBeenCalledExactlyOnceWith(
      `Forget ${link.label}? Agents here stop working there. Revoke "T3 Code · …" in ${link.label}'s Connections to end the session there too.`,
      { variant: "destructive" },
    );
    if (kind === "cancel") {
      expect(fixture.unlink).not.toHaveBeenCalled();
      expect(toast).not.toHaveBeenCalled();
      return;
    }
    expect(fixture.unlink).toHaveBeenCalledExactlyOnceWith({
      environmentId,
      input: { environmentId: link.environmentId },
    });
    expect(fixture.confirm.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.unlink.mock.invocationCallOrder[0]!,
    );
    await expect
      .element(screen.getByRole("button", { name: "Forgetting…", exact: true }))
      .toBeDisabled();
    fixture.locale = "zh-CN";
    await screen.rerender(surface("zh-CN"));
    expect(toast).not.toHaveBeenCalled();
    await act(async () => {
      finish(
        AsyncResult.failure(
          kind === "interrupted"
            ? Cause.interrupt()
            : Cause.fail(
                kind === "owned"
                  ? null
                  : new Error(kind === "raw" ? "literal $& {diagnostic}" : ""),
              ),
        ),
      );
      await pending;
    });
    await expect
      .element(screen.getByRole("button", { name: "移除关联", exact: true }))
      .toBeEnabled();
    if (kind === "interrupted") expect(toast).not.toHaveBeenCalled();
    else
      expect(toast).toHaveBeenCalledExactlyOnceWith({
        type: "error",
        title: "无法移除关联",
        description:
          kind === "owned" ? "null" : kind === "raw" ? "Error: literal $& {diagnostic}" : "Error",
        data: { actionLayout: "stacked-end" },
      });
    await screen.rerender(surface("en"));
    expect(fixture.unlink).toHaveBeenCalledTimes(1);
    expect(registry.get(links)).toBe(loaded);
    await expect.element(screen.getByText(link.label, { exact: true })).toBeVisible();
    expect(toast).toHaveBeenCalledTimes(kind === "interrupted" ? 0 : 1);
  },
);

it.each(["owned", "raw", "empty", "interrupted", "cancel"] as const)(
  "uses settlement locale for direct environment link failure: %s",
  async (kind) => {
    fixture.locale = "en";
    fixture.direct = true;
    fixture.createLink.mockReset();
    fixture.unlink.mockReset();
    fixture.mint.mockReset().mockImplementation(() => {
      throw new Error("unexpected pairing-code mint");
    });
    using stack = new DisposableStack();
    const registry = stack.adopt(AtomRegistry.make(), (r) => r.dispose());
    stack.defer(() => {
      fixture.locale = "en";
      fixture.direct = false;
    });
    using _list = vi.spyOn(peerLinkEnvironment, "list").mockReturnValue(links);
    using _linkPermission = vi
      .spyOn(peerLinkEnvironment.link, "permissionAtom")
      .mockReturnValue(allowed);
    using _unlinkPermission = vi
      .spyOn(peerLinkEnvironment.unlink, "permissionAtom")
      .mockReturnValue(denied);
    using toast = vi.spyOn(toastManager, "add").mockImplementation(() => "fixture");
    let finish!: (result: ReturnType<typeof AsyncResult.failure>) => void;
    const pending = new Promise<ReturnType<typeof AsyncResult.failure>>((resolve) => {
      finish = resolve;
    });
    fixture.createLink.mockReturnValue(pending);
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
          <LinkedEnvironmentsSettings
            environmentId={environmentId}
            environmentLabel={null}
            isSearchTarget={false}
          />
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
    await screen.getByRole("button", { name: "Link", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Link an environment", exact: true });
    const submit = dialog.getByRole("button", { name: "Link", exact: true });
    await expect.element(submit).toBeDisabled();
    await dialog
      .getByRole("textbox", { name: "Address", exact: true })
      .fill("  https://fixture.invalid/direct  ");
    await expect.element(submit).toBeDisabled();
    await dialog
      .getByRole("textbox", { name: "Pairing code", exact: true })
      .fill("  dummy-not-a-credential  ");
    await expect
      .element(dialog.getByRole("alert"))
      .toHaveTextContent(
        "Check this addressThis app cannot confirm it is one of your machines. The pairing code you paste is sent there.https://fixture.invalid",
      );
    await expect
      .element(dialog.getByRole("alert").getByText("https://fixture.invalid", { exact: true }))
      .toBeVisible();
    await expect.element(submit).toBeEnabled();
    if (kind === "cancel") {
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect.element(dialog).not.toBeInTheDocument();
      expect(fixture.createLink).not.toHaveBeenCalled();
      expect(fixture.mint).not.toHaveBeenCalled();
      expect(toast).not.toHaveBeenCalled();
      return;
    }
    await submit.click();
    expect(fixture.createLink).toHaveBeenCalledExactlyOnceWith({
      environmentId,
      input: {
        url: "https://fixture.invalid/direct",
        pairingCode: "dummy-not-a-credential",
        access: "approval-required",
      },
    });
    await expect
      .element(dialog.getByRole("button", { name: "Linking…", exact: true }))
      .toBeDisabled();
    await expect
      .element(dialog.getByRole("button", { name: "Cancel", exact: true }))
      .toBeDisabled();
    fixture.locale = "zh-CN";
    await screen.rerender(surface("zh-CN"));
    expect(toast).not.toHaveBeenCalled();
    await act(async () => {
      finish(
        AsyncResult.failure(
          kind === "interrupted"
            ? Cause.interrupt()
            : Cause.fail(
                kind === "owned"
                  ? null
                  : new Error(kind === "raw" ? "literal $& {diagnostic}" : ""),
              ),
        ),
      );
      await pending;
    });
    const current = page.getByRole("dialog", { name: "关联环境", exact: true });
    await expect.element(current.getByRole("button", { name: "关联", exact: true })).toBeEnabled();
    if (kind === "interrupted") expect(toast).not.toHaveBeenCalled();
    else
      expect(toast).toHaveBeenCalledExactlyOnceWith({
        type: "error",
        title: "无法关联环境",
        description:
          kind === "owned" ? "null" : kind === "raw" ? "Error: literal $& {diagnostic}" : "Error",
        data: { actionLayout: "stacked-end" },
      });
    await screen.rerender(surface("en"));
    await expect
      .element(dialog.getByRole("textbox", { name: "Address", exact: true }))
      .toHaveValue("  https://fixture.invalid/direct  ");
    await expect
      .element(dialog.getByRole("textbox", { name: "Pairing code", exact: true }))
      .toHaveValue("  dummy-not-a-credential  ");
    expect(fixture.createLink).toHaveBeenCalledTimes(1);
    expect(fixture.mint).not.toHaveBeenCalled();
    expect(fixture.unlink).not.toHaveBeenCalled();
    expect(registry.get(links)).toBe(loaded);
    expect(toast).toHaveBeenCalledTimes(kind === "interrupted" ? 0 : 1);
  },
);
