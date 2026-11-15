#!/usr/bin/env python3
"""Observe the unchanged Web test command; return its status without retries."""

import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import time


COMMAND = ["vp", "run", "--filter", "@t3tools/web", "test"]
DEBUG_NAMESPACES = "vitest:browser:pool,pw:browser"
STARTED = time.monotonic()
STARTED_EPOCH = time.time()
WARNINGS = set()
STOP = threading.Event()


def warn(message):
    if message not in WARNINGS:
        WARNINGS.add(message)
        print("::warning::Web diagnostics: " + message, file=sys.stderr, flush=True)


try:
    OUT = Path(os.environ["RUNNER_TEMP"]) / "web-browser-diagnostics"
    OUT.mkdir(parents=True, exist_ok=True)
except (KeyError, OSError) as error:
    OUT = None
    warn("output directory unavailable; tests will still run: " + type(error).__name__)


class BoundedOutput:
    def __init__(self, name, limit):
        self.name, self.limit, self.seen, self.written = name, limit, 0, 0
        self.stream = None
        if OUT is None:
            return
        try:
            self.stream = (OUT / name).open("wb")
        except OSError as error:
            warn(name + " unavailable: " + type(error).__name__)

    def write(self, data):
        self.seen += len(data)
        if self.stream is not None:
            try:
                part = data[:max(0, self.limit - self.written)]
                self.stream.write(part)
                self.stream.flush()
                self.written += len(part)
            except OSError as error:
                warn(self.name + " write failed: " + type(error).__name__)
                self.close()

    def close(self):
        if self.stream is not None:
            stream, self.stream = self.stream, None
            try:
                stream.close()
            except OSError as error:
                warn(self.name + " close failed: " + type(error).__name__)

    def summary(self):
        return {"seen_bytes": self.seen, "written_bytes": self.written,
                "limit_bytes": self.limit, "truncated": self.seen > self.written}


def save(name, value, limit=256 * 1024):
    if OUT is None:
        return
    output = BoundedOutput(name, limit)
    output.write((json.dumps(value, indent=2) + "\n").encode())
    output.close()
    if output.seen > output.written:
        warn(name + " is incomplete")


def read(path, limit=4096):
    try:
        with open(path) as stream:
            return stream.read(limit)
    except OSError as error:
        return {"unavailable": type(error).__name__}


def capture(argv):
    try:
        result = subprocess.run(argv, capture_output=True, text=True, errors="replace", timeout=5)
        return {"exit_code": result.returncode,
                "stdout": result.stdout[:65536], "stderr": result.stderr[:4096]}
    except (OSError, subprocess.TimeoutExpired) as error:
        return {"unavailable": type(error).__name__}


CGROUP_ROOT = Path("/sys/fs/cgroup")
CGROUPS = {CGROUP_ROOT}
cgroup_info = read("/proc/self/cgroup")
for line in cgroup_info.splitlines() if isinstance(cgroup_info, str) else []:
    if line.startswith("0::"):
        current = (CGROUP_ROOT / line[3:].lstrip("/")).resolve()
        for _ in range(8):
            if current != CGROUP_ROOT and CGROUP_ROOT not in current.parents:
                break
            CGROUPS.add(current)
            if current == CGROUP_ROOT:
                break
            current = current.parent


def snapshot():
    try:
        disks = {}
        for path in ("/tmp", os.getcwd()):
            stats = os.statvfs(path)
            disks[path] = {"available_bytes": stats.f_bavail * stats.f_frsize,
                           "free_inodes": stats.f_favail}
        groups = {str(group): {name: read(group / name) for name in (
            "memory.current", "memory.peak", "memory.max", "memory.events",
            "memory.events.local", "memory.pressure", "pids.current", "pids.max")}
            for group in sorted(CGROUPS)}
        # No command lines or process environments: only identity and resource counters.
        processes = capture(["ps", "-eo", "pid,ppid,comm,rss,vsz,stat,etime", "--sort=-rss"])
        if "stdout" in processes:
            rows = processes["stdout"].splitlines()
            processes["stdout"] = "\n".join(rows[:26])
            processes["browser_and_runner"] = "\n".join(
                row for row in rows if any(name in row.lower() for name in (
                    "chrome", "node", "vp", "python")))[:16384]
        return {"utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "elapsed_s": round(time.monotonic() - STARTED, 2),
                "meminfo": read("/proc/meminfo"), "cpu_pressure": read("/proc/pressure/cpu"),
                "disks": disks, "cgroups": groups, "processes": processes}
    except Exception as error:
        warn("resource snapshot unavailable: " + type(error).__name__)
        return {"collection_error": type(error).__name__}


samples = BoundedOutput("resources.jsonl", 8 * 1024 * 1024)


def collect():
    while True:
        row = (json.dumps(snapshot()) + "\n").encode()
        # Keep every saved JSONL record complete, even when the sample budget is full.
        if samples.written + len(row) <= samples.limit:
            samples.write(row)
        else:
            warn("resource sample budget reached; final snapshot is saved separately")
        if STOP.wait(5):
            break


observer = None
if OUT is not None:
    hashes = {}
    for name in ("pnpm-lock.yaml", "apps/web/vite.config.ts", "apps/web/test/browserSetup.ts"):
        try:
            hashes[name] = hashlib.sha256(Path(name).read_bytes()).hexdigest()
        except OSError as error:
            hashes[name] = {"unavailable": type(error).__name__}
    save("metadata.json", {"command": COMMAND, "source": capture(["git", "rev-parse", "HEAD"]),
         "cpu_count": os.cpu_count(), "hashes": hashes,
         "environment": {key: os.environ.get(key) for key in (
             "GITHUB_SHA", "GITHUB_REF", "GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT",
             "RUNNER_OS", "RUNNER_ARCH", "ImageOS", "ImageVersion", "CI")},
         "versions": {"node": capture(["node", "--version"]), "vp": capture(["vp", "--version"])},
         "debug": DEBUG_NAMESPACES, "limits": read("/proc/self/limits")})
    save("resources-before.json", snapshot())
    observer = threading.Thread(target=collect, daemon=True)
    observer.start()
environment = dict(os.environ, DEBUG=DEBUG_NAMESPACES)
# Failed-request URLs can contain credentials or query tokens.
environment.pop("VITEST_PW_DEBUG", None)
log = BoundedOutput("web-test.log", 16 * 1024 * 1024)
tail = bytearray()
try:
    process = subprocess.Popen(COMMAND, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=environment)
    while True:
        chunk = process.stdout.read1(8192)
        if not chunk:
            break
        sys.stdout.buffer.write(chunk)
        sys.stdout.buffer.flush()
        log.write(chunk)
        tail.extend(chunk)
        del tail[:-1024 * 1024]
    code = process.wait()
finally:
    STOP.set()
    if observer is not None:
        observer.join(timeout=10)
    samples.close()
    log.close()

# Collection failures cannot replace the original command's result.
try:
    if OUT is not None:
        last_log = BoundedOutput("web-test-tail.log", 1024 * 1024)
        last_log.write(tail)
        last_log.close()
        save("resources-after.json", snapshot())
        save("kernel.json", capture(["journalctl", "--no-pager", "-b", "-k", "-n", "200",
             "--since", "@" + str(int(STARTED_EPOCH)), "-o", "short-iso",
             "--grep=oom|Out of memory|Killed process|segfault|trap|general protection"]))
    outcome = {"test_exit_code": code, "elapsed_s": round(time.monotonic() - STARTED, 2),
               "log": log.summary(), "resources": samples.summary(), "warnings": sorted(WARNINGS)}
    save("outcome.json", outcome)
    print(json.dumps(outcome), flush=True)
finally:
    sys.exit(code if code >= 0 else 128 - code)
