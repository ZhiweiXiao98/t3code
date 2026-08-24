import {
  type ApprovalRequestId,
  type ProviderApprovalDecision,
  type ProviderApprovalOption,
} from "@t3tools/contracts";
import { memo } from "react";
import { useI18n } from "../../i18n/WebI18nProvider";
import { Button } from "../ui/button";

interface ComposerPendingApprovalActionsProps {
  requestId: ApprovalRequestId;
  isResponding: boolean;
  options?: ReadonlyArray<ProviderApprovalOption> | undefined;
  onRespondToApproval: (
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  ) => Promise<unknown>;
}

const APPROVAL_ACTION_CLASS_NAME = "font-normal";
export const ComposerPendingApprovalActions = memo(function ComposerPendingApprovalActions({
  requestId,
  isResponding,
  options,
  onRespondToApproval,
}: ComposerPendingApprovalActionsProps) {
  const { t } = useI18n();
  const resolvedOptions =
    options ??
    ([
      { decision: "cancel", label: t("composer.approval.cancelTurn") },
      { decision: "decline", label: t("composer.approval.decline") },
      { decision: "acceptForSession", label: t("composer.approval.allowSession") },
      { decision: "accept", label: t("composer.approval.approveOnce") },
    ] satisfies ReadonlyArray<ProviderApprovalOption>);

  return (
    <>
      {resolvedOptions.map((option) => (
        <Button
          key={option.decision}
          size="micro"
          variant="ghost-muted"
          className={`${APPROVAL_ACTION_CLASS_NAME}${
            option.decision === "decline"
              ? " text-destructive-foreground [:hover,[data-pressed]]:text-destructive-foreground"
              : option.decision === "accept"
                ? " text-foreground"
                : ""
          }`}
          disabled={isResponding}
          onClick={() => void onRespondToApproval(requestId, option.decision)}
        >
          <span className="max-w-40 truncate">{option.label}</span>
        </Button>
      ))}
    </>
  );
});
