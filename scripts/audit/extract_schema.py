#!/usr/bin/env python3
"""
Extract every Drizzle table from shared/schema.ts into a CSV.

Output columns:
  table_export_name, table_db_name, line_start, column_count, has_relations

Run from the repo root:
    python3 scripts/audit/extract_schema.py > docs/audit/schema_inventory.csv
"""
import csv
import os
import re
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCHEMA_FILE = os.path.join(REPO_ROOT, "shared/schema.ts")

# export const NAME = pgTable("db_name", { ... });
TABLE_HEADER_RE = re.compile(
    r'^export\s+const\s+(?P<name>\w+)\s*=\s*pgTable\(\s*"(?P<db>[^"]+)"',
)
# export const NAME_Relations = relations(NAME, ...
RELATIONS_RE = re.compile(
    r'^export\s+const\s+(?P<name>\w+)Relations\s*=\s*relations\(',
)


def main():
    with open(SCHEMA_FILE, "r", encoding="utf-8") as f:
        lines = f.readlines()

    # Pass 1: find all relation declarations
    relations_for = set()
    for line in lines:
        m = RELATIONS_RE.match(line)
        if m:
            relations_for.add(m.group("name"))

    # Pass 2: walk each pgTable block, count columns up to closing `})`
    rows = []
    i = 0
    while i < len(lines):
        m = TABLE_HEADER_RE.match(lines[i])
        if not m:
            i += 1
            continue

        export_name = m.group("name")
        db_name = m.group("db")
        line_start = i + 1

        # Count "column-like" lines until we see the closing `})`
        # A column line has the shape: <ident>: <type>(...)
        col_re = re.compile(r"^\s+\w+:\s*\w+\(")
        col_count = 0
        j = i + 1
        depth = 1  # we just consumed the opening `({`
        while j < len(lines):
            line = lines[j]
            depth += line.count("{") - line.count("}")
            if col_re.match(line):
                col_count += 1
            if depth <= 0:
                break
            j += 1

        rows.append({
            "table_export_name": export_name,
            "table_db_name": db_name,
            "line_start": line_start,
            "column_count": col_count,
            "has_relations": "yes" if export_name in relations_for else "no",
        })
        i = j + 1

    writer = csv.DictWriter(
        sys.stdout,
        fieldnames=["table_export_name", "table_db_name", "line_start",
                    "column_count", "has_relations"],
    )
    writer.writeheader()
    for r in rows:
        writer.writerow(r)
    print(f"# total: {len(rows)} tables", file=sys.stderr)


if __name__ == "__main__":
    main()
