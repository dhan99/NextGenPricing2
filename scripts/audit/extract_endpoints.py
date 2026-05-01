#!/usr/bin/env python3
"""
Extract every HTTP endpoint from the server/ TypeScript files into a CSV.

Output columns:
  file, line, method, path, permission, handler_summary

Run from the repo root:
    python3 scripts/audit/extract_endpoints.py > docs/audit/api_inventory.csv
"""
import csv
import os
import re
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SERVER_FILES = [
    "server/routes.ts",
    "server/intapp.ts",
    "server/dynamics.ts",
    "server/workday.ts",
    "server/conga.ts",
    "server/intake.ts",
]

# Capture: app.METHOD("/path", requirePerm("perm"), ... or requireAnyPerm("a","b"), ...
ENDPOINT_RE = re.compile(
    r"""
    \b(app|router)\.(?P<method>get|post|put|patch|delete)\s*\(
    \s*["'](?P<path>[^"']+)["']
    (?:\s*,\s*(?P<perm_call>require(?:Any)?Perm)\s*\(\s*(?P<perm_args>[^)]*)\))?
    """,
    re.VERBOSE,
)


def extract(file_path: str):
    with open(file_path, "r", encoding="utf-8") as f:
        for lineno, line in enumerate(f, start=1):
            for m in ENDPOINT_RE.finditer(line):
                perm = ""
                if m.group("perm_call"):
                    args = (m.group("perm_args") or "").strip()
                    args = re.sub(r"\s+", " ", args)
                    perm = f"{m.group('perm_call')}({args})"
                yield {
                    "file": os.path.relpath(file_path, REPO_ROOT),
                    "line": lineno,
                    "method": m.group("method").upper(),
                    "path": m.group("path"),
                    "permission": perm,
                }


def main():
    writer = csv.DictWriter(
        sys.stdout,
        fieldnames=["file", "line", "method", "path", "permission"],
    )
    writer.writeheader()

    rows = []
    for relpath in SERVER_FILES:
        full = os.path.join(REPO_ROOT, relpath)
        if not os.path.exists(full):
            print(f"# missing: {relpath}", file=sys.stderr)
            continue
        rows.extend(extract(full))

    rows.sort(key=lambda r: (r["file"], r["line"]))
    for r in rows:
        writer.writerow(r)
    print(f"# total: {len(rows)} endpoints", file=sys.stderr)


if __name__ == "__main__":
    main()
