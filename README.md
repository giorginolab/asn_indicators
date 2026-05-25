# Calcolo indicatori ASN


This **unofficial** and **untested** and **unguaranteed** app 
computes bibliometric values for Italian ASN-like machinery on the basis of 
a SCOPUS-exported file. 

Available online at https://giorginolab.github.io/asn_indicators/

All counts are done in-browser. By default, duplicate records are removed using Scopus `EID` or `DOI`, and
records with Scopus document type `Erratum` are excluded.

Given the opaque nature of bibliometric databases and exercises, there is no 
way to guarantee that the results obtained respect all the official quirks.
But, at least, you will get hand-checkable summary tables. Which is ironic, 
given that this app was AI-coded.


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

