import { useState } from "react";
import { isMacPlatform } from "~/lib/utils";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";

vi.mock(
  import("~/hooks/useSettings"),
  () => ({ useEnvironmentIdentificationMode: () => "none" }) as never,
);
vi.mock(
  import("../SidebarStageBackdrop"),
  () =>
    ({
      useSidebarStageBackdropVariant: () => null,
      StageBackdropButtonArt: () => null,
    }) as never,
);
vi.mock(
  import("../../shortcutModifierState"),
  () =>
    ({
      useShortcutModifierState: () => ({
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
      }),
    }) as never,
);

import { ComposerPrimaryActions } from "./ComposerPrimaryActions";

function Composer({
  locale,
  submit,
  running = false,
}: {
  locale: "en" | "zh-CN";
  submit: () => void;
  running?: boolean;
}) {
  const [keepFullHistory, setKeepFullHistory] = useState(false);
  return (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => undefined,
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <ComposerPrimaryActions
        compact={false}
        canOperateThread
        pendingAction={null}
        isRunning={running}
        canInterrupt={false}
        isSendBusy={false}
        sendDisabledReason={null}
        isEnvironmentUnavailable={false}
        isPreparingWorktree={false}
        hasSendableContent
        followUpBehavior="queue"
        alternateShortcutLabel="Ctrl+Enter"
        compactBeforeSendTokens={running ? null : 1200}
        keepFullHistory={keepFullHistory}
        onToggleKeepFullHistory={() => setKeepFullHistory((value) => !value)}
        onSubmitMessage={submit}
        onPreviousPendingQuestion={() => undefined}
        onInterrupt={() => undefined}
      />
    </WebI18nContext>
  );
}

it("changes compaction copy with locale without losing the selected send behavior", async () => {
  const submit = vi.fn();
  await using screen = await render(<Composer locale="en" submit={submit} />);
  const compact = screen.getByRole("button", {
    name: "Compact 1.2k tokens of history before sending",
  });
  await userEvent.hover(compact);
  await expectOpenTooltip("Next send compacts 1.2k tokens first.Click to keep full history");
  await compact.click();
  await expect.element(compact).toHaveAttribute("aria-pressed", "false");
  await expectOpenTooltip("Next send keeps all 1.2k tokens.Click to compact first");

  await screen.rerender(<Composer locale="zh-CN" submit={submit} />);
  const localizedCompact = screen.getByRole("button", { name: "发送前压缩历史中的 1.2k 个 Token" });
  await expect.element(localizedCompact).toHaveAttribute("aria-pressed", "false");
  await expectOpenTooltip("下次发送将保留全部 1.2k 个 token。点击以先压缩历史记录");
  expect(submit).not.toHaveBeenCalled();
  await localizedCompact.click();
  await expect.element(localizedCompact).toHaveAttribute("aria-pressed", "true");
  await expectOpenTooltip("下次发送将先压缩 1.2k 个 token。点击以保留完整历史记录");
  await screen.getByRole("button", { name: "压缩上下文并发送" }).click();
  expect(submit).toHaveBeenCalledTimes(1);
});

it("keeps dispatch shortcuts opaque when a running composer's locale changes", async () => {
  const submit = vi.fn();
  await using screen = await render(<Composer locale="en" submit={submit} running />);
  await userEvent.hover(screen.getByRole("button", { name: "Queue message" }));
  const modifier = isMacPlatform(navigator.platform) ? "⌘" : "Ctrl";
  await expectOpenTooltip(`Click to queue, ${modifier}-click or Ctrl+Enter to steer`);
  await screen.rerender(<Composer locale="zh-CN" submit={submit} running />);
  await expectOpenTooltip(`点击以加入队列，按住 ${modifier} 点击或按 Ctrl+Enter以引导当前回合`);
  expect(submit).not.toHaveBeenCalled();
  await screen.getByRole("button", { name: "将消息加入队列" }).click();
  expect(submit).toHaveBeenCalledTimes(1);
});

async function expectOpenTooltip(text: string) {
  await expect
    .poll(() => document.querySelector('[data-slot="tooltip-popup"][data-open]')?.textContent)
    .toBe(text);
  const popup = document.querySelector<HTMLElement>('[data-slot="tooltip-popup"][data-open]');
  if (!popup) throw new Error("Expected the open tooltip popup");
  await expect.element(popup).toBeVisible();
}
