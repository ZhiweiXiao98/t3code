import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { type ComponentProps, type ReactNode, useLayoutEffect, useRef } from "react";

import { useI18n } from "../i18n/WebI18nProvider";
import { Command, CommandFooter, CommandInput, CommandPanel } from "./ui/command";
import { Kbd, KbdGroup } from "./ui/kbd";

type CommandPaletteContentProps = Omit<ComponentProps<typeof Command>, "children"> & {
  readonly children: ReactNode;
  readonly escapeLabel?: ReactNode;
  readonly footerActionLabel?: ReactNode;
  readonly footerTrailing?: ReactNode;
  readonly inputAccessory?: ReactNode;
  readonly inputProps: ComponentProps<typeof CommandInput>;
  readonly panelClassName?: string;
  readonly showBackHint?: boolean;
  readonly testId?: string;
};

/**
 * Shared command palette chrome. Palette modes provide their query behavior,
 * results, and optional input accessory while retaining one input, panel, and
 * keyboard-hint gutter.
 */
export function CommandPaletteContent({
  children,
  escapeLabel,
  footerActionLabel,
  footerTrailing,
  inputAccessory,
  inputProps,
  panelClassName,
  showBackHint,
  testId,
  ...commandProps
}: CommandPaletteContentProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);

  // Direct-open flows replace the initial palette view after the dialog has
  // already moved focus. Reclaim it when the replacement input mounts so
  // typing cannot continue in the composer behind the modal.
  useLayoutEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="contents" data-testid={testId}>
      <Command {...commandProps}>
        <div className="relative">
          <CommandInput {...inputProps} ref={inputRef} />
          {inputAccessory}
        </div>
        <CommandPanel className={panelClassName}>{children}</CommandPanel>
        <CommandFooter className="gap-3 max-sm:flex-col max-sm:items-start">
          <div className="flex items-center gap-3">
            <KbdGroup className="items-center gap-1.5">
              <Kbd>
                <ArrowUpIcon />
              </Kbd>
              <Kbd>
                <ArrowDownIcon />
              </Kbd>
              <span>{t("commandPalette.navigate")}</span>
            </KbdGroup>
            {footerActionLabel !== undefined ? (
              <KbdGroup className="items-center gap-1.5">
                <Kbd>Enter</Kbd>
                <span>{footerActionLabel}</span>
              </KbdGroup>
            ) : null}
            {showBackHint ? (
              <KbdGroup className="items-center gap-1.5">
                <Kbd>Backspace</Kbd>
                <span>{t("common.back")}</span>
              </KbdGroup>
            ) : null}
            <KbdGroup className="items-center gap-1.5">
              <Kbd>Esc</Kbd>
              <span>{escapeLabel ?? t("common.close")}</span>
            </KbdGroup>
          </div>
          {footerTrailing}
        </CommandFooter>
      </Command>
    </div>
  );
}
