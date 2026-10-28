# Cloud Android signing bootstrap — review draft

No fixed user computer, local JDK, password in chat, or long-lived cloud machine is
required. This directory contains non-secret design and tests, not a completed
key ceremony. Do not run a real bootstrap until its exact source and crypto
profile are reviewed, the environment is configured, and the owner authorizes
that specific initialization.

## One identity, even after a failed job

A fixed concurrency group serializes bootstrap jobs. Before using a password or
creating a key, atomically create `refs/heads/signing/android-identity-state`.
The initial branch has an empty-base tree containing only a public reservation
JSON (source SHA, run ID, creation time). It has NO workflows and no secrets.
An existing ref, whether RESERVED or READY, is a hard stop. GitHub's create-ref
conflict is a hard stop as well. Never force-update, reset, delete, or automatically
replace an identity. A failed job leaves the reservation in place; even if no
artifact survives, a new identity requires a separate explicit recovery decision.
A lost key is not fixed by silently rerunning initialization.

Only after encrypted-artifact upload acknowledgement append READY metadata:
certificate SHA256, encrypted-container SHA256, artifact ID, source SHA and run ID.
The state update must still match the exact reservation and be a non-forced fast
forward. Never record a passphrase, a private key, Base64 ciphertext, or user email
in the ledger. This ledger is an accidental-regeneration guard, not a defense
against a repository administrator intentionally changing or deleting it.

## Workflow trust and data flow

- Manual dispatch only; exact full source SHA, repository, branch, event and run
  attempt must match. Never use pull_request or pull_request_target triggers.
- Reserve job has no signing environment; only narrowly scoped contents write.
- Generation job uses only the separately approved `android-signing` environment.
  It executes reviewed code, never arbitrary PR/build-provided scripts.
- Standard hosted Ubuntu runner only; short timeout; no shared cache, no debug
  logging, no user-data collection, no dependency install scripts with secrets.
- Password enters only through an environment Secret. It is not a dispatch
  input, command interpolation, command-line value, step output, or log message.
- Require independent recovery-passphrase retention acknowledgement. Length or
  character-class checks alone do not prove a password was randomly generated.
- Pin and explicitly configure the PKCS#12 encryption/KDF profile. Independently
  inspect actual generated container parameters before export. Profile: JDK 21, AES-256/PBKDF2-HMAC-SHA256 for key and certificate
  encryption, HmacPBESHA256 integrity, 600000 iterations for all three paths.
  Never assume JDK defaults meet the requirement.
- Artifact allowlist: encrypted PKCS#12, its Base64 representation, and a public
  manifest. Base64 is encoding, NOT encryption. Never upload a work directory.
- Public repository artifacts can be downloaded by signed-in readers. This is
  deliberate ciphertext exposure and requires explicit informed authorization.
  Retention must be disclosed before initialization. No active deletion of runs
  or artifacts without the applicable authorization. Expiration is not a backup.
- Transfer to the approved mailbox only after exact run/attempt/source/digest and
  artifact allowlist validation. The mailbox address is not stored in public code.
- Secret storage in GitHub is operational state, not the sole recovery backup.
  Independent encrypted email copy plus separately retained passphrase must work.

## Browser setup (owner-operated secret entry)

1. Repository Settings -> Environments -> New environment -> `android-signing`.
   Select deployment branches explicitly (reviewed bootstrap and signing branches,
   not arbitrary branches or PR refs). Do not weaken existing protections.
2. Environment secrets -> Add secret -> `ANDROID_KEYSTORE_PASSWORD`. Enter the
   separately retained randomly generated passphrase directly in GitHub's UI.
   Never send it to an assistant, put it in email, or use workflow inputs.
3. After the approved initialization and backup transfer, add
   `ANDROID_KEYSTORE_BASE64` in the SAME environment. Its value must be Base64 of
   the encrypted PKCS#12, not a raw private key. Pin the public certificate SHA256
   in reviewed source/ledger and verify it on every subsequent use.
4. Reconstruct in a fresh runner and verify a private-key operation, public
   fingerprint, and later actual APK signatures. Email delivery and recovery
   verification are separate checkpoints. Do not claim either from mocks.

These are browser setup sessions, not a guarantee of exactly two clicks. Required
reviewers add an approval to each protected job; do not enable self-review blocking
on a single-owner account without a viable second reviewer. Environment selection
restricts access but does not make malicious same-repository workflows safe.

## Fixed identity recovery (no key generation)

The one initialization completed in run `40648258404`. The immutable reviewed
initialization source is `e55c21f8035ddc982dde4059221ba4d5290db21e`.
Its permanent READY state commit is
`6ece97202423fd9d851180049657f889411b2aa8` and encrypted artifact ID is
`12798229258`. Subsequent commits explicitly skip the bootstrap generation job.

Recovery is staged and tested on the validation branch first. Only after the
owner confirms importing the encrypted backup into `ANDROID_KEYSTORE_BASE64`
in the existing environment may the reviewed commit fast-forward the allowed
bootstrap branch. This launches a fresh runner, checks the exact READY record,
decodes the existing ciphertext, matches its fixed digest and certificate,
checks the actual PKCS12 encryption profile, and performs a private-key CSR
operation. It never generates or replaces a key. Only a public recovery report
is uploaded; no private key, encrypted container, CSR, password, or environment
dump is included. Failure preserves the permanent identity and is not permission
to initialize another identity.

Owner-imported email backup is the asserted source of the Secret; the runner
itself does not access a mailbox. Recovery evidence must not claim independent
mailbox download verification. This recovery also does not verify an APK
signature or authorize publication; those release gates remain separate.

## Reviewed Android publication

`android-sign-reviewed.yml` accepts no free-form dispatch input. Its committed
input starts disabled. The reviewer fills exact candidate source, successful CI
run/attempt and immutable artifact ID/ZIP digest only after inspecting all 15
gates. It runs only on the existing allowed signing branch. The candidate source
is never executed in the signing runner. Artifact download, full ZIP integrity,
package/version/architecture, unsigned status and fixed recovery evidence are
checked before signing Secrets enter the single signing step. The encrypted
container digest and signed APK certificate are fixed, and temporary key copies
are removed without changing the permanent identity or its backup.

A separate publication job receives no signing Secrets. It rechecks signed
artifact ownership, source/run/attempt, all 15 gate names and conclusions,
provenance and hashes. It atomically creates a new Android-only tag, uploads into
a draft, verifies asset hashes, then publishes with `make_latest: false`.
Existing tags/releases/drafts are never replaced or deleted. A failed partial
publication is inspected before any retry. Existing desktop assets remain intact.
