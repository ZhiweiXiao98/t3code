import { memo } from "react";
import { type PendingApproval } from "../../session-logic";
import { useI18n } from "../../i18n/WebI18nProvider";
import { cn } from "~/lib/utils";

interface ComposerPendingApprovalPanelProps {
  approval: PendingApproval;
  pendingCount: number;
  className?: string;
}

export const ComposerPendingApprovalPanel = memo(function ComposerPendingApprovalPanel({
  approval,
  pendingCount,
  className,
}: ComposerPendingApprovalPanelProps) {
  const { t } = useI18n();
  const fallbackLabel =
    approval.requestKind === "mcp-elicitation"
      ? t("composer.approval.appAccessLabel")
      : approval.requestKind === "command"
        ? t("composer.approval.commandLabel")
        : approval.requestKind === "file-read"
          ? t("composer.approval.fileReadLabel")
          : t("composer.approval.fileChangeLabel");
  const detailAriaLabel =
    approval.requestKind === "mcp-elicitation"
      ? t("composer.approval.appAccessRequest")
      : approval.requestKind === "command"
        ? t("composer.approval.command")
        : approval.requestKind === "file-read"
          ? t("composer.approval.fileToRead")
          : t("composer.approval.fileChange");

  return (
    <span
      aria-label={fallbackLabel}
      className={cn("flex min-w-0 flex-1 items-center gap-2", className)}
      role="group"
    >
      {approval.appName ? (
        <span className="max-w-32 shrink truncate text-[11px] font-medium text-foreground">
          {approval.appName}
        </span>
      ) : null}
      <code
        aria-label={detailAriaLabel}
        className="block max-h-20 min-w-0 flex-1 overflow-auto whitespace-pre font-mono text-[11px] text-foreground/85 [scrollbar-width:thin] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70 [&::-webkit-scrollbar]:h-1.5"
        data-approval-detail="complete"
        tabIndex={0}
      >
        {approval.detail || fallbackLabel}
      </code>
      {pendingCount > 1 ? (
        <span className="shrink-0 text-[10px] font-medium text-muted-foreground tabular-nums">
          1/{pendingCount}
        </span>
      ) : null}
    </span>
  );
});
