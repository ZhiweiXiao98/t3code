import { translateWebSource } from "../../i18n/messages";
import { useI18n } from "../../i18n/WebI18nContext";
import type { EnvironmentId, SecretProviderConfig, SecretProviderId } from "@t3tools/contracts";
import * as Result from "effect/Result";
import { useState } from "react";

import { useUpdateEnvironmentSettings } from "../../hooks/useSettings";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  draftFromSecretProvider,
  secretProviderFromDraft,
  type SecretProviderDraft,
} from "./SecretProviderDialog.logic";

/** Mounted per open, so each open starts from a fresh draft. */
export function SecretProviderDialog({
  onClose,
  environmentId,
  environmentLabel,
  existingIds,
  existing,
}: {
  readonly onClose: () => void;
  readonly environmentId: EnvironmentId;
  readonly environmentLabel: string;
  readonly existingIds: ReadonlySet<string>;
  readonly existing?: { readonly id: SecretProviderId; readonly config: SecretProviderConfig };
}) {
  const { locale } = useI18n();
  const tx = (source: string) => translateWebSource(locale, source);
  const updateSettings = useUpdateEnvironmentSettings(environmentId);
  const [draft, setDraft] = useState<SecretProviderDraft>(
    existing ? draftFromSecretProvider(existing.config) : { name: "", account: "" },
  );
  const [submitted, setSubmitted] = useState(false);
  const result = secretProviderFromDraft(
    draft,
    existingIds,
    existing ? { mode: "edit", id: existing.id } : { mode: "add" },
  );
  const issues = Result.isFailure(result) ? result.failure : {};
  const nameError = submitted ? issues.name : undefined;
  const accountError = submitted ? issues.account : undefined;

  const update = (patch: Partial<SecretProviderDraft>) => setDraft({ ...draft, ...patch });
  const save = () => {
    setSubmitted(true);
    if (Result.isFailure(result)) return;
    updateSettings({ secretProviders: { [result.success.id]: result.success.config } });
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {existing
              ? locale === "zh-CN"
                ? `编辑 ${existing.config.label}`
                : `Edit ${existing.config.label}`
              : tx("Add a 1Password provider")}
          </DialogTitle>
          <DialogDescription>
            {locale === "zh-CN"
              ? `${environmentLabel} 上的提供商变量可通过名称读取其中的值。提供商启动时，会使用该服务器上的 op CLI 读取这些值。`
              : `Provider variables on ${environmentLabel} can read values from it by name. Values are read with the op CLI on that server when a provider starts.`}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <form
            id="secret-provider-form"
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="secret-provider-name">{tx("Name")}</Label>
              <Input
                id="secret-provider-name"
                placeholder={tx("Personal")}
                value={draft.name}
                onChange={(event) => update({ name: event.target.value })}
                maxLength={64}
                aria-invalid={nameError !== undefined}
                aria-describedby={
                  nameError !== undefined ? "secret-provider-name-error" : undefined
                }
                autoFocus
              />
              {nameError !== undefined ? (
                <p
                  id="secret-provider-name-error"
                  role="alert"
                  className="text-xs text-destructive"
                >
                  {tx(nameError)}
                </p>
              ) : null}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="secret-provider-account">{tx("Account")}</Label>
              <Input
                id="secret-provider-account"
                placeholder="my.1password.com"
                value={draft.account}
                onChange={(event) => update({ account: event.target.value })}
                maxLength={253}
                spellCheck={false}
                aria-invalid={accountError !== undefined}
                aria-describedby={
                  accountError !== undefined ? "secret-provider-account-error" : undefined
                }
              />
              {accountError !== undefined ? (
                <p
                  id="secret-provider-account-error"
                  role="alert"
                  className="text-xs text-destructive"
                >
                  {tx(accountError)}
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {tx(
                  "The account shorthand, sign-in address without https://, or ID that op account list shows.",
                )}
              </p>
            </div>
          </form>
        </DialogPanel>
        <DialogFooter variant="bare">
          <Button variant="outline" onClick={onClose}>
            {tx("Cancel")}
          </Button>
          <Button
            type="submit"
            form="secret-provider-form"
            disabled={submitted && Result.isFailure(result)}
          >
            {tx(existing ? "Save changes" : "Add provider")}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
