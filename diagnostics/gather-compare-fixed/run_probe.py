#!/usr/bin/env python3
"""Bounded synthetic checks only. No downloads, VM startup or network actions."""
import argparse, hashlib, json, pathlib, subprocess, time
CASES=("negative-scalar","negative-gather","mismatch-fixture","single","parallel")
EXPECTED_CHECKS=32+4096*24

def uint32(value):
    return type(value) is int and 0 <= value <= 0xffffffff

def exact_int(value, expected):
    return type(value) is int and value == expected

def validate(case, rc, data):
    if type(case) is not str or case not in CASES or type(rc) is not int or type(data) is not dict:
        return False
    if case in ("negative-scalar", "negative-gather"):
        site = "other" if case == "negative-scalar" else "all_active"
        return (rc == 139 and set(data) == {"signal", "gatherSite"}
                and type(data["signal"]) is str and data["signal"] == "SIGSEGV"
                and type(data["gatherSite"]) is str and data["gatherSite"] == site)
    if case in ("single", "mismatch-fixture"):
        if set(data) != {"mode", "stage", "checks", "checksum", "rounds"}:
            return False
        stage = "complete" if case == "single" else "gather_all_active_value"
        return (rc == (0 if case == "single" else 1)
                and type(data["mode"]) is str and data["mode"] == case
                and type(data["stage"]) is str and data["stage"] == stage
                and exact_int(data["checks"], EXPECTED_CHECKS if case == "single" else 0)
                and uint32(data["checksum"])
                and (case == "single" or data["checksum"] == 0)
                and exact_int(data["rounds"], 4096))
    if set(data) != {"mode", "threads", "distinctCpuAffinity", "stage", "checks", "checksum", "rounds"}:
        return False
    return (rc == 0 and type(data["mode"]) is str and data["mode"] == "parallel"
            and exact_int(data["threads"], 2) and data["distinctCpuAffinity"] is True
            and type(data["stage"]) is list and len(data["stage"]) == 2
            and all(type(v) is str and v == "complete" for v in data["stage"])
            and type(data["checks"]) is list and len(data["checks"]) == 2
            and all(exact_int(v, EXPECTED_CHECKS) for v in data["checks"])
            and type(data["checksum"]) is list and len(data["checksum"]) == 2
            and all(uint32(v) for v in data["checksum"])
            and exact_int(data["rounds"], 4096))

def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate_key")
        result[key] = value
    return result

def invalid_constant(value):
    raise ValueError("nonfinite_json")


def main():
    p=argparse.ArgumentParser();p.add_argument("--binary",type=pathlib.Path,required=True);p.add_argument("--label",choices=("local-native-fixture","actions-native","same-tcg-multi"),required=True);a=p.parse_args()
    binary=a.binary.resolve(); rows=[]
    for case in CASES:
        started=time.monotonic()
        try:
            r=subprocess.run([str(binary),case],capture_output=True,timeout=30,check=False)
            if len(r.stdout)>2048 or r.stderr:raise ValueError("unexpected_output")
            d=json.loads(r.stdout,object_pairs_hook=unique_object,parse_constant=invalid_constant); ok=validate(case,r.returncode,d)
            row={"case":case,"returnCode":r.returncode,"data":d,"passed":ok}
        except subprocess.TimeoutExpired:row={"case":case,"error":"timeout","passed":False}
        except (ValueError,KeyError,TypeError,OSError):row={"case":case,"error":"invalid_result","passed":False}
        row["elapsedMs"]=round((time.monotonic()-started)*1000);rows.append(row)
        # Failing control fixture invalidates later evidence. Do not continue blindly.
        if not row["passed"]:break
    complete=len(rows)==len(CASES) and all(r["passed"] for r in rows)
    if complete and rows[3]["data"]["checksum"]!=rows[4]["data"]["checksum"][0]:complete=False
    print(json.dumps({"schemaVersion":1,"label":a.label,"purpose":"synthetic ISA discriminator; never application acceptance","binarySha256":hashlib.sha256(binary.read_bytes()).hexdigest(),"complete":complete,"results":rows},indent=2))
    return 0 if complete else 1
if __name__=="__main__":raise SystemExit(main())
