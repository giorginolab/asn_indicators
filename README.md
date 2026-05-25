# asn_mediane
Altra burocrazia

## Web app

This repository includes a static JavaScript app that can be served directly
from GitHub Pages. Open `web/index.html`, upload a Scopus CSV export, and the app
will show the ASN summary report plus the detailed tables.

To prepare the input file, open the publication list in Scopus, use
**Export CSV**, and upload the resulting CSV file in the browser. The file is
processed locally by JavaScript; it is not sent to a server.

For GitHub Pages, this repository includes a workflow at
`.github/workflows/pages.yml` that publishes the `web/` directory. In the
repository settings, set Pages to use **GitHub Actions** as the source.

The web app files are:

- `web/index.html`
- `web/styles.css`
- `web/app.js`

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
