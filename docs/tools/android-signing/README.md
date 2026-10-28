# Android signing helper — validation draft

Not yet approved for end-user execution. Tests replace keytool with a mock that
writes explicitly non-key text fixtures. No signing identity is created by CI,
no account secret is accessed, no ACL is changed, and nothing is emailed.

The proposed user workflow is local creation with a strong, separately retained
passphrase; manually emailing only the encrypted PKCS#12 and public metadata to
the user's confirmed mailbox; and locally testing a downloaded backup. The helper
never installs tools or transmits files. A surviving encrypted file without a
recoverable passphrase is not a completed backup. A mock pass is not proof of
real keytool password handling or successful Android APK signing.

Safety checks reject configured OneDrive locations, UNC/reparse paths, broad
folder ACLs, and repeated key creation. They cannot detect every third-party sync,
backup or monitoring application. Users must independently trust their existing
JDK and local terminal. ACLs are read only: unusual permissions stop the helper.
The passphrase-strength instruction is not a strength enforcement mechanism.

`-FunctionsOnly` loads definitions without running creation or verification.
`-VerifyBackup` checks a user-selected backup using public metadata and a local
CSR operation; no CSR is submitted. Email origin is user-reported, not inferred
from a matching file. Losing the original computer can be handled by selecting
metadata saved with the backup. Public JSON alone does not authorize release.

Any eventual formal generation, encrypted-key transmission, GitHub Secrets
configuration, or publication remains a separate specifically approved action.
