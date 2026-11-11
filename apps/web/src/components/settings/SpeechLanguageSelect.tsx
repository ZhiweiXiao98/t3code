import { useI18n } from "../../i18n/WebI18nContext";
import { translateVoiceSettingsMessage } from "../../i18n/voiceSettingsMessages";
import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import type { EnvironmentSpeechStatus } from "@t3tools/contracts";
import { effectiveSpeechLanguage } from "@t3tools/shared/speech";
import { updateClientSettings, useClientSettings } from "../../hooks/useSettings";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";

const languageNames = {
  en: new Intl.DisplayNames(["en"], { type: "language" }),
  "zh-CN": new Intl.DisplayNames(["zh-CN"], { type: "language" }),
};
export const languageLabel = (code: string, locale: ResolvedAppLocale = "en") =>
  languageNames[locale].of(code) ?? code;

type ModelLanguages = Pick<
  Extract<EnvironmentSpeechStatus, { supported: true }>,
  "languages" | "supportsLanguageDetection"
>;

export function SpeechLanguageSelect({ model }: { readonly model: ModelLanguages | null }) {
  const { locale } = useI18n();
  const t = translateVoiceSettingsMessage.bind(null, locale);
  const preference = useClientSettings((settings) => settings.speechLanguage);
  const languages = model?.languages ?? [];
  const resolved = model
    ? effectiveSpeechLanguage(
        { languages, supportsLanguageDetection: model.supportsLanguageDetection ?? false },
        preference,
      )
    : preference;
  const effectiveLabel = resolved === "auto" ? t("Auto-detect") : languageLabel(resolved, locale);
  const unavailable =
    preference !== "auto" && preference !== resolved
      ? t("{language} unavailable", { language: languageLabel(preference, locale) })
      : null;
  const label = unavailable
    ? t("{effective} ({unavailable})", { effective: effectiveLabel, unavailable })
    : preference === "auto" && resolved !== "auto"
      ? t("Auto ({language})", { language: effectiveLabel })
      : effectiveLabel;
  return (
    <Select
      value={preference}
      disabled={!model}
      onValueChange={(value) => {
        if (value) void updateClientSettings({ speechLanguage: value });
      }}
    >
      <SelectTrigger size="sm" aria-label={t("Transcription language")} className="max-w-64">
        <SelectValue>{label}</SelectValue>
      </SelectTrigger>
      <SelectPopup align="end" alignItemWithTrigger={false}>
        <SelectItem value="auto">{t("Auto")}</SelectItem>
        {unavailable ? (
          <SelectItem value={preference} disabled>
            {unavailable}
          </SelectItem>
        ) : null}
        {languages
          .toSorted((left, right) =>
            languageLabel(left, locale).localeCompare(languageLabel(right, locale), locale),
          )
          .map((code) => (
            <SelectItem key={code} value={code}>
              {languageLabel(code, locale)}
            </SelectItem>
          ))}
      </SelectPopup>
    </Select>
  );
}
