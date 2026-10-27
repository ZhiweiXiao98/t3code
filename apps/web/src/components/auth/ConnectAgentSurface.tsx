import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import { useI18n, splitWebTranslation } from "~/i18n/WebI18nContext";
import { translateWebSource } from "~/i18n/messages";

import {
  type AuthMcpApprovalDecision,
  type AuthMcpApprovalDetails,
  AuthMcpApprovalError,
  AuthMcpClientAccess,
  type AuthMcpAuthorizationRequest,
} from "@t3tools/contracts";
import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { isLoopbackHost } from "@t3tools/shared/preview";
import { EyeIcon, type LucideIcon } from "lucide-react";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { type ReactNode, useEffect, useState } from "react";

import { PrimaryEnvironmentHttpClient } from "~/environments/primary/httpClient";
import { runPrimaryHttp } from "~/lib/runtime";
import { cn } from "~/lib/utils";
import { runtimeModeConfig } from "../chat/runtimeModeConfig";
import { Alert, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { RadioGroup } from "../ui/radio-group";
import { Spinner } from "../ui/spinner";
import { AuthSurfaceShell } from "./AuthSurfaceShell";

const accessConfig: Record<
  AuthMcpClientAccess,
  { readonly label: string; readonly description: string; readonly icon: LucideIcon }
> = {
  "read-only": {
    label: "Read only",
    description: "Read projects and threads. Cannot start, message or change anything.",
    icon: EyeIcon,
  },
  ...runtimeModeConfig,
};

function redirectsToThisComputer(redirectHost: string): boolean {
  return isLoopbackHost(new URL(`http://${redirectHost}`).hostname);
}

type Loaded =
  | { readonly status: "loading" }
  | { readonly status: "invalid"; readonly message: string }
  | { readonly status: "ready"; readonly details: AuthMcpApprovalDetails };

const UNREACHABLE = "Could not reach this environment. Try again.";
const isApprovalError = Schema.is(AuthMcpApprovalError);

type Answer<A> =
  | { readonly kind: "ok"; readonly value: A }
  | { readonly kind: "redirect"; readonly url: string }
  | { readonly kind: "error"; readonly message: string };

function runApproval<A>(
  call: (
    client: Context.Service.Shape<typeof PrimaryEnvironmentHttpClient>,
  ) => Effect.Effect<A | { readonly redirectTo: string }, unknown>,
  locale: ResolvedAppLocale,
): Promise<Answer<A>> {
  return runPrimaryHttp(
    PrimaryEnvironmentHttpClient.pipe(
      Effect.flatMap(call),
      Effect.map((value): Answer<A> =>
        typeof value === "object" && value !== null && "redirectTo" in value
          ? { kind: "redirect", url: value.redirectTo }
          : { kind: "ok", value: value as A },
      ),
      Effect.catch((error) =>
        Effect.succeed<Answer<A>>({
          kind: "error",
          message: isApprovalError(error) ? error.message : translateWebSource(locale, UNREACHABLE),
        }),
      ),
    ),
  ).catch((): Answer<A> => ({ kind: "error", message: translateWebSource(locale, UNREACHABLE) }));
}

function readAuthorizationRequest(): AuthMcpAuthorizationRequest {
  return Object.fromEntries(new URL(window.location.href).searchParams);
}

/** Sessions can grant only scopes they hold. */
function oneClickApproves(details: AuthMcpApprovalDetails, access: AuthMcpClientAccess) {
  return details.csrfToken !== undefined && (details.oneClickAccess ?? []).includes(access);
}

export function ConnectAgentSurface() {
  const { t, locale } = useI18n();
  const tx = (source: string) => translateWebSource(locale, source);

  const [authorization] = useState(readAuthorizationRequest);
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [access, setAccess] = useState<AuthMcpClientAccess>("read-only");
  const [pairingCode, setPairingCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [pending, setPending] = useState<"approve" | "deny" | null>(null);

  useEffect(() => {
    let cancelled = false;
    void runApproval((client) => client.mcpOAuth.approval({ payload: authorization }), locale).then(
      (answer) => {
        if (cancelled) return;
        if (answer.kind === "redirect") {
          window.location.replace(answer.url);
          return;
        }
        setLoaded(
          answer.kind === "error"
            ? { status: "invalid", message: answer.message }
            : { status: "ready", details: answer.value },
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [authorization, locale]);

  const decide = async (choice: "approve" | "deny") => {
    if (loaded.status !== "ready") return;
    setPending(choice);
    setErrorMessage("");
    const { csrfToken } = loaded.details;
    const decision: AuthMcpApprovalDecision =
      choice === "deny"
        ? { _tag: "deny" }
        : csrfToken !== undefined && oneClickApproves(loaded.details, access)
          ? { _tag: "browser-session", access, csrfToken }
          : { _tag: "pairing-code", access, code: pairingCode.trim() };
    const answer = await runApproval(
      (client) => client.mcpOAuth.decision({ payload: { authorization, decision } }),
      locale,
    );
    if (answer.kind === "redirect") {
      window.location.replace(answer.url);
      return;
    }
    setPending(null);
    setErrorMessage(
      answer.kind === "error" ? answer.message : tx("The sign-in could not continue."),
    );
  };

  if (loaded.status === "loading") {
    return (
      <AuthSurfaceShell>
        <ConnectAgentHeading
          title={tx("Checking the sign-in request")}
          description={tx("One moment while this environment verifies the agent's request.")}
        />
        <Spinner className="mt-6" size="lg" tone="muted" />
      </AuthSurfaceShell>
    );
  }

  if (loaded.status === "invalid") {
    return (
      <AuthSurfaceShell>
        <ConnectAgentHeading
          title={tx("This sign-in cannot continue")}
          description={loaded.message}
        />
        <p className="mt-4 text-sm text-muted-foreground">
          {tx("Close this page and start the sign-in again from your agent.")}
        </p>
      </AuthSurfaceShell>
    );
  }

  const { details } = loaded;
  const [beforeHost, afterHost] = splitWebTranslation(t, "connectAgent.requestDescription", "host");
  const [beforeRedirect, afterRedirect] = splitWebTranslation(
    t,
    "connectAgent.remoteWarning",
    "host",
  );
  const [beforeCommand, afterCommand] = splitWebTranslation(
    t,
    "connectAgent.pairingHelp",
    "command",
  );
  const oneClick = oneClickApproves(details, access);
  const canApprove = pending === null && (oneClick || pairingCode.trim().length > 0);

  return (
    <AuthSurfaceShell>
      <ConnectAgentHeading
        title={t("connectAgent.title", { client: details.clientName })}
        description={
          <>
            {beforeHost}
            <span className="font-medium text-foreground">{details.environmentHost}</span>
            {afterHost}
          </>
        }
      />
      <p className="mt-2 text-xs text-muted-foreground">
        {redirectsToThisComputer(details.redirectHost) ? (
          <>{t("connectAgent.localWarning", { host: details.redirectHost })}</>
        ) : (
          <>
            {beforeRedirect}
            <span className="font-medium text-foreground">{details.redirectHost}</span>
            {afterRedirect}
          </>
        )}
      </p>

      <form
        className="mt-6 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (canApprove) void decide("approve");
        }}
      >
        <div className="space-y-2">
          <span id="connect-agent-access-label" className="text-sm font-medium">
            {tx("What it may do")}
          </span>
          <RadioGroup
            aria-labelledby="connect-agent-access-label"
            value={access}
            onValueChange={(value) => setAccess(value as AuthMcpClientAccess)}
          >
            {AuthMcpClientAccess.literals.map((option) => (
              <AccessOption key={option} access={option} selected={option === access} />
            ))}
          </RadioGroup>
          <p className="text-xs text-muted-foreground">
            {tx(
              "Beyond read only, it can start, message and stop threads, and none of them can run with more than the mode you pick.",
            )}
          </p>
        </div>

        {oneClick ? null : (
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="connect-agent-pairing-code">
              {tx("Pairing code")}
            </label>
            <Input
              id="connect-agent-pairing-code"
              autoCapitalize="none"
              autoComplete="one-time-code"
              autoCorrect="off"
              disabled={pending !== null}
              nativeInput
              onChange={(event) => setPairingCode(event.currentTarget.value)}
              placeholder={tx("Paste a one-time pairing code")}
              spellCheck={false}
              value={pairingCode}
            />
            <p className="text-xs text-muted-foreground">
              {beforeCommand}
              <code>t3 auth pairing create</code>
              {afterCommand}
            </p>
          </div>
        )}

        {errorMessage ? (
          <Alert variant="error">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button disabled={!canApprove} type="submit">
            {pending === "approve" ? tx("Approving…") : tx("Approve")}
          </Button>
          <Button
            disabled={pending !== null}
            onClick={() => void decide("deny")}
            type="button"
            variant="outline"
          >
            {pending === "deny" ? tx("Denying…") : tx("Deny")}
          </Button>
        </div>
      </form>
    </AuthSurfaceShell>
  );
}

function ConnectAgentHeading({
  title,
  description,
}: {
  readonly title: string;
  readonly description: ReactNode;
}) {
  const { locale } = useI18n();
  const tx = (source: string) => translateWebSource(locale, source);
  return (
    <>
      <p className="text-3xs font-semibold tracking-widest text-primary uppercase">
        {tx("Agent sign-in")}
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
    </>
  );
}

function AccessOption({
  access,
  selected,
}: {
  readonly access: AuthMcpClientAccess;
  readonly selected: boolean;
}) {
  const { locale } = useI18n();
  const tx = (source: string) => translateWebSource(locale, source);
  const { label, description, icon: Icon } = accessConfig[access];
  return (
    <RadioPrimitive.Root
      value={access}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-left outline-none transition-[background-color,border-color,box-shadow]",
        "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        selected
          ? "border-primary bg-background ring-2 ring-inset ring-primary/25 dark:border-transparent dark:bg-primary/10 dark:ring-1 dark:ring-primary/30"
          : "border-border bg-background hover:bg-muted/50 dark:border-transparent dark:bg-white/[0.035] dark:hover:bg-accent",
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "mt-0.5 size-4 shrink-0",
          selected ? "text-primary" : "text-muted-foreground",
        )}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{tx(label)}</span>
        <span className="block text-xs text-muted-foreground">{tx(description)}</span>
      </span>
    </RadioPrimitive.Root>
  );
}
