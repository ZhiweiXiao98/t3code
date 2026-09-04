import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import {
  ANTIGRAVITY_AUTH_METHODS,
  type AntigravityAuthMethod,
  type EnvironmentId,
  type ProviderAuthState,
  type ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { useRef, useState } from "react";

import { writeTextToClipboard } from "../../hooks/useCopyToClipboard";
import { useI18n } from "../../i18n/WebI18nProvider";
import { translateWebSource } from "../../i18n/messages";
import { ensureLocalApi } from "../../localApi";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

interface ProviderSetupSectionProps {
  readonly environmentId: EnvironmentId;
  readonly environmentLabel: string;
  readonly instanceId: ProviderInstanceId;
  readonly provider: ServerProvider | undefined;
  readonly binaryPath?: string | undefined;
  readonly authMethod?: AntigravityAuthMethod | undefined;
  readonly enabled: boolean;
  readonly readOnly: boolean;
  readonly onEnable: () => void;
}

const AUTH_PHASE_LABELS: Record<ProviderAuthState["phase"], string> = {
  idle: "Sign in with your Google account.",
  starting: "Starting Google sign-in.",
  waiting: "Waiting for Google sign-in.",
  verifying: "Checking Google sign-in and available models.",
  succeeded: "Google sign-in complete.",
  failed: "Google sign-in failed.",
  cancelled: "Google sign-in cancelled.",
};

/** API key methods skip the browser, so the phases read as a credential check. */
const CREDENTIAL_PHASE_LABELS: Record<ProviderAuthState["phase"], string> = {
  idle: "Connect with the credentials in the provider settings.",
  starting: "Checking credentials.",
  waiting: "Checking credentials.",
  verifying: "Checking credentials and available models.",
  succeeded: "Connected.",
  failed: "Could not connect with the configured credentials.",
  cancelled: "Connection cancelled.",
};

/** Read the configured method from the instance config. Unknown values fall back to personal. */
export function readAntigravityAuthMethod(config: unknown): AntigravityAuthMethod {
  const value =
    config !== null && typeof config === "object" && "authMethod" in config
      ? config.authMethod
      : undefined;
  return (
    ANTIGRAVITY_AUTH_METHODS.find((method) => method.value === value)?.value ?? "oauth-personal"
  );
}

/** Setup state belongs to the selected environment and is never saved in client settings. */
export function ProviderSetupSection(props: ProviderSetupSectionProps) {
  const { t } = useI18n();
  return (
    <section aria-label={t("providers.setup.aria")} className="grid gap-3 text-xs">
      <p>{t("providers.setup.runsOn", { environment: props.environmentLabel })}</p>
      {!props.enabled ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">{t("providers.setup.enableDescription")}</span>
          {!props.readOnly ? (
            <Button size="xs" variant="outline" onClick={props.onEnable}>
              {t("providers.setup.enable")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {props.readOnly ? (
        <p className="text-muted-foreground">{t("providers.setup.readOnly")}</p>
      ) : props.provider?.setup === undefined ? (
        <p className="text-muted-foreground">{t("providers.setup.updateEnvironment")}</p>
      ) : (
        <ProviderSetupActions
          key={`${props.environmentId}:${props.instanceId}`}
          environmentId={props.environmentId}
          environmentLabel={props.environmentLabel}
          instanceId={props.instanceId}
          provider={props.provider}
          binaryPath={props.binaryPath}
          authMethod={props.authMethod ?? "oauth-personal"}
          enabled={props.enabled}
        />
      )}
    </section>
  );
}

function ProviderSetupActions({
  environmentId,
  environmentLabel,
  instanceId,
  provider,
  enabled,
  binaryPath,
  authMethod,
}: Pick<
  ProviderSetupSectionProps,
  "environmentId" | "environmentLabel" | "instanceId" | "enabled" | "binaryPath"
> & {
  readonly provider: ServerProvider;
  readonly authMethod: AntigravityAuthMethod;
}) {
  const { locale, t } = useI18n();
  const tr = (source: string) => translateWebSource(locale, source);
  const target = { environmentId, input: { instanceId } };
  const usesBrowser = authMethod === "oauth-personal" || authMethod === "oauth-business";
  const phaseLabels = usesBrowser ? AUTH_PHASE_LABELS : CREDENTIAL_PHASE_LABELS;
  const methodLabel =
    ANTIGRAVITY_AUTH_METHODS.find((method) => method.value === authMethod)?.label ??
    "Google account";
  const authQuery = useEnvironmentQuery(serverEnvironment.providerAuthState(target));
  const installQuery = useEnvironmentQuery(serverEnvironment.providerInstallState(target));
  const auth = authQuery.data;
  const installation = installQuery.data;
  const commandOptions = { reportFailure: false, reportDefect: false };
  const startAuth = useAtomCommand(serverEnvironment.startProviderAuth, commandOptions);
  const completeAuth = useAtomCommand(serverEnvironment.completeProviderAuth, commandOptions);
  const cancelAuth = useAtomCommand(serverEnvironment.cancelProviderAuth, commandOptions);
  const logoutAuth = useAtomCommand(serverEnvironment.logoutProviderAuth, commandOptions);
  const startInstall = useAtomCommand(serverEnvironment.startProviderInstall, commandOptions);
  const cancelInstall = useAtomCommand(serverEnvironment.cancelProviderInstall, commandOptions);
  const removeInstall = useAtomCommand(
    serverEnvironment.removeProviderInstallation,
    commandOptions,
  );
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [callbackDraft, setCallbackDraft] = useState({ flowId: null as string | null, value: "" });
  const [copiedFlowId, setCopiedFlowId] = useState<string | null>(null);
  const callbackUrl = callbackDraft.flowId === auth?.flowId ? callbackDraft.value : "";
  const authActive =
    auth?.phase === "starting" || auth?.phase === "waiting" || auth?.phase === "verifying";
  const installActive =
    installation?.phase === "downloading" ||
    installation?.phase === "extracting" ||
    installation?.phase === "verifying";
  const usesCustomBinary = Boolean(binaryPath?.trim());
  const installed =
    provider.installed || (!usesCustomBinary && installation?.installedVersion != null);
  const authenticated = provider.auth.status === "authenticated";
  const authStatusMessage =
    auth === null
      ? t("providers.setup.auth.reading")
      : authActive || auth.phase === "failed" || auth.phase === "cancelled"
        ? auth.message
          ? tr(auth.message)
          : tr(phaseLabels[auth.phase])
        : authenticated
          ? usesBrowser
            ? t("providers.setup.auth.signedIn")
            : t("providers.setup.auth.connected")
          : auth.phase === "idle" && auth.message
            ? tr(auth.message)
            : tr(phaseLabels.idle);
  const authorizationUrl = auth?.phase === "waiting" ? auth.authorizationUrl : null;
  const queryError = authQuery.error ?? installQuery.error;
  const actionsDisabled = pendingLabel !== null || queryError !== null;
  const installationStatusMessage =
    installation?.phase === "downloading"
      ? t("providers.setup.install.downloading", {
          downloaded: (installation.downloadedBytes / 1_000_000).toFixed(1),
          total:
            installation.totalBytes === null
              ? ""
              : t("providers.setup.install.ofTotal", {
                  total: (installation.totalBytes / 1_000_000).toFixed(1),
                }),
        })
      : installation?.phase === "extracting"
        ? t("providers.setup.install.extracting")
        : installation?.phase === "verifying"
          ? t("providers.setup.install.verifying")
          : installed
            ? t("providers.setup.install.installed")
            : usesCustomBinary
              ? enabled
                ? t("providers.setup.install.customUnavailable")
                : t("providers.setup.install.customUnchecked")
              : t("providers.setup.install.required");

  async function runCommand<A, E>(
    label: string,
    request: () => Promise<AtomCommandResult<A, E>>,
  ): Promise<boolean> {
    if (pendingRef.current) return false;
    pendingRef.current = true;
    setPendingLabel(label);
    setError(null);
    try {
      const result = await request();
      if (result._tag === "Failure") {
        if (!isAtomCommandInterrupted(result)) {
          const failure = squashAtomCommandFailure(result);
          setError(failure instanceof Error ? failure.message : t("providers.setup.failed"));
        }
        return false;
      }
      return true;
    } catch {
      setError(t("providers.setup.failedRetry"));
      return false;
    } finally {
      pendingRef.current = false;
      setPendingLabel(null);
    }
  }

  async function openSignInPage() {
    if (!authorizationUrl) return;
    try {
      await ensureLocalApi().shell.openExternal(authorizationUrl);
      setError(null);
    } catch {
      setError(t("providers.setup.auth.openFailed"));
    }
  }

  async function copySignInLink() {
    if (!authorizationUrl) return;
    try {
      await writeTextToClipboard(authorizationUrl, "Google sign-in link");
      setCopiedFlowId(auth?.flowId ?? null);
      setError(null);
    } catch {
      setError(t("providers.setup.auth.copyFailed"));
    }
  }

  async function submitCallback() {
    const flowId = auth?.flowId;
    if (!flowId || !callbackUrl.trim() || auth.phase !== "waiting") return;
    const accepted = await runCommand(t("providers.setup.pending.redirect"), () =>
      completeAuth({ environmentId, input: { instanceId, flowId, callbackUrl } }),
    );
    if (accepted) {
      setCallbackDraft({ flowId: null, value: "" });
    }
  }

  async function signOut() {
    const confirmed = await ensureLocalApi().dialogs.confirm(
      t("providers.setup.auth.signOutConfirm", {
        action: usesBrowser
          ? t("providers.setup.auth.signOut")
          : t("providers.setup.auth.disconnect"),
        provider: provider.displayName ?? "Antigravity",
        environment: environmentLabel,
      }),
    );
    if (confirmed) {
      await runCommand(t("providers.setup.pending.signingOut"), () => logoutAuth(target));
    }
  }

  async function removeRuntime() {
    const confirmed = await ensureLocalApi().dialogs.confirm(
      t("providers.setup.install.removeConfirm", { environment: environmentLabel }),
    );
    if (confirmed) {
      await runCommand(t("providers.setup.pending.removing"), () => removeInstall(target));
    }
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <p className="font-medium">{t("providers.setup.runtime")}</p>
        <p role="status" className="text-muted-foreground">
          {installationStatusMessage}
        </p>
        {installation?.phase === "downloading" &&
        installation.totalBytes !== null &&
        installation.totalBytes > 0 ? (
          <progress
            aria-label={t("providers.setup.install.downloadAria")}
            className="h-1 w-full accent-foreground"
            value={installation.downloadedBytes}
            max={installation.totalBytes}
          />
        ) : null}
        {installation?.message && installation.message !== installationStatusMessage ? (
          <p className="text-muted-foreground [overflow-wrap:anywhere]">
            {tr(installation.message)}
          </p>
        ) : null}
        {usesCustomBinary ? (
          <p className="text-muted-foreground">{t("providers.setup.install.customDescription")}</p>
        ) : null}
        {!installed && !usesCustomBinary && !installActive && installation?.totalBytes ? (
          <p className="text-muted-foreground">
            {t("providers.setup.install.downloadSize", {
              size: Math.ceil(installation.totalBytes / 1_000_000),
            })}
          </p>
        ) : null}
        {!installed && !provider.setup?.canInstall ? (
          <p className="text-muted-foreground">{t("providers.setup.install.unavailable")}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {installActive && installation.operationId ? (
            <Button
              size="xs"
              variant="outline"
              disabled={actionsDisabled}
              onClick={() => {
                const operationId = installation.operationId;
                if (!operationId) return;
                void runCommand(t("providers.setup.pending.cancellingInstall"), () =>
                  cancelInstall({ environmentId, input: { instanceId, operationId } }),
                );
              }}
            >
              {t("providers.setup.install.cancel")}
            </Button>
          ) : !installActive && provider.setup?.canInstall ? (
            <Button
              size="xs"
              variant="outline"
              disabled={actionsDisabled || installation === null || authActive}
              onClick={() =>
                void runCommand(t("providers.setup.pending.startingInstall"), () =>
                  startInstall(target),
                )
              }
            >
              {installation?.installedVersion
                ? installation.version && installation.version !== installation.installedVersion
                  ? t("providers.setup.install.update")
                  : t("providers.setup.install.reinstall")
                : installation?.phase === "failed" || installation?.phase === "cancelled"
                  ? t("providers.setup.install.retry")
                  : installed
                    ? t("providers.setup.install.managed")
                    : t("providers.setup.install.install")}
            </Button>
          ) : null}
          {installation?.canRemove && !installActive ? (
            <Button
              size="xs"
              variant="ghost"
              disabled={actionsDisabled || authActive}
              onClick={() => void removeRuntime()}
            >
              {t("providers.setup.install.remove")}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2 border-t border-border/60 pt-3">
        <p className="font-medium">{tr(methodLabel)}</p>
        <p role="status" className="text-muted-foreground [overflow-wrap:anywhere]">
          {authStatusMessage}
        </p>
        {authorizationUrl ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Button size="xs" variant="outline" onClick={() => void openSignInPage()}>
                {t("providers.setup.auth.open")}
              </Button>
              <Button size="xs" variant="ghost" onClick={() => void copySignInLink()}>
                {copiedFlowId === auth?.flowId
                  ? t("providers.setup.auth.copied")
                  : t("providers.setup.auth.copy")}
              </Button>
            </div>
            {auth?.expiresAt ? (
              <p className="text-muted-foreground">
                {t("providers.setup.auth.expiresAt")}{" "}
                <time dateTime={auth.expiresAt}>
                  {new Date(auth.expiresAt).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </time>
                .
              </p>
            ) : null}
            <form
              className="grid gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void submitCallback();
              }}
            >
              <label htmlFor={`provider-callback-${instanceId}`}>
                {t("providers.setup.auth.callbackDescription")}
              </label>
              <Input
                id={`provider-callback-${instanceId}`}
                size="sm"
                type="url"
                autoComplete="off"
                spellCheck={false}
                placeholder="http://127.0.0.1:..."
                value={callbackUrl}
                maxLength={16_384}
                disabled={actionsDisabled}
                onChange={(event) =>
                  setCallbackDraft({ flowId: auth?.flowId ?? null, value: event.target.value })
                }
              />
              <Button
                size="xs"
                variant="outline"
                type="submit"
                className="w-fit"
                disabled={actionsDisabled || !callbackUrl.trim()}
              >
                {t("common.continue")}
              </Button>
            </form>
          </>
        ) : auth?.phase === "waiting" ? (
          <p className="text-muted-foreground">{t("providers.setup.auth.otherClient")}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {authActive && auth?.flowId ? (
            <Button
              size="xs"
              variant="ghost"
              disabled={actionsDisabled}
              onClick={() => {
                const flowId = auth.flowId;
                if (!flowId) return;
                void runCommand(t("providers.setup.pending.cancellingSignIn"), () =>
                  cancelAuth({ environmentId, input: { instanceId, flowId } }),
                );
              }}
            >
              {t("providers.setup.auth.cancel")}
            </Button>
          ) : !authActive && !authenticated && provider.setup?.canAuthenticate ? (
            <Button
              size="xs"
              variant="outline"
              disabled={actionsDisabled || !installed || auth === null || installActive}
              onClick={() =>
                void runCommand(t("providers.setup.pending.startingSignIn"), () =>
                  startAuth(target),
                )
              }
            >
              {usesBrowser
                ? auth?.phase === "failed" || auth?.phase === "cancelled"
                  ? t("providers.setup.auth.retryGoogle")
                  : t("providers.setup.auth.signInGoogle")
                : auth?.phase === "failed" || auth?.phase === "cancelled"
                  ? t("providers.setup.auth.retryConnection")
                  : t("providers.setup.auth.connect")}
            </Button>
          ) : null}
          {!authActive && provider.setup?.canAuthenticate ? (
            <Button
              size="xs"
              variant={authenticated ? "outline" : "ghost"}
              disabled={actionsDisabled || auth === null}
              onClick={() => void signOut()}
            >
              {usesBrowser
                ? t("providers.setup.auth.signOut")
                : t("providers.setup.auth.disconnect")}
            </Button>
          ) : null}
        </div>
      </div>

      {pendingLabel ? <p role="status">{pendingLabel}.</p> : null}
      {error || queryError ? (
        <div className="grid gap-2">
          <p role="alert" className="text-destructive [overflow-wrap:anywhere]">
            {error ?? queryError}
          </p>
          {queryError ? (
            <Button
              size="xs"
              variant="outline"
              className="w-fit"
              onClick={() => {
                authQuery.refresh();
                installQuery.refresh();
              }}
            >
              {t("providers.setup.retryStatus")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
