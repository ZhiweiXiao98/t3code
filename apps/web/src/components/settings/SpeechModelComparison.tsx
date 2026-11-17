import { useI18n } from "../../i18n/WebI18nContext";
import { translateVoiceSettingsMessage } from "../../i18n/voiceSettingsMessages";
import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import type { EnvironmentSpeechModel, SpeechBenchmarkTier } from "@t3tools/contracts";

import { languageLabel } from "./SpeechLanguageSelect";

const commonLanguages = [
  "en",
  "zh",
  "hi",
  "es",
  "fr",
  "bn",
  "pt",
  "id",
  "ur",
  "ru",
  "de",
  "ja",
  "mr",
  "vi",
  "te",
  "sw",
  "ha",
  "tr",
  "tl",
  "ta",
  "jw",
  "ko",
  "am",
  "th",
  "it",
  "gu",
  "kn",
  "yo",
];

export function orderSpeechLanguages(
  languages: readonly string[],
  preferred: readonly string[],
  locale: ResolvedAppLocale = "en",
) {
  const order = [...new Set([...preferred, ...commonLanguages])];
  const rank = new Map(order.map((code, index) => [code, index]));
  return languages.toSorted(
    (left, right) =>
      (rank.get(left) ?? order.length) - (rank.get(right) ?? order.length) ||
      languageLabel(left, locale).localeCompare(languageLabel(right, locale), locale),
  );
}

export function ModelBenchmarks({
  model,
  languages,
  tier,
  facts,
}: {
  model: EnvironmentSpeechModel;
  languages: readonly string[];
  tier: SpeechBenchmarkTier;
  /** Plain facts, such as language count and size, shown after the scores. */
  facts: readonly string[];
}) {
  const { locale } = useI18n();
  const t = translateVoiceSettingsMessage.bind(null, locale);
  const data = model.benchmark;
  const seconds = data?.secondsPer30s[tier];
  const visible = !data
    ? []
    : languages.length
      ? languages
      : [model.languages.find((code) => data.accuracy[code]) ?? model.languages[0]].filter(
          (code): code is string => code !== undefined,
        );
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
      {visible.map((code) => {
        const score = data?.accuracy[code];
        return (
          <span key={code}>
            {languageLabel(code, locale)}:{" "}
            {score ? (
              <>
                <strong className="font-medium text-foreground">{score.grade}</strong> (
                {t("{percent}% error)", { percent: score.errorPercent })}
              </>
            ) : (
              t("not benchmarked")
            )}
          </span>
        );
      })}
      <span>
        {t("Speed:")}{" "}
        {tier === "cpu" && data && data.secondsPer30s.cpu === undefined ? (
          t("update server")
        ) : seconds == null ? (
          t("not benchmarked")
        ) : (
          <>
            <strong className="font-medium text-foreground">{seconds} s</strong> / 30 s
          </>
        )}
      </span>
      {facts.map((fact) => (
        <span key={fact}>{fact}</span>
      ))}
    </div>
  );
}
