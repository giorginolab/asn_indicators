# asn_mediane
Altra burocrazia

## `scripts/asn_indicators.py`

Computes ASN-style bibliometric indicators from a Scopus CSV export.

To use it, first download the publication list from Scopus using **Export CSV**
and save the file as `scopus.csv` in the project root. The script reads that
file by default and writes a detailed report to `asn_indicators_report.txt`.

Run:

```bash
uv run python scripts/asn_indicators.py
```

Useful options:

```bash
uv run python scripts/asn_indicators.py path/to/scopus.csv -o report.txt
uv run python scripts/asn_indicators.py --current-year 2026
uv run python scripts/asn_indicators.py --include-errata
uv run python scripts/asn_indicators.py --no-deduplicate
```

By default, duplicate records are removed using Scopus `EID` or `DOI`, and
records with Scopus document type `Erratum` are excluded.
