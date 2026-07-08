# Sales Report CLI

A single-file, command-line Python script that cleans a messy monthly sales
CSV export and generates a summary report. Uses **only the Python standard
library** — nothing to `pip install`.

## Requirements

- Python 3.9 or newer (no third-party packages).

## Setup

No setup required beyond having Python installed. Just download
`sales_report.py` and run it.

## Usage

```
python sales_report.py <input_csv> [output_folder] [--top N]
```

- `input_csv` (required) — path to the raw CSV export.
- `output_folder` (optional) — where to write the outputs. Defaults to the
  current directory.
- `--top N` (optional) — how many top customers to list in the report.
  Defaults to 5.

### Try it on the included sample

```
python sales_report.py sample_input.csv example_output
```

This reads `sample_input.csv` (included in this folder) and writes
`cleaned_sales.csv`, `report.txt`, and `summary.json` into
`example_output/` — those files are already checked in so you can see
exactly what to expect before running it on your real data.

## Input format

Each row is one sale, with these columns (header names are matched
case-insensitively and tolerant of extra spaces, e.g. `Order ID` or
`unit price` both work):

```
order_id, date, customer, product, quantity, unit_price
```

## What gets cleaned

- **Dates** — accepts `2026-01-05`, `01/05/2026`, and `Jan 5, 2026` /
  `January 5, 2026`, and normalizes all of them to ISO `YYYY-MM-DD`.
- **unit_price** — strips `$`, commas, and stray whitespace (`$1,299.00`,
  `1299`, `  19.99 ` all become a plain number like `19.99`).
- **quantity** — strips stray whitespace and blanks.
- **Text fields** — leading/trailing whitespace trimmed; product and
  customer names are title-cased (e.g. `wireless mouse` → `Wireless
  Mouse`). Note: simple title-casing also affects acronyms, so
  `USB-C Cable` becomes `Usb-C Cable`.
- **Duplicates** — fully duplicated rows (identical on every field after
  cleaning) are removed, keeping the first occurrence.
- **Invalid rows** — a row is skipped (and counted, with a reason) if it's
  missing an `order_id` or `product`, has a non-numeric/zero/negative
  `quantity`, has a non-numeric/zero/negative `unit_price`, or has a date
  that can't be parsed in any of the supported formats. A missing
  `customer` is *not* treated as invalid — it's kept and labeled
  `(Unknown)` so you can still see the sale.

## Outputs

All three files are written to the output folder:

1. **`cleaned_sales.csv`** — tidy data with columns `order_id, date,
   customer, product, quantity, unit_price, line_total` (`line_total` =
   `quantity × unit_price`).
2. **`report.txt`** — human-readable Markdown summary: total revenue,
   valid orders, units sold, average order value; revenue and units by
   product (high to low); revenue by month; top N customers by revenue;
   and a data-quality section (rows read, duplicates removed, rows
   skipped and why).
3. **`summary.json`** — the same numbers as `report.txt`, structured for
   scripts/dashboards to consume.

## Error handling

- If the input file doesn't exist, you'll get a plain error message (no
  stack trace) and the script exits with a non-zero status.
- If the required columns aren't found in the header row, you'll get a
  message listing exactly which columns are missing and which columns
  were actually found in the file.

## Files in this folder

- `sales_report.py` — the script.
- `sample_input.csv` — a small sample CSV with the kinds of messiness
  described above (mixed date formats, currency symbols, stray
  whitespace, a duplicate row, and a few invalid rows).
- `example_output/` — the exact `cleaned_sales.csv`, `report.txt`, and
  `summary.json` produced by running the script against
  `sample_input.csv`, so you can confirm the script works before pointing
  it at your real data.
