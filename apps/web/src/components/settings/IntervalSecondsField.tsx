import { translateWebExtraSource } from "~/i18n/webExtraMessages";
import { useState } from "react";
import { useI18n } from "../../i18n/WebI18nContext";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "../ui/number-field";
import { normalizeIntervalSeconds } from "./SettingsPanels.logic";

export function IntervalSecondsField({
  label,
  value,
  min,
  step,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  step: number;
  onCommit: (seconds: number, options: { onFailed: () => void }) => void;
}) {
  const { locale, t } = useI18n();
  const [field, setField] = useState({
    saved: value,
    draft: value as number | null,
    committed: value,
    revision: 0,
  });
  if (field.saved !== value) {
    setField({ ...field, saved: value, draft: value, committed: value });
  }

  return (
    <NumberField
      value={field.draft}
      min={min}
      step={step}
      size="sm"
      className="w-32"
      onValueChange={(draft) => setField((current) => ({ ...current, draft }))}
      onValueCommitted={(next) => {
        if (next === null) {
          setField((current) => ({ ...current, draft: current.saved }));
          return;
        }
        const seconds = normalizeIntervalSeconds(next, min);
        if (seconds === field.committed) {
          setField((current) => ({ ...current, draft: seconds }));
          return;
        }
        const revision = field.revision + 1;
        setField((current) => ({ ...current, draft: seconds, committed: seconds, revision }));
        onCommit(seconds, {
          onFailed: () =>
            setField((current) =>
              current.revision !== revision
                ? current
                : {
                    ...current,
                    committed: current.saved,
                    draft: current.draft === seconds ? current.saved : current.draft,
                  },
            ),
        });
      }}
    >
      <NumberFieldGroup>
        <NumberFieldDecrement
          aria-label={t("settings.general.background.interval.decrease", {
            name: translateWebExtraSource(locale, label),
          })}
        />
        <NumberFieldInput
          aria-label={t("settings.general.background.interval.inSeconds", {
            name: translateWebExtraSource(
              locale,
              `${label.charAt(0).toUpperCase()}${label.slice(1)}`,
            ),
          })}
        />
        <NumberFieldIncrement
          aria-label={t("settings.general.background.interval.increase", {
            name: translateWebExtraSource(locale, label),
          })}
        />
      </NumberFieldGroup>
    </NumberField>
  );
}
