import type { WebTranslate } from "./WebI18nContext";

// Only these exact, application-owned discovery hints are localized. Keep unknown host prose intact.
const INSTALL_HINT_KEYS: ReadonlyMap<
  string,
  | "sourceControl.install.origin"
  | "sourceControl.install.gitcafe"
  | "sourceControl.install.forgejo"
  | "sourceControl.install.bitbucketToken"
> = new Map([
  [
    "Install the Origin CLI with `curl -fsSL https://downloads.cursor.com/origin/install.sh | sh`, then run `origin auth login`.",
    "sourceControl.install.origin",
  ],
  [
    "Install the GitCafe CLI with `bun install -g @gitcafe/cli`, then run `cafe auth login --host https://git.cafe/api`, save a token in Settings, or set CAFE_TOKEN on the server.",
    "sourceControl.install.gitcafe",
  ],
  [
    "Install `fj` 0.6 or later from https://codeberg.org/forgejo-contrib/forgejo-cli and run `fj --host <server-url> auth add-token`, or install `tea` 0.16 or later from https://gitea.com/gitea/tea and run `tea login add` for each Forgejo or Gitea server.",
    "sourceControl.install.forgejo",
  ],
  [
    "Add a Bitbucket token in Settings \u2192 Source Control.",
    "sourceControl.install.bitbucketToken",
  ],
] as const);

export function translateSourceControlInstallHint(source: string, t: WebTranslate): string {
  const key = INSTALL_HINT_KEYS.get(source);
  return key === undefined ? source : t(key);
}

/** The unknown-auth row keeps arbitrary server details intact. */
export function sourceControlUnknownAuthSummary(
  provider: string,
  detail: string | null,
  fallbackHint: string,
  t: WebTranslate,
): string {
  const hint =
    detail === "An access token is configured."
      ? t("sourceControl.auth.accessTokenConfigured")
      : detail === "An API token is configured."
        ? t("sourceControl.auth.apiTokenConfigured")
        : (detail ?? fallbackHint);
  return t("sourceControl.summary.verifyFailed", { provider, hint });
}
