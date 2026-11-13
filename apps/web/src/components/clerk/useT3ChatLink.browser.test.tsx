import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import { render } from "../../../test/render";
import { useT3ChatLink } from "./useT3ChatLink";

const state = vi.hoisted(() => ({
  link: vi.fn(),
  unlink: vi.fn(),
  toast: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("../../cloud/managedRelayState", () => ({
  createManagedRelayT3ChatLinkRequestCommand: "link",
  unlinkManagedRelayT3ChatCommand: "unlink",
  useManagedRelayT3ChatLink: () => ({ accountId: "account/{id}/$&", refresh: state.refresh }),
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (command: string) => (command === "link" ? state.link : state.unlink),
}));
vi.mock("~/i18n/readWebI18n", () => ({ readWebI18n: () => ({ locale: "zh-CN" }) }));
vi.mock("../ui/toast", () => ({ toastManager: { add: state.toast } }));
vi.mock("../../localApi", () => ({ readLocalApi: () => undefined }));

it("localizes actual link/unlink failure notifications but preserves an external same-text Error", async () => {
  const external = new Error("Try again.");
  state.link.mockResolvedValue(AsyncResult.failure(Cause.fail(external)));
  state.unlink.mockResolvedValue(AsyncResult.failure(Cause.fail("opaque non-Error failure")));
  function Controls() {
    const link = useT3ChatLink();
    return (
      <>
        <button onClick={() => void link.link()}>Link</button>
        <button onClick={() => void link.unlink()}>Unlink</button>
      </>
    );
  }
  await using screen = await render(<Controls />);
  await screen.getByRole("button", { name: "Link", exact: true }).click();
  await vi.waitFor(() => expect(state.link).toHaveBeenCalledWith({ accountId: "account/{id}/$&" }));
  await vi.waitFor(() =>
    expect(state.toast).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "无法开始关联", description: "Try again." }),
    ),
  );
  await screen.getByRole("button", { name: "Unlink", exact: true }).click();
  await vi.waitFor(() =>
    expect(state.unlink).toHaveBeenCalledWith({ accountId: "account/{id}/$&" }),
  );
  await vi.waitFor(() =>
    expect(state.toast).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "无法取消关联 T3 Chat", description: "请重试。" }),
    ),
  );
  expect(external.message).toBe("Try again.");
  expect(state.refresh).not.toHaveBeenCalled();
});
