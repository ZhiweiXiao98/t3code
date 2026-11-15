import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { act, render as renderUi } from "../../../test/render";
import { PullRequestChecksPopover } from "./PullRequestChecksPopover";
const state = vi.hoisted(() => ({
  open: vi.fn(),
  refs: vi.fn(),
  toast: vi.fn(),
  locale: "en" as "en" | "zh-CN",
}));
vi.mock("~/browser/useOpenLink", () => ({
  useOpenLink: (ref: unknown) => {
    state.refs(ref);
    return state.open;
  },
}));
vi.mock("../ui/toast", async (original) => ({
  ...(await original<typeof import("../ui/toast")>()),
  toastManager: { add: state.toast },
}));
vi.mock("~/i18n/readWebI18n", () => ({
  readWebI18n: () => {
    const locale = state.locale;
    return {
      locale,
      t: (
        key: Parameters<typeof translateWebMessage>[1],
        values?: Parameters<typeof translateWebMessage>[2],
      ) => translateWebMessage(locale, key, values),
    };
  },
}));
function setup() {
  state.open.mockReset();
  state.open.mockResolvedValue(undefined);
  state.refs.mockClear();
  state.toast.mockClear();
  state.locale = "en";
}

const checkRef = {
  environmentId: EnvironmentId.make("check-environment"),
  threadId: ThreadId.make("check-thread"),
};
const checkUrl = "https://checks.example.invalid/literal?value=$&{check}";
function checkSurface(locale: "en" | "zh-CN", withUrl = true) {
  state.locale = locale;
  const checks = [
    {
      name: "Literal $& {check}",
      status: "failure" as const,
      description: null,
      url: withUrl ? checkUrl : null,
    },
  ];
  return (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => {},
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <PullRequestChecksPopover
        checksState="failing"
        checks={checks}
        threadRef={checkRef}
        variant="count"
      />
    </WebI18nContext>
  );
}
it.each([
  ["owned", null],
  ["raw", new Error("Unable to open check details")],
  ["empty", new Error("")],
  ["success", undefined],
] as const)("uses settlement locale for popover check details: %s", async (kind, failure) => {
  setup();
  let resolve = () => {};
  let reject = (_error: unknown) => {};
  const pending = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  state.open.mockReturnValueOnce(pending);
  using logged = vi.spyOn(console, "error").mockImplementation(() => {});
  await using screen = await renderUi(checkSurface("en"));
  await using _settle = {
    async [Symbol.asyncDispose]() {
      await act(async () => {
        resolve();
        await Promise.resolve();
      });
    },
  };
  await userEvent.click(screen.getByRole("button", { name: /Open checks/ }));
  await userEvent.click(page.getByRole("button", { name: "Details" }));
  expect(state.open).toHaveBeenCalledExactlyOnceWith(checkUrl);
  expect(state.refs).toHaveBeenLastCalledWith(checkRef);
  expect(state.toast).not.toHaveBeenCalled();
  await screen.rerender(checkSurface("zh-CN"));
  await act(async () => {
    if (kind === "success") resolve();
    else reject(failure);
    await Promise.resolve();
  });
  if (kind === "success") {
    expect(state.toast).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
  } else {
    expect(state.toast).toHaveBeenCalledExactlyOnceWith({
      type: "error",
      title: "无法打开检查详情",
    });
    expect(logged).toHaveBeenCalledExactlyOnceWith(failure);
  }
  await screen.rerender(checkSurface("en"));
  expect(state.open).toHaveBeenCalledTimes(1);
  expect(state.toast).toHaveBeenCalledTimes(kind === "success" ? 0 : 1);
});
it("does not open popover check details without a URL", async () => {
  setup();
  await using screen = await renderUi(checkSurface("en", false));
  await userEvent.click(screen.getByRole("button", { name: /Open checks/ }));
  await expect.element(page.getByText("Literal $& {check}", { exact: true })).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Details", exact: true }))
    .not.toBeInTheDocument();
  expect(state.open).not.toHaveBeenCalled();
  expect(state.toast).not.toHaveBeenCalled();
});
