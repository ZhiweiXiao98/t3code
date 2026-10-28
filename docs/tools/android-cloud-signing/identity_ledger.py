"""Fail-closed, public-only identity reservation ledger. Never handles keys."""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import os
import re
import urllib.error
import urllib.request

REF = "refs/heads/signing/android-identity-state"
STATE_PATH = "identity-state.json"


class LedgerError(RuntimeError):
    pass


class ApiError(LedgerError):
    def __init__(self, status: int):
        self.status = status
        super().__init__(f"GitHub API failed with HTTP {status}; preserve existing claim.")


class GitHubApi:
    def __init__(self, token: str):
        self.token = token

    def request(self, method, path, payload=None):
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            "https://api.github.com" + path, data=data, method=method,
            headers={"Authorization": "Bearer " + self.token,
                     "Accept": "application/vnd.github+json",
                     "Content-Type": "application/json",
                     "X-GitHub-Api-Version": "2022-11-28"},
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            # Do not expose response bodies, URLs, headers, or credentials.
            raise ApiError(error.code) from None
        except (OSError, ValueError):
            raise LedgerError("GitHub API outcome uncertain; inspect claim before any retry.") from None


def _sha(value, length=40):
    if not re.fullmatch(r"[0-9a-fA-F]{" + str(length) + r"}", value):
        raise LedgerError("Invalid public digest.")
    return value.lower()


def _positive_id(value):
    value = str(value)
    if not re.fullmatch(r"[1-9][0-9]*", value):
        raise LedgerError("Invalid public numeric identifier.")
    return value


def _timestamp(value):
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        raise LedgerError("Invalid timestamp.") from None
    if parsed.tzinfo is None or parsed.utcoffset() != dt.timedelta(0):
        raise LedgerError("Timestamp must use UTC.")
    return parsed.isoformat().replace("+00:00", "Z")


class IdentityLedger:
    def __init__(self, api, repository):
        if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
            raise LedgerError("Invalid repository.")
        self.api = api
        self.root = "/repos/" + repository + "/git"
        self.repository = repository

    def _request(self, method, suffix, payload=None):
        return self.api.request(method, self.root + suffix, payload)

    def _ref_sha(self):
        result = self._request("GET", "/ref/heads/signing/android-identity-state")
        if result.get("ref") != REF or result.get("object", {}).get("type") != "commit":
            raise LedgerError("Unexpected identity ref; preserve it.")
        return _sha(result["object"]["sha"])

    def _make_commit(self, state, parent=None, base_tree=None):
        tree_request = {"tree": [{"path": STATE_PATH, "mode": "100644", "type": "blob",
                                  "content": json.dumps(state, sort_keys=True, indent=2) + "\n"}]}
        if base_tree is not None:
            tree_request["base_tree"] = base_tree
        tree = self._request("POST", "/trees", tree_request)
        # Reservation uses NO base tree and NO parent: no repository workflows
        # or credentials are copied onto the dedicated ledger branch.
        commit = self._request("POST", "/commits", {
            "message": "Record public Android identity " + state["status"],
            "tree": _sha(tree["sha"]), "parents": [] if parent is None else [parent],
        })
        return _sha(commit["sha"])

    def reserve(self, *, run_id, source_sha, timestamp):
        state = {"schema": 1, "status": "RESERVED", "repository": self.repository,
                 "run_id": _positive_id(run_id), "source_sha": _sha(source_sha),
                 "reserved_at": _timestamp(timestamp)}
        try:
            self._ref_sha()
        except ApiError as error:
            if error.status != 404:
                raise
        else:
            raise LedgerError("Identity ledger already exists; do not generate another key.")
        commit = self._make_commit(state)
        # Atomic claim: concurrent creators race ONLY at create-ref. A 422 or
        # uncertain response is a stop, never an update/reset/delete fallback.
        self._request("POST", "/refs", {"ref": REF, "sha": commit})
        if self._ref_sha() != commit:
            raise LedgerError("Reservation readback mismatch; preserve all existing state.")
        return commit

    def _read_state(self, commit_sha):
        commit = self._request("GET", "/commits/" + commit_sha)
        tree_sha = _sha(commit["tree"]["sha"])
        tree = self._request("GET", "/trees/" + tree_sha)
        entries = tree.get("tree", [])
        if tree.get("truncated") or len(entries) != 1:
            raise LedgerError("Unexpected ledger tree; no update allowed.")
        entry = entries[0]
        if entry.get("path") != STATE_PATH or entry.get("type") != "blob" or entry.get("mode") != "100644":
            raise LedgerError("Unexpected ledger entry; no update allowed.")
        blob = self._request("GET", "/blobs/" + _sha(entry["sha"]))
        if blob.get("encoding") != "base64":
            raise LedgerError("Unexpected ledger encoding.")
        try:
            state = json.loads(base64.b64decode(blob["content"]).decode("utf-8"))
        except (ValueError, UnicodeError, KeyError):
            raise LedgerError("Unreadable public ledger; no update allowed.") from None
        return state, tree_sha

    def complete(self, *, reservation_sha, run_id, source_sha, timestamp,
                 certificate_sha256, artifact_sha256, artifact_id):
        expected = _sha(reservation_sha)
        run_id, source_sha = _positive_id(run_id), _sha(source_sha)
        ready_fields = {"completed_at": _timestamp(timestamp),
                        "certificate_sha256": _sha(certificate_sha256, 64),
                        "artifact_sha256": _sha(artifact_sha256, 64),
                        "artifact_id": _positive_id(artifact_id)}
        if self._ref_sha() != expected:
            raise LedgerError("Reservation ref no longer matches; do not update.")
        state, tree_sha = self._read_state(expected)
        expected_fields = {"schema", "status", "repository", "run_id", "source_sha", "reserved_at"}
        if (not isinstance(state, dict) or set(state) != expected_fields
                or state.get("schema") != 1 or state.get("status") != "RESERVED"
                or state.get("run_id") != run_id or state.get("source_sha") != source_sha
                or state.get("repository") != self.repository):
            raise LedgerError("Reservation identity mismatch; do not update.")
        # Caller invokes this only AFTER artifact service acknowledges storage.
        # Metadata attests acknowledgment, not user receipt/recovery validation.
        ready = {**state, **ready_fields, "status": "READY", "reservation_sha": expected,
                 "backup_recovery_verified": False}
        commit = self._make_commit(ready, parent=expected, base_tree=tree_sha)
        if self._ref_sha() != expected:
            raise LedgerError("Reservation changed during completion; preserve claim.")
        # Non-force update: concurrent divergent completion cannot overwrite.
        self._request("PATCH", "/refs/heads/signing/android-identity-state",
                      {"sha": commit, "force": False})
        if self._ref_sha() != commit:
            raise LedgerError("Completion outcome uncertain; inspect ledger, never regenerate.")
        return commit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["reserve", "complete"])
    for name in ("repository", "run-id", "source-sha", "timestamp"):
        parser.add_argument("--" + name, required=True)
    for name in ("reservation-sha", "certificate-sha256", "artifact-sha256", "artifact-id"):
        parser.add_argument("--" + name)
    args = vars(parser.parse_args())
    operation = args.pop("operation")
    repository = args.pop("repository")
    if operation == "reserve":
        if any(args[name] is not None for name in ("reservation_sha", "certificate_sha256", "artifact_sha256", "artifact_id")):
            parser.error("Completion fields are not allowed for reserve.")
        args = {name: value for name, value in args.items() if value is not None}
    elif any(value is None for value in args.values()):
        parser.error("Complete requires all public artifact metadata fields.")
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        parser.error("GITHUB_TOKEN is required; do not place it on command line.")
    ledger = IdentityLedger(GitHubApi(token), repository)
    try:
        commit = getattr(ledger, operation)(**args)
    except LedgerError as error:
        parser.exit(1, str(error) + "\n")
    print(json.dumps({"operation": operation, "commit_sha": commit, "ref": REF}))


if __name__ == "__main__":
    main()
