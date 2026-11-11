import { useI18n } from "~/i18n/WebI18nContext";
import { translateConnectAgentSource } from "~/i18n/connectAgentMessages";
import { cn } from "~/lib/utils";

import { CommandBlock } from "./CommandBlock";

/**
 * Setup steps for another computer: install `t3`, then run `command`. Both installers are shown
 * because the browser showing this is often not the computer being set up.
 */
export function InstallT3Commands({
  command,
  className,
}: {
  readonly command: string;
  readonly className?: string;
}) {
  const { locale } = useI18n();
  const tx = (source: string) => translateConnectAgentSource(locale, source);
  const [beforeSkip, afterSkip] = tx("Skip the install if you already have {command}.").split(
    "{command}",
  );
  const [beforePath, afterPath] = tx(
    "If {command} is not found after installing, add the folder the installer names to your PATH.",
  ).split("{command}");
  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs text-muted-foreground">macOS, Linux</p>
      <CommandBlock command="curl -fsSL https://t3.codes/install.sh | sh" />
      <p className="text-xs text-muted-foreground">Windows (PowerShell)</p>
      <CommandBlock command="irm https://t3.codes/install.ps1 | iex" />
      <p className="text-xs text-muted-foreground">{tx("Then")}</p>
      <CommandBlock command={command} />
      <p className="text-xs text-muted-foreground">
        {beforeSkip}
        <code className="font-mono">t3</code>
        {afterSkip} {beforePath}
        <code className="font-mono">t3</code>
        {afterPath}
      </p>
    </div>
  );
}
