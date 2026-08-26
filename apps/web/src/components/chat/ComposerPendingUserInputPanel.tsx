import { type ApprovalRequestId } from "@t3tools/contracts";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { type PendingUserInput } from "../../session-logic";
import {
  derivePendingUserInputProgress,
  type PendingUserInputDraftAnswer,
} from "../../pendingUserInput";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../ui/collapsible";
import { useI18n, type WebTranslate } from "~/i18n/WebI18nProvider";
import { cn } from "~/lib/utils";

const CLAUDE_RESUME_QUESTION_PATTERN =
  /^This session is (?:(\d+)h (\d+)m|(\d+)m) old and uses (\d{1,3}(?:,\d{3})*) tokens\. Compact it before continuing\?$/u;

function localizePendingUserInputText(value: string, t: WebTranslate): string {
  const questionMatch = CLAUDE_RESUME_QUESTION_PATTERN.exec(value);
  if (questionMatch) {
    const age = questionMatch[3]
      ? t("composer.compaction.native.ageMinutes", { minutes: questionMatch[3] })
      : t("composer.compaction.native.ageHoursMinutes", {
          hours: questionMatch[1] ?? "0",
          minutes: questionMatch[2] ?? "0",
        });
    return t("composer.compaction.native.question", {
      age,
      tokens: questionMatch[4] ?? "0",
    });
  }

  const messageKey = {
    "Resume session": "composer.compaction.native.header",
    "Compact and continue": "composer.compaction.native.compactAndContinue",
    "Resume with a summary and use fewer tokens.": "composer.compaction.native.compactDescription",
    "Keep full history": "composer.compaction.keepFullHistory",
    "Resume without changing the conversation.": "composer.compaction.native.keepDescription",
    "Don't ask again": "composer.compaction.native.dontAskAgain",
    "Keep full history and skip future resume prompts.":
      "composer.compaction.native.dontAskDescription",
  } as const;
  const key = messageKey[value as keyof typeof messageKey];
  return key ? t(key) : value;
}

interface PendingUserInputPanelProps {
  pendingUserInputs: PendingUserInput[];
  respondingRequestIds: ApprovalRequestId[];
  answers: Record<string, PendingUserInputDraftAnswer>;
  questionIndex: number;
  onToggleOption: (questionId: string, optionLabel: string) => void;
  onAdvance: () => void;
}

export const ComposerPendingUserInputPanel = memo(function ComposerPendingUserInputPanel({
  pendingUserInputs,
  respondingRequestIds,
  answers,
  questionIndex,
  onToggleOption,
  onAdvance,
}: PendingUserInputPanelProps) {
  if (pendingUserInputs.length === 0) return null;
  const activePrompt = pendingUserInputs[0];
  if (!activePrompt) return null;

  return (
    <ComposerPendingUserInputCard
      key={activePrompt.requestId}
      prompt={activePrompt}
      isResponding={respondingRequestIds.includes(activePrompt.requestId)}
      answers={answers}
      questionIndex={questionIndex}
      onToggleOption={onToggleOption}
      onAdvance={onAdvance}
    />
  );
});

const ComposerPendingUserInputCard = memo(function ComposerPendingUserInputCard({
  prompt,
  isResponding,
  answers,
  questionIndex,
  onToggleOption,
  onAdvance,
}: {
  prompt: PendingUserInput;
  isResponding: boolean;
  answers: Record<string, PendingUserInputDraftAnswer>;
  questionIndex: number;
  onToggleOption: (questionId: string, optionLabel: string) => void;
  onAdvance: () => void;
}) {
  const { t } = useI18n();
  const progress = derivePendingUserInputProgress(prompt.questions, answers, questionIndex);
  const activeQuestion = progress.activeQuestion;
  const autoAdvanceTimerRef = useRef<number | null>(null);
  const onAdvanceRef = useRef(onAdvance);
  const [optimisticSingleSelect, setOptimisticSingleSelect] = useState<{
    questionId: string;
    optionLabel: string;
  } | null>(null);
  // Collapsing hides everything but the header so a tall prompt stops covering
  // the thread the user is trying to read. Scoped to a single question: the card
  // is keyed by request id so the next prompt starts expanded, and storing the
  // collapsed question's id (rather than a bare flag) reopens the card when the
  // prompt advances to its next question, which can happen without a click —
  // sending from the composer advances the active question.
  const [collapsedQuestionId, setCollapsedQuestionId] = useState<string | null>(null);
  const isCollapsed = collapsedQuestionId !== null && collapsedQuestionId === activeQuestion?.id;

  useEffect(() => {
    onAdvanceRef.current = onAdvance;
  }, [onAdvance]);

  useEffect(() => {
    if (!activeQuestion || activeQuestion.multiSelect || !optimisticSingleSelect) {
      return;
    }
    if (optimisticSingleSelect.questionId !== activeQuestion.id) {
      setOptimisticSingleSelect(null);
      return;
    }
    if (
      progress.customAnswer.trim().length === 0 &&
      progress.selectedOptionLabels.includes(optimisticSingleSelect.optionLabel)
    ) {
      setOptimisticSingleSelect(null);
    }
  }, [
    activeQuestion,
    optimisticSingleSelect,
    progress.customAnswer,
    progress.selectedOptionLabels,
  ]);

  // Clear auto-advance timer on unmount
  useEffect(() => {
    return () => {
      if (autoAdvanceTimerRef.current !== null) {
        window.clearTimeout(autoAdvanceTimerRef.current);
      }
    };
  }, []);

  const handleOptionSelection = useCallback(
    (questionId: string, optionLabel: string) => {
      if (activeQuestion?.multiSelect) {
        onToggleOption(questionId, optionLabel);
        return;
      }
      setOptimisticSingleSelect({ questionId, optionLabel });
      onToggleOption(questionId, optionLabel);
      if (autoAdvanceTimerRef.current !== null) {
        window.clearTimeout(autoAdvanceTimerRef.current);
      }
      autoAdvanceTimerRef.current = window.setTimeout(() => {
        autoAdvanceTimerRef.current = null;
        onAdvanceRef.current();
      }, 200);
    },
    [activeQuestion, onToggleOption],
  );

  // Keyboard shortcut: number keys 1-9 select corresponding options when focus is
  // outside editable fields. Multi-select prompts toggle options in place; single-
  // select prompts keep the existing auto-advance behavior. Collapsed prompts opt
  // out, since the numbers they refer to are not on screen.
  useEffect(() => {
    if (!activeQuestion || isResponding || isCollapsed) return;
    const handler = (event: globalThis.KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return;
      }
      if (
        target instanceof HTMLElement &&
        target.closest('[contenteditable]:not([contenteditable="false"])')
      ) {
        return;
      }
      const digit = Number.parseInt(event.key, 10);
      if (Number.isNaN(digit) || digit < 1 || digit > 9) return;
      const optionIndex = digit - 1;
      if (optionIndex >= activeQuestion.options.length) return;
      const option = activeQuestion.options[optionIndex];
      if (!option) return;
      event.preventDefault();
      handleOptionSelection(activeQuestion.id, option.label);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [activeQuestion, handleOptionSelection, isCollapsed, isResponding]);

  if (!activeQuestion) {
    return null;
  }

  const customAnswerActive = progress.customAnswer.trim().length > 0;

  return (
    <Collapsible
      className="py-2"
      open={!isCollapsed}
      onOpenChange={(open) => {
        setCollapsedQuestionId(open ? null : activeQuestion.id);
      }}
    >
      {/* The trigger's wrapper is inset less than the card's text column, and
          the trigger pays the difference back as padding: the hover background
          and focus ring bleed 10px past that column on both sides, while the
          header label and the chevron still line up with the left and right
          edges of the question text below. The negative block margin keeps the
          taller hit area from pushing the panel down. */}
      <div className="flex items-center gap-1 px-1 sm:px-2">
        <CollapsibleTrigger
          title={
            isCollapsed ? "Show the question and its options" : "Hide the question and its options"
          }
          data-pending-user-input-toggle={isCollapsed ? "collapsed" : "expanded"}
          className="group -my-1 flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none transition-colors duration-150 hover:bg-muted/35 focus-visible:ring-1 focus-visible:ring-primary/25"
        >
          <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground/85">
            {localizePendingUserInputText(activeQuestion.header, t)}
          </span>
          {prompt.questions.length > 1 ? (
            <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
              {questionIndex + 1}/{prompt.questions.length}
            </span>
          ) : null}
          {/* Collapsed, the header is otherwise just a section label and a
              counter, so the question itself is echoed here as a one-line
              reminder of what is being asked. */}
          {isCollapsed ? (
            <span className="min-w-0 flex-1 truncate text-secondary-label text-xs">
              {localizePendingUserInputText(activeQuestion.question, t)}
            </span>
          ) : null}
          {/* The chevron points at the body: down while it is open below the
              header, up while it is collapsed into it. */}
          <ChevronDownIcon
            aria-hidden="true"
            className={cn(
              "ml-auto size-3.5 shrink-0 text-secondary-label transition-transform duration-150 group-hover:text-foreground",
              isCollapsed && "rotate-180",
            )}
          />
        </CollapsibleTrigger>
      </div>
      {/* The panel carries the horizontal padding itself: it clips its content
          while the height animates, so the option buttons have to sit inside
          that padding or their focus rings get shaved off at the edges. */}
      <CollapsiblePanel className="px-3 sm:px-4">
        <div className="pt-2 pb-0.5">
          <p className="text-sm text-foreground/85">
            {localizePendingUserInputText(activeQuestion.question, t)}
          </p>
          {activeQuestion.multiSelect ? (
            <p className="mt-1 text-secondary-label text-xs">{t("composer.selectMultiple")}</p>
          ) : null}
          <div className="mt-2 space-y-0.5">
            {activeQuestion.options.map((option, index) => {
              const isOptimisticallySelected =
                optimisticSingleSelect?.questionId === activeQuestion.id &&
                optimisticSingleSelect.optionLabel === option.label;
              const isSelected =
                isOptimisticallySelected ||
                (!customAnswerActive && progress.selectedOptionLabels.includes(option.label));
              const shortcutKey = index < 9 ? index + 1 : null;
              const className = cn(
                "group flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left outline-none transition-colors duration-150 focus-visible:ring-1 focus-visible:ring-primary/25",
                isSelected
                  ? "bg-muted/55 text-foreground"
                  : "bg-transparent text-foreground/85 hover:bg-muted/30",
                isResponding && "opacity-50 cursor-not-allowed",
                !isResponding && "cursor-pointer",
              );
              const content = (
                <>
                  <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                    <span className="text-sm font-medium">
                      {localizePendingUserInputText(option.label, t)}
                    </span>
                    {option.description && option.description !== option.label ? (
                      <span className="text-secondary-label text-[11px]">
                        {localizePendingUserInputText(option.description, t)}
                      </span>
                    ) : null}
                  </div>
                  {isSelected ? (
                    <CheckIcon className="size-3.5 shrink-0 text-primary" />
                  ) : shortcutKey !== null ? (
                    <kbd
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center text-[10px] font-medium text-muted-foreground tabular-nums",
                      )}
                    >
                      {shortcutKey}
                    </kbd>
                  ) : null}
                </>
              );
              return (
                <button
                  key={`${activeQuestion.id}:${option.label}`}
                  type="button"
                  disabled={isResponding}
                  onClick={() => {
                    handleOptionSelection(activeQuestion.id, option.label);
                  }}
                  className={className}
                >
                  {content}
                </button>
              );
            })}
          </div>
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
});
