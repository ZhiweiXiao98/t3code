import * as Schema from "effect/Schema";

/** Finite application-owned auth copy. Provider output never selects a code by text. */
export const PROVIDER_AUTH_MESSAGE_SOURCE = {
  "chatgpt.completeFailed": "ChatGPT could not complete sign-in. Try again.",
  "antigravity.nodeRequired":
    "Antigravity sign-in requires Node.js. Install Node.js and make sure node is on PATH, then retry.",

  "auth.failed": "Sign-in failed. Start again.",
  "auth.inactive": "This sign-in is no longer active in this client.",
  "auth.finishExisting": "Finish or cancel the existing sign-in first.",
  "auth.sharedChanged": "This provider's shared sign-in changed.",
  "auth.changing": "Provider sign-in is changing. Try again after it finishes.",
  "auth.busy": "Provider setup is already in progress.",
  "auth.startFailed": "Could not start sign-in. Try again.",
  "auth.starting": "Starting sign-in.",
  "auth.methodUnavailable": "The provider did not advertise this sign-in method.",
  "auth.completeSignIn": "Complete sign-in to continue.",
  "auth.checking": "Checking provider sign-in.",
  "auth.expired": "Sign-in expired. Start again.",
  "auth.succeeded": "Sign-in complete.",
  "auth.interactionUnavailable": "This sign-in interaction is no longer available.",
  "auth.responseBusy": "A sign-in response is already in progress.",
  "auth.redirectUnsupported": "This sign-in does not accept a redirect URL.",
  "auth.cancelled": "Sign-in cancelled.",
  "auth.stopping": "Provider setup is already stopping.",
  "auth.signedOut": "Signed out.",
  "auth.signOutFailed": "Could not sign out. Try again.",
  "auth.otherClient": "Sign-in is in progress in another client.",
  "auth.unsupported": "This provider does not support sign-in in T3 Code.",
  "auth.instanceUnavailable": "This provider instance is no longer available.",
  "auth.readSessionsFailed": "Could not read the provider's active sessions. Try again.",
  "auth.stopSessionsFailed": "Could not stop all sessions for this provider. Try again.",
  "auth.sharedBusy":
    "Another provider instance is changing this shared sign-in. Finish or cancel it first.",
  "auth.transferUnsupported": "This provider does not support ChatGPT profile transfer.",
  "auth.interactionUnsupported": "This provider does not accept this sign-in interaction.",
  "auth.removeUnsupported": "This provider does not support removing saved sign-in methods.",
  "cursor.readFailed": "Could not read the Cursor sign-in. Try signing in again.",
  "cursor.changing": "Cursor sign-in or sign-out is in progress. Try again after it finishes.",
  "cursor.credentialsRequired": "Sign in with Cursor or add CURSOR_API_KEY in provider settings.",
  "cursor.sdkUnavailable": "Could not load the Cursor SDK. Try signing in again.",
  "cursor.waiting":
    "Open the Cursor sign-in page and finish signing in. This page updates automatically.",
  "cursor.failed": "Cursor sign-in failed. Start sign-in again.",
  "cursor.checking": "Checking Cursor sign-in.",
  "cursor.saveFailed": "Could not save the Cursor sign-in. Try again.",
  "cursor.clearRejectedFailed": "Could not clear the rejected Cursor sign-in. Try signing out.",
  "cursor.succeeded": "Signed in with Cursor.",
  "cursor.expired": "Cursor sign-in expired. Start sign-in again.",
  "cursor.failedOrExpired": "Cursor sign-in failed or expired. Start sign-in again.",
  "cursor.enableFirst": "Enable Cursor before signing in.",
  "cursor.removeKeyForLogin":
    "Remove CURSOR_API_KEY from this provider's environment before using browser sign-in.",
  "cursor.busy": "Cursor setup is already in progress.",
  "cursor.startFailed": "Could not start Cursor sign-in. Try again.",
  "cursor.starting": "Starting Cursor sign-in.",
  "cursor.noRedirectNeeded": "Finish signing in on the Cursor website. No redirect URL is needed.",
  "cursor.cancelled": "Cursor sign-in was cancelled.",
  "cursor.removeKeyToDisconnect":
    "Remove CURSOR_API_KEY from this provider's environment to disconnect it.",
  "cursor.stopping": "Cursor setup is already stopping.",
  "cursor.clearFailed": "Could not clear the Cursor sign-in. Try again.",
  "cursor.signedOut": "Signed out of Cursor.",
  "cursor.signOutFailed": "Cursor sign-out failed. Try again.",
  "cursor.verifyFailed": "Could not verify the Cursor sign-in. Try again.",
  "antigravity.noResponse":
    "Antigravity has not reached Google after 30 seconds. Check this machine's network connection. Broken IPv6 is a common cause.",
  "antigravity.unreachable":
    "Antigravity could not reach Google. Check this machine's network connection, then start sign-in again.",
  "antigravity.forwardFailed": "Could not deliver the sign-in response. Start sign-in again.",
  "antigravity.subscriptionRequired":
    "Google requires an eligible Antigravity subscription for this account.",
  "antigravity.notApproved": "Google sign-in was not approved. Start sign-in again.",
  "antigravity.sessionFailed":
    "Antigravity authenticated, but could not initialize a session or load models.",
  "antigravity.credentialsRejected":
    "Antigravity rejected the configured credentials. Check the provider settings.",
  "antigravity.failed": "Google sign-in failed. Start sign-in again.",
  "antigravity.credentialsFailed":
    "Antigravity could not authenticate with the configured credentials.",
  "antigravity.changing":
    "Antigravity sign-in or sign-out is in progress. Try again after it finishes.",
  "antigravity.signedIn": "Signed in with Google.",
  "antigravity.connected": "Connected to Antigravity.",
  "antigravity.waiting":
    "Open the Google sign-in link. If you are remote, paste the redirect URL here.",
  "antigravity.checkingAccess": "Checking Antigravity access and models.",
  "antigravity.expired": "Google sign-in expired. Start sign-in again.",
  "antigravity.busy": "Antigravity setup is already in progress.",
  "antigravity.startFailed": "Could not start Google sign-in. Try again.",
  "antigravity.starting": "Starting Google sign-in.",
  "antigravity.checkingCredentials": "Checking credentials.",
  "antigravity.responseSent": "The sign-in response was already sent. Wait for Google to finish.",
  "antigravity.waitForLink": "Wait for the Google sign-in link before you send a redirect URL.",
  "antigravity.waitingForGoogle": "Waiting for Google to finish sign-in.",
  "antigravity.cancelled": "Google sign-in was cancelled.",
  "antigravity.stopping": "Antigravity setup is already stopping.",
  "antigravity.cancelledBySignOut": "Google sign-in was cancelled by sign-out.",
  "antigravity.signOutUnsupported":
    "This Antigravity version does not support sign-out. Update the provider.",
  "antigravity.signOutTimedOut": "Antigravity sign-out timed out.",
  "antigravity.signedOut": "Signed out of Google.",
  "antigravity.signOutFailed": "Antigravity sign-out failed. Try again.",
  "antigravity.tempDirectoryFailed": "Could not create an Antigravity runtime temp directory.",
  "antigravity.responseTooLong": "The sign-in response URL is too long.",
  "antigravity.pasteRedirect": "Paste the complete redirect URL from the Google sign-in page.",
  "antigravity.wrongRedirect": "This redirect URL does not belong to the current sign-in.",
  "antigravity.singleResponseRequired":
    "The redirect URL must contain one Google sign-in response.",
  "antigravity.wrongIssuer": "The redirect URL is not a Google sign-in response.",
  "antigravity.forwardTimedOut": "The sign-in response timed out. Start sign-in again.",
  "acp.prepareFailed": "Could not prepare the selected ACP agent.",
  "acp.startFailed": "Could not start the selected ACP agent.",
  "acp.inspectFailed": "Could not inspect the selected ACP agent.",
  "acp.prepareFirst": "Prepare this ACP agent before signing in.",
  "acp.discoverFailed": "Could not discover this agent's sign-in methods.",
  "acp.discoveryTimedOut": "The ACP agent did not advertise sign-in methods in time.",
  "acp.discoveryInterrupted":
    "Sign-in discovery was interrupted by an active provider session. Try again.",
  "acp.terminalUnavailable": "Interactive provider login is unavailable on this environment.",
  "acp.openTerminalFailed": "Could not open the provider sign-in terminal.",
  "acp.terminalGone": "The provider sign-in terminal is no longer available.",
  "acp.commandFailed": "The provider login command did not finish successfully.",
  "acp.enableFirst": "Enable this provider before signing in.",
  "acp.initializeFailed": "Could not initialize the selected ACP agent.",
  "acp.methodGone": "The agent no longer advertises this sign-in method.",
  "acp.terminalSessionFailed": "The provider could not create a session after terminal sign-in.",
  "acp.explicitSignInUnsupported": "This runtime does not support explicit ACP sign-in.",
  "acp.completeFailed": "The ACP agent could not complete sign-in.",
  "acp.sessionFailed": "The provider could not create a session after sign-in.",
  "acp.signOutFailed": "This ACP agent could not sign out. It may not advertise logout support.",
  "acp.signOutTimedOut": "The ACP agent did not finish signing out in time.",
  "chatgpt.unreachable": "Could not reach ChatGPT sign-in. Try again.",
  "chatgpt.configurationUnverified": "ChatGPT sign-in configuration could not be verified.",
  "chatgpt.readFailed": "Could not read the saved ChatGPT connection.",
  "chatgpt.connectionInvalid": "The saved ChatGPT connection is invalid. Sign in again.",
  "chatgpt.saveFailed": "Could not save the ChatGPT connection.",
  "chatgpt.readRegistrationFailed": "Could not read the ChatGPT sign-in registration. Try again.",
  "chatgpt.registrationInvalid": "The saved ChatGPT sign-in registration is invalid.",
  "chatgpt.saveRegistrationFailed": "Could not save the ChatGPT sign-in registration. Try again.",
  "chatgpt.clearFailed": "Could not clear the ChatGPT connection. Try again.",
  "chatgpt.unavailable": "ChatGPT sign-in is temporarily unavailable. Try again.",
  "chatgpt.notAccepted": "ChatGPT did not accept this sign-in. Try again.",
  "chatgpt.disconnected": "Your ChatGPT connection expired or was disconnected. Sign in again.",
  "chatgpt.clientRejected":
    "OpenAI rejected this app's client registration. Check the ChatGPT connection configuration.",
  "chatgpt.codeExpired": "This sign-in code expired. Start again.",
  "chatgpt.declined": "ChatGPT sign-in was declined. Sign in again when you are ready.",
  "chatgpt.invalidTokenResponse": "ChatGPT returned an invalid token response. Sign in again.",
  "chatgpt.callbackStartRetry": "Could not start the local sign-in callback. Try again.",
  "chatgpt.callbackStartFailed": "Could not start the local sign-in callback.",
  "chatgpt.wrongRedirect": "This redirect URL does not belong to the active ChatGPT sign-in.",
  "chatgpt.callbackFailed": "ChatGPT sign-in could not be completed.",
  "chatgpt.unverified": "ChatGPT sign-in could not be verified. Start again.",
  "chatgpt.callbackRetry": "ChatGPT sign-in could not be completed. Start again.",
  "chatgpt.registrationIncomplete": "ChatGPT registration is incomplete. Start sign-in again.",
  "chatgpt.reconnectExpiredCode":
    "This sign-in code expired. Reconnect the saved ChatGPT profile to start a fresh sign-in.",
  "chatgpt.identityMissing": "ChatGPT did not return a verified identity. Sign in again.",
  "chatgpt.differentAccount":
    "This sign-in returned a different ChatGPT account. Use the different-account sign-in option instead. Your saved connection is unchanged.",
  "chatgpt.registrationConflict":
    "ChatGPT returned a conflicting account registration. Start again.",
  "chatgpt.connectionUnsupported": "ChatGPT returned an unsupported connection. Sign in again.",
  "chatgpt.newSharingDisabled":
    "Token sharing was not enabled for the new account. Your existing ChatGPT connection is unchanged.",
  "chatgpt.sharingDisabledAfterSignIn":
    "Signed in with ChatGPT, but token sharing is disabled. Sign in again and enable token sharing, or use another provider.",
  "chatgpt.signInRequired": "Sign in with ChatGPT to use managed Codex.",
  "chatgpt.connectionChanged": "The ChatGPT connection changed. Start a new session.",
  "chatgpt.sharingRequired":
    "Token sharing is disabled. Sign in with ChatGPT and enable token sharing.",
  "chatgpt.renewTooEarly": "ChatGPT cannot renew this connection yet. Try again shortly.",
  "chatgpt.expired": "Your ChatGPT connection expired. Sign in again.",
  "chatgpt.renewFailed": "Could not renew the ChatGPT connection. Retry, or sign in again.",
  "chatgpt.renewInvalid": "ChatGPT returned an invalid renewal. Sign in again.",
  "chatgpt.sharingRemoved": "ChatGPT token sharing is no longer enabled. Sign in again.",
  "chatgpt.localSignOutWarning":
    "Signed out locally. Remote revocation could not be confirmed. Disconnect the app in ChatGPT Settings.",
  "chatgpt.removeIncompleteOnly": "Only incomplete ChatGPT connections can be removed.",
  "chatgpt.removeFailed": "Could not remove the saved ChatGPT connection. Try again.",
  "chatgpt.savedConnectionGone": "This saved connection is no longer available.",
  "chatgpt.finishBeforeTransfer": "Complete ChatGPT sign-in before transferring this connection.",
  "chatgpt.transferInvalid": "The transferred ChatGPT connection is invalid or expired.",
  "chatgpt.transferUnverified": "The transferred ChatGPT identity could not be verified.",
  "chatgpt.transferMismatch": "The transferred ChatGPT identity does not match its profile.",
  "chatgpt.transferConflict":
    "The transferred identity conflicts with the saved ChatGPT connection.",
  "chatgpt.lockFailed": "Could not lock the ChatGPT connection for an update. Try again.",
} as const;

export const ProviderAuthMessageDescriptor = Schema.Struct({
  // Display metadata never duplicates provider output, callback data, or credentials.
  params: Schema.optionalKey(Schema.Never),
  code: Schema.Literals([
    "chatgpt.completeFailed",
    "antigravity.nodeRequired",

    "auth.failed",
    "auth.inactive",
    "auth.finishExisting",
    "auth.sharedChanged",
    "auth.changing",
    "auth.busy",
    "auth.startFailed",
    "auth.starting",
    "auth.methodUnavailable",
    "auth.completeSignIn",
    "auth.checking",
    "auth.expired",
    "auth.succeeded",
    "auth.interactionUnavailable",
    "auth.responseBusy",
    "auth.redirectUnsupported",
    "auth.cancelled",
    "auth.stopping",
    "auth.signedOut",
    "auth.signOutFailed",
    "auth.otherClient",
    "auth.unsupported",
    "auth.instanceUnavailable",
    "auth.readSessionsFailed",
    "auth.stopSessionsFailed",
    "auth.sharedBusy",
    "auth.transferUnsupported",
    "auth.interactionUnsupported",
    "auth.removeUnsupported",
    "cursor.readFailed",
    "cursor.changing",
    "cursor.credentialsRequired",
    "cursor.sdkUnavailable",
    "cursor.waiting",
    "cursor.failed",
    "cursor.checking",
    "cursor.saveFailed",
    "cursor.clearRejectedFailed",
    "cursor.succeeded",
    "cursor.expired",
    "cursor.failedOrExpired",
    "cursor.enableFirst",
    "cursor.removeKeyForLogin",
    "cursor.busy",
    "cursor.startFailed",
    "cursor.starting",
    "cursor.noRedirectNeeded",
    "cursor.cancelled",
    "cursor.removeKeyToDisconnect",
    "cursor.stopping",
    "cursor.clearFailed",
    "cursor.signedOut",
    "cursor.signOutFailed",
    "cursor.verifyFailed",
    "antigravity.noResponse",
    "antigravity.unreachable",
    "antigravity.forwardFailed",
    "antigravity.subscriptionRequired",
    "antigravity.notApproved",
    "antigravity.sessionFailed",
    "antigravity.credentialsRejected",
    "antigravity.failed",
    "antigravity.credentialsFailed",
    "antigravity.changing",
    "antigravity.signedIn",
    "antigravity.connected",
    "antigravity.waiting",
    "antigravity.checkingAccess",
    "antigravity.expired",
    "antigravity.busy",
    "antigravity.startFailed",
    "antigravity.starting",
    "antigravity.checkingCredentials",
    "antigravity.responseSent",
    "antigravity.waitForLink",
    "antigravity.waitingForGoogle",
    "antigravity.cancelled",
    "antigravity.stopping",
    "antigravity.cancelledBySignOut",
    "antigravity.signOutUnsupported",
    "antigravity.signOutTimedOut",
    "antigravity.signedOut",
    "antigravity.signOutFailed",
    "antigravity.tempDirectoryFailed",
    "antigravity.responseTooLong",
    "antigravity.pasteRedirect",
    "antigravity.wrongRedirect",
    "antigravity.singleResponseRequired",
    "antigravity.wrongIssuer",
    "antigravity.forwardTimedOut",
    "acp.prepareFailed",
    "acp.startFailed",
    "acp.inspectFailed",
    "acp.prepareFirst",
    "acp.discoverFailed",
    "acp.discoveryTimedOut",
    "acp.discoveryInterrupted",
    "acp.terminalUnavailable",
    "acp.openTerminalFailed",
    "acp.terminalGone",
    "acp.commandFailed",
    "acp.enableFirst",
    "acp.initializeFailed",
    "acp.methodGone",
    "acp.terminalSessionFailed",
    "acp.explicitSignInUnsupported",
    "acp.completeFailed",
    "acp.sessionFailed",
    "acp.signOutFailed",
    "acp.signOutTimedOut",
    "chatgpt.unreachable",
    "chatgpt.configurationUnverified",
    "chatgpt.readFailed",
    "chatgpt.connectionInvalid",
    "chatgpt.saveFailed",
    "chatgpt.readRegistrationFailed",
    "chatgpt.registrationInvalid",
    "chatgpt.saveRegistrationFailed",
    "chatgpt.clearFailed",
    "chatgpt.unavailable",
    "chatgpt.notAccepted",
    "chatgpt.disconnected",
    "chatgpt.clientRejected",
    "chatgpt.codeExpired",
    "chatgpt.declined",
    "chatgpt.invalidTokenResponse",
    "chatgpt.callbackStartRetry",
    "chatgpt.callbackStartFailed",
    "chatgpt.wrongRedirect",
    "chatgpt.callbackFailed",
    "chatgpt.unverified",
    "chatgpt.callbackRetry",
    "chatgpt.registrationIncomplete",
    "chatgpt.reconnectExpiredCode",
    "chatgpt.identityMissing",
    "chatgpt.differentAccount",
    "chatgpt.registrationConflict",
    "chatgpt.connectionUnsupported",
    "chatgpt.newSharingDisabled",
    "chatgpt.sharingDisabledAfterSignIn",
    "chatgpt.signInRequired",
    "chatgpt.connectionChanged",
    "chatgpt.sharingRequired",
    "chatgpt.renewTooEarly",
    "chatgpt.expired",
    "chatgpt.renewFailed",
    "chatgpt.renewInvalid",
    "chatgpt.sharingRemoved",
    "chatgpt.localSignOutWarning",
    "chatgpt.removeIncompleteOnly",
    "chatgpt.removeFailed",
    "chatgpt.savedConnectionGone",
    "chatgpt.finishBeforeTransfer",
    "chatgpt.transferInvalid",
    "chatgpt.transferUnverified",
    "chatgpt.transferMismatch",
    "chatgpt.transferConflict",
    "chatgpt.lockFailed",
  ]),
});
export type ProviderAuthMessageDescriptor = typeof ProviderAuthMessageDescriptor.Type;
export type ProviderAuthMessageCode = ProviderAuthMessageDescriptor["code"];

export interface ProviderAuthMessage {
  readonly message: string | null;
  readonly messageDescriptor?: ProviderAuthMessageDescriptor | undefined;
}

export function providerAuthMessage(code: ProviderAuthMessageCode) {
  return { message: PROVIDER_AUTH_MESSAGE_SOURCE[code], messageDescriptor: { code } };
}

export function providerAuthErrorFields(code: ProviderAuthMessageCode) {
  return { detail: PROVIDER_AUTH_MESSAGE_SOURCE[code], messageDescriptor: { code } };
}

export function providerAuthErrorMessage(error: {
  readonly detail: string;
  readonly messageDescriptor?: ProviderAuthMessageDescriptor | undefined;
}): ProviderAuthMessage {
  // An unmarked raw error replaces old provenance, even when its text happens to match our copy.
  return { message: error.detail, messageDescriptor: error.messageDescriptor };
}

const isDescriptor = Schema.is(ProviderAuthMessageDescriptor);
const failurePrefixCodes: ReadonlySet<ProviderAuthMessageCode> = new Set([
  "acp.prepareFailed",
  "acp.startFailed",
  "acp.inspectFailed",
  "acp.discoverFailed",
  "acp.openTerminalFailed",
  "acp.initializeFailed",
  "acp.terminalSessionFailed",
  "acp.completeFailed",
  "acp.sessionFailed",
  "acp.signOutFailed",
]);

/** Localize tagged copy only. ACP suffixes remain solely in the original public message. */
export function formatProviderAuthMessage(
  value: ProviderAuthMessage | null | undefined,
  translate: (source: string) => string,
): string | null {
  if (value?.message == null) return null;
  const descriptor = value.messageDescriptor;
  if (!isDescriptor(descriptor)) return value.message;
  const source = PROVIDER_AUTH_MESSAGE_SOURCE[descriptor.code];
  if (value.message === source) return translate(source);
  if (failurePrefixCodes.has(descriptor.code)) {
    const prefix = source.endsWith(".") ? `${source} ` : `${source}. `;
    if (value.message.startsWith(prefix)) {
      const translated = translate(source);
      if (translated === source) return value.message;
      // Provenance comes from the closed source code, never from matching an unmarked string.
      return `${translated} ${value.message.slice(prefix.length)}`;
    }
  }
  return value.message;
}
