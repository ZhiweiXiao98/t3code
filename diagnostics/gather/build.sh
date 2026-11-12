#!/bin/sh
set -eu
cd "$(dirname "$0")"
# C auto-vectorization is disabled; probe AVX2 operations are explicit assembly.
# Static glibc may contain/dispatch to other vector routines.
# Static binary allows byte-identical native and Debian guest comparator.
gcc -std=c11 -O2 -Wall -Wextra -Werror -fno-tree-vectorize -fno-tree-slp-vectorize \
    -static -pthread -Wl,--build-id=sha1 probe.c probe.S -o probe
objdump -d --disassemble=gather_exact probe > gather-disassembly.txt
objdump -d --disassemble=gather_all_exact probe > gather-all-disassembly.txt
objdump -d --disassemble=clamp_indices probe > clamp-disassembly.txt
python3 - <<'PY'
import pathlib, re
p=pathlib.Path('gather-disassembly.txt').read_text()
assert re.search(r'c4 62 45 90 04 a1\s+vpgatherdd\s+%ymm7,\(%rcx,%ymm4,4\),%ymm8',p),p
assert pathlib.Path('probe').read_bytes().count(bytes.fromhex('c5c576ffc4413857c0c462459004a1'))==1
print('Exact fault-opcode bytes/operands and original 15-byte all-active sequence verified')
PY
sha256sum probe.c probe.S build.sh probe
