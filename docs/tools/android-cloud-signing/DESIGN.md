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
