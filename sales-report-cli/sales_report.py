#!/usr/bin/env python3
"""
sales_report.py - Clean a messy monthly sales CSV export and generate a
summary report.

Usage:
    python sales_report.py <input_csv> [output_folder] [--top N]

Example:
    python sales_report.py raw_sales.csv ./out --top 10

Outputs (written to the output folder, default: current directory):
    cleaned_sales.csv  - tidy, de-duplicated, validated data
    report.txt         - human-readable summary (Markdown-formatted)
    summary.json        - the same summary, machine-readable

Requires only the Python standard library - no installation needed.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

# Canonical columns we need, and the header spellings we'll tolerantly
# accept for each (already lower-cased/underscored before comparison).
REQUIRED_COLUMNS = ("order_id", "date", "customer", "product", "quantity", "unit_price")
HEADER_ALIASES = {
    "order_id": {"order_id", "orderid", "order_number", "order_no"},
    "date": {"date", "order_date", "sale_date"},
    "customer": {"customer", "customer_name", "client"},
    "product": {"product", "product_name", "item"},
    "quantity": {"quantity", "qty"},
    "unit_price": {"unit_price", "unitprice", "price"},
}

DATE_FORMATS = ("%Y-%m-%d", "%m/%d/%Y", "%b %d, %Y", "%B %d, %Y")

PRICE_JUNK_RE = re.compile(r"[^\d.\-]")


def normalize_header(raw_header: str) -> str:
    """Lowercase, strip, and collapse a raw CSV header into a comparable slug."""
    return re.sub(r"\s+", "_", raw_header.strip().lower())


def map_columns(fieldnames: list[str]) -> dict[str, str]:
    """Map each canonical column name to the actual header found in the file.

    Raises ValueError listing anything that couldn't be matched.
    """
    normalized_to_raw = {normalize_header(h): h for h in fieldnames}
    column_map: dict[str, str] = {}
    missing: list[str] = []

    for canonical in REQUIRED_COLUMNS:
        found_raw = None
        for alias in HEADER_ALIASES[canonical]:
            if alias in normalized_to_raw:
                found_raw = normalized_to_raw[alias]
                break
        if found_raw is None:
            missing.append(canonical)
        else:
            column_map[canonical] = found_raw

    if missing:
        raise ValueError(
            "Missing required column(s): "
            + ", ".join(missing)
            + f".\nColumns found in file: {', '.join(fieldnames)}"
        )
    return column_map


def parse_date(raw: str) -> str | None:
    """Normalize a date string to ISO 'YYYY-MM-DD'. Returns None if unparseable."""
    text = raw.strip()
    if not text:
        return None
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def parse_price(raw: str) -> float | None:
    """Normalize a price string like '$1,299.00' or '  19.99 ' to a float.

    Returns None if it isn't a valid, positive number.
    """
    text = raw.strip()
    if not text:
        return None
    cleaned = PRICE_JUNK_RE.sub("", text)
    try:
        value = float(cleaned)
    except ValueError:
        return None
    if value <= 0:
        return None
    return round(value, 2)


def parse_quantity(raw: str) -> int | None:
    """Normalize a quantity string, stripping stray whitespace.

    Returns None if it isn't a valid, positive whole number.
    """
    text = re.sub(r"\s+", "", raw)
    if not text:
        return None
    try:
        value = float(text)
    except ValueError:
        return None
    if value <= 0 or not value.is_integer():
        return None
    return int(value)


def clean_rows(reader: csv.DictReader, column_map: dict[str, str]) -> tuple[list[dict], dict]:
    """Clean, validate, and de-duplicate rows.

    Returns (cleaned_rows, stats) where stats tracks how many rows were
    read, skipped (with reasons), and de-duplicated.
    """
    cleaned_rows: list[dict] = []
    seen_keys: set[tuple] = set()
    stats = {
        "rows_read": 0,
        "duplicates_removed": 0,
        "skipped": defaultdict(int),
    }

    for raw_row in reader:
        stats["rows_read"] += 1

        order_id = (raw_row.get(column_map["order_id"]) or "").strip()
        product = (raw_row.get(column_map["product"]) or "").strip()
        customer = (raw_row.get(column_map["customer"]) or "").strip()
        date_raw = raw_row.get(column_map["date"]) or ""
        price_raw = raw_row.get(column_map["unit_price"]) or ""
        qty_raw = raw_row.get(column_map["quantity"]) or ""

        if not order_id:
            stats["skipped"]["missing_order_id"] += 1
            continue
        if not product:
            stats["skipped"]["missing_product"] += 1
            continue

        date = parse_date(date_raw)
        if date is None:
            stats["skipped"]["invalid_or_missing_date"] += 1
            continue

        unit_price = parse_price(price_raw)
        if unit_price is None:
            stats["skipped"]["invalid_price"] += 1
            continue

        quantity = parse_quantity(qty_raw)
        if quantity is None:
            stats["skipped"]["invalid_quantity"] += 1
            continue

        product = product.title()
        customer = customer.title() if customer else "(Unknown)"

        dedupe_key = (order_id, date, customer, product, quantity, unit_price)
        if dedupe_key in seen_keys:
            stats["duplicates_removed"] += 1
            continue
        seen_keys.add(dedupe_key)

        cleaned_rows.append(
            {
                "order_id": order_id,
                "date": date,
                "customer": customer,
                "product": product,
                "quantity": quantity,
                "unit_price": unit_price,
                "line_total": round(quantity * unit_price, 2),
            }
        )

    return cleaned_rows, stats


def build_summary(cleaned_rows: list[dict], stats: dict, top_n: int) -> dict:
    """Compute the aggregate figures that go into report.txt / summary.json."""
    total_revenue = round(sum(r["line_total"] for r in cleaned_rows), 2)
    total_orders = len(cleaned_rows)
    total_units = sum(r["quantity"] for r in cleaned_rows)
    avg_order_value = round(total_revenue / total_orders, 2) if total_orders else 0.0

    by_product: dict[str, dict] = defaultdict(lambda: {"revenue": 0.0, "units": 0})
    by_month: dict[str, float] = defaultdict(float)
    by_customer: dict[str, float] = defaultdict(float)

    for row in cleaned_rows:
        by_product[row["product"]]["revenue"] += row["line_total"]
        by_product[row["product"]]["units"] += row["quantity"]
        month = row["date"][:7]  # YYYY-MM
        by_month[month] += row["line_total"]
        by_customer[row["customer"]] += row["line_total"]

    product_summary = [
        {"product": name, "revenue": round(vals["revenue"], 2), "units": vals["units"]}
        for name, vals in sorted(by_product.items(), key=lambda kv: kv[1]["revenue"], reverse=True)
    ]
    month_summary = [
        {"month": month, "revenue": round(revenue, 2)}
        for month, revenue in sorted(by_month.items())
    ]
    top_customers = [
        {"customer": name, "revenue": round(revenue, 2)}
        for name, revenue in sorted(by_customer.items(), key=lambda kv: kv[1], reverse=True)[:top_n]
    ]

    return {
        "totals": {
            "total_revenue": total_revenue,
            "total_valid_orders": total_orders,
            "total_units_sold": total_units,
            "average_order_value": avg_order_value,
        },
        "revenue_by_product": product_summary,
        "revenue_by_month": month_summary,
        "top_customers": top_customers,
        "data_quality": {
            "rows_read": stats["rows_read"],
            "duplicates_removed": stats["duplicates_removed"],
            "rows_skipped_total": sum(stats["skipped"].values()),
            "skipped_reasons": dict(stats["skipped"]),
            "valid_rows_written": len(cleaned_rows),
        },
    }


def write_cleaned_csv(path: Path, cleaned_rows: list[dict]) -> None:
    fieldnames = ["order_id", "date", "customer", "product", "quantity", "unit_price", "line_total"]
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(cleaned_rows)


def write_json_summary(path: Path, summary: dict) -> None:
    with path.open("w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)


def write_text_report(path: Path, summary: dict, top_n: int) -> None:
    totals = summary["totals"]
    quality = summary["data_quality"]
    lines: list[str] = []

    lines.append("# Sales Summary Report")
    lines.append("")
    lines.append("## Totals")
    lines.append(f"- Total revenue: ${totals['total_revenue']:,.2f}")
    lines.append(f"- Total valid orders: {totals['total_valid_orders']:,}")
    lines.append(f"- Total units sold: {totals['total_units_sold']:,}")
    lines.append(f"- Average order value: ${totals['average_order_value']:,.2f}")
    lines.append("")

    lines.append("## Revenue & Units by Product (high to low)")
    if summary["revenue_by_product"]:
        for item in summary["revenue_by_product"]:
            lines.append(f"- {item['product']}: ${item['revenue']:,.2f} revenue, {item['units']:,} units")
    else:
        lines.append("- (no valid rows)")
    lines.append("")

    lines.append("## Revenue by Month")
    if summary["revenue_by_month"]:
        for item in summary["revenue_by_month"]:
            lines.append(f"- {item['month']}: ${item['revenue']:,.2f}")
    else:
        lines.append("- (no valid rows)")
    lines.append("")

    lines.append(f"## Top {top_n} Customers by Revenue")
    if summary["top_customers"]:
        for i, item in enumerate(summary["top_customers"], start=1):
            lines.append(f"{i}. {item['customer']}: ${item['revenue']:,.2f}")
    else:
        lines.append("- (no valid rows)")
    lines.append("")

    lines.append("## Data Quality")
    lines.append(f"- Rows read from input: {quality['rows_read']:,}")
    lines.append(f"- Duplicate rows removed: {quality['duplicates_removed']:,}")
    lines.append(f"- Invalid rows skipped: {quality['rows_skipped_total']:,}")
    if quality["skipped_reasons"]:
        for reason, count in quality["skipped_reasons"].items():
            lines.append(f"  - {reason.replace('_', ' ')}: {count:,}")
    lines.append(f"- Valid rows written to cleaned_sales.csv: {quality['valid_rows_written']:,}")
    lines.append("")

    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Clean a messy sales CSV and generate a summary report."
    )
    parser.add_argument("input_csv", help="Path to the raw input CSV file")
    parser.add_argument(
        "output_folder",
        nargs="?",
        default=".",
        help="Folder to write outputs to (default: current directory)",
    )
    parser.add_argument(
        "--top",
        type=int,
        default=5,
        help="How many top customers to show in the report (default: 5)",
    )
    args = parser.parse_args()

    input_path = Path(args.input_csv)
    output_dir = Path(args.output_folder)

    if not input_path.exists():
        print(f"Error: input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    try:
        output_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        print(f"Error: could not create output folder '{output_dir}': {exc}", file=sys.stderr)
        sys.exit(1)

    try:
        with input_path.open(newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            if not reader.fieldnames:
                print(f"Error: '{input_path}' has no header row / is empty.", file=sys.stderr)
                sys.exit(1)
            column_map = map_columns(reader.fieldnames)
            cleaned_rows, stats = clean_rows(reader, column_map)
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
    except csv.Error as exc:
        print(f"Error: could not parse '{input_path}' as CSV: {exc}", file=sys.stderr)
        sys.exit(1)

    summary = build_summary(cleaned_rows, stats, args.top)

    write_cleaned_csv(output_dir / "cleaned_sales.csv", cleaned_rows)
    write_json_summary(output_dir / "summary.json", summary)
    write_text_report(output_dir / "report.txt", summary, args.top)

    print(f"Done. Wrote cleaned_sales.csv, report.txt, and summary.json to '{output_dir}'.")
    print(
        f"Read {stats['rows_read']} rows -> {len(cleaned_rows)} valid, "
        f"{stats['duplicates_removed']} duplicates removed, "
        f"{sum(stats['skipped'].values())} invalid rows skipped."
    )


if __name__ == "__main__":
    main()
