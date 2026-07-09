#!/usr/bin/env python3
"""
Differential-testing oracle adapter: parses one HL7 v2 message file with
`python-hl7` (PyPI distribution name `hl7`, BSD license,
https://github.com/johnpaulett/python-hl7) and prints a JSON summary of
segment names, per-segment field counts, and per-field wire text — the same
shape `test/differential/differential.test.ts` extracts from `@cosyte/hl7`.

Usage: python3 oracle_python_hl7.py <path-to-.hl7-file>

Reads the file with `newline=""` (universal-newline translation OFF) so a
`\\r`-terminated HL7 message is not silently rewritten to `\\n` by Python's
text-mode line-ending normalization before `hl7.parse()` ever sees it — that
translation would otherwise collapse every segment into one, which is a
Python file-I/O footgun, not a real HL7 divergence.

Field indexing matches `@cosyte/hl7`'s convention exactly: `seg[0]` is the
segment name (or, for MSH, the field separator itself — MSH-1); `seg[N]` for
N >= 1 is the HL7 N-th field. `str(field)` reconstructs the field's original
delimiter-joined wire text, the same role `Field.text` plays on the
`@cosyte/hl7` side.
"""

import json
import sys


def main() -> int:
    if len(sys.argv) != 2:
        print(json.dumps({"error": "usage: oracle_python_hl7.py <path>"}))
        return 2

    path = sys.argv[1]
    try:
        import hl7  # type: ignore[import-not-found]
    except ImportError:
        print(json.dumps({"error": "python-hl7 (import hl7) is not installed"}))
        return 3

    try:
        with open(path, "r", newline="") as fh:
            raw = fh.read()
    except OSError as exc:
        print(json.dumps({"error": f"could not read {path}: {exc}"}))
        return 4

    try:
        msg = hl7.parse(raw)
    except Exception as exc:  # noqa: BLE001 - report any oracle parse failure as data
        print(json.dumps({"error": f"{type(exc).__name__}: {exc}"}))
        return 0

    segments = []
    for seg in msg:
        name = str(seg[0])
        fields = [str(seg[i]) for i in range(1, len(seg))]
        segments.append({"name": name, "fields": fields})

    print(json.dumps({"segments": segments}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
