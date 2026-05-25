#!/usr/bin/env python3
"""Compute ASN-style bibliometric indicators from a Scopus CSV export."""

from __future__ import annotations

import argparse
import csv
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Iterable


@dataclass(frozen=True)
class Paper:
    year: int
    citations: int
    first_author: str
    doi: str
    title: str


def parse_int(value: str | None, *, field_name: str, row_number: int) -> int | None:
    if value is None or value.strip() == "":
        return None
    try:
        return int(value.strip())
    except ValueError as exc:
        raise ValueError(
            f"Row {row_number}: cannot parse {field_name!r} value {value!r} as an integer"
        ) from exc


def read_scopus_csv(
    path: Path, *, deduplicate: bool = True, exclude_errata: bool = True
) -> list[Paper]:
    papers: list[Paper] = []
    seen_ids: set[str] = set()

    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required_columns = {"Authors", "Title", "Year", "Cited by", "DOI"}
        if exclude_errata:
            required_columns.add("Document Type")
        missing_columns = required_columns - set(reader.fieldnames or [])
        if missing_columns:
            missing = ", ".join(sorted(missing_columns))
            raise ValueError(f"Missing required Scopus column(s): {missing}")

        for row_number, row in enumerate(reader, start=2):
            if exclude_errata and (row.get("Document Type") or "").strip().casefold() == "erratum":
                continue

            if deduplicate:
                record_id = (row.get("EID") or row.get("DOI") or "").strip()
                if record_id:
                    if record_id in seen_ids:
                        continue
                    seen_ids.add(record_id)

            year = parse_int(row.get("Year"), field_name="Year", row_number=row_number)
            citations = parse_int(
                row.get("Cited by"), field_name="Cited by", row_number=row_number
            )
            if year is None:
                continue
            papers.append(
                Paper(
                    year=year,
                    citations=citations or 0,
                    first_author=first_author(row.get("Authors") or ""),
                    doi=(row.get("DOI") or "").strip() or "n/a",
                    title=(row.get("Title") or "").strip(),
                )
            )

    return papers


def first_author(authors: str) -> str:
    return authors.split(";", maxsplit=1)[0].strip() or "n/a"


def from_year(as_of_year: int, window_years: int) -> int:
    return as_of_year - window_years + 1


def papers_in_window(
    papers: Iterable[Paper], *, as_of_year: int, window_years: int
) -> list[Paper]:
    first_year = from_year(as_of_year, window_years)
    selected = [paper for paper in papers if first_year <= paper.year <= as_of_year]
    return sorted(selected, key=lambda paper: (-paper.year, paper.first_author, paper.title))


def h_index(citations: Iterable[int]) -> int:
    sorted_citations = sorted(citations, reverse=True)
    h = 0
    for rank, citation_count in enumerate(sorted_citations, start=1):
        if citation_count < rank:
            break
        h = rank
    return h


def paper_line(index: int, paper: Paper) -> str:
    return (
        f"{index}. {paper.first_author} ({paper.year}); DOI: {paper.doi}; "
        f"citations: {paper.citations}"
    )


def h_index_details(papers: list[Paper]) -> tuple[int, list[str]]:
    ranked = sorted(papers, key=lambda paper: (-paper.citations, -paper.year, paper.first_author))
    h = h_index(paper.citations for paper in ranked)
    lines = []
    for rank, paper in enumerate(ranked, start=1):
        comparison = ">=" if paper.citations >= rank else "<"
        status = "counts" if paper.citations >= rank else "does not count"
        citation_label = "citation" if paper.citations == 1 else "citations"
        lines.append(
            f"{rank}. {paper.citations} {citation_label} {comparison} rank {rank}: {status}; "
            f"{paper.first_author} ({paper.year}); DOI: {paper.doi}"
        )
    return h, lines


def build_report(papers: list[Paper], *, as_of_year: int) -> str:
    lines = [
        "ASN indicators",
        f"Reference year: {as_of_year}",
        (
            "Publication windows are inclusive, e.g. 5 years means "
            f"{from_year(as_of_year, 5)}-{as_of_year}."
        ),
        "",
    ]

    for window in (5, 10):
        selected = papers_in_window(papers, as_of_year=as_of_year, window_years=window)
        summary_lines = [f"Count: {len(selected)}"]
        if window == 10:
            total_citations = sum(paper.citations for paper in selected)
            summary_lines.append(f"Total citations: {total_citations}")
        lines.extend(
            [
                f"# Papers {window} years ({from_year(as_of_year, window)}-{as_of_year})",
                *summary_lines,
            ]
        )
        lines.extend(paper_line(index, paper) for index, paper in enumerate(selected, start=1))
        lines.append("")

    for window in (10, 15):
        selected = papers_in_window(papers, as_of_year=as_of_year, window_years=window)
        total_citations = sum(paper.citations for paper in selected)
        if window == 15:
            lines.extend(
                [
                    f"# Citations {window} years ({from_year(as_of_year, window)}-{as_of_year})",
                    f"Total citations: {total_citations}",
                ]
            )
            lines.extend(paper_line(index, paper) for index, paper in enumerate(selected, start=1))
            lines.append("")

        h, details = h_index_details(selected)
        lines.extend(
            [
                f"# H index {window} years ({from_year(as_of_year, window)}-{as_of_year})",
                f"H index: {h}",
                (
                    "Calculation: papers are sorted by citation count descending; "
                    "h is the largest rank where citations >= rank."
                ),
            ]
        )
        lines.extend(details)
        lines.append("")

    return "\n".join(lines)


def build_short_summary(papers: list[Paper], *, as_of_year: int, output_path: Path) -> str:
    papers_5 = papers_in_window(papers, as_of_year=as_of_year, window_years=5)
    papers_10 = papers_in_window(papers, as_of_year=as_of_year, window_years=10)
    papers_15 = papers_in_window(papers, as_of_year=as_of_year, window_years=15)
    lines = [
        "ASN indicators summary",
        f"Reference year: {as_of_year}",
        " Prima fascia/commissari:",
        f"  Papers 10 years ({from_year(as_of_year, 10)}-{as_of_year}): {len(papers_10)}",
        f"  Citations 15 years ({from_year(as_of_year, 15)}-{as_of_year}): {sum(paper.citations for paper in papers_15)}",
        f"  H index 15 years ({from_year(as_of_year, 15)}-{as_of_year}): {h_index(paper.citations for paper in papers_15)}",
        " Seconda fascia:",
        f"  Papers 5 years ({from_year(as_of_year, 5)}-{as_of_year}): {len(papers_5)}",
        f"  Citations 10 years ({from_year(as_of_year, 10)}-{as_of_year}): {sum(paper.citations for paper in papers_10)}",
        f"  H index 10 years ({from_year(as_of_year, 10)}-{as_of_year}): {h_index(paper.citations for paper in papers_10)}",
        f"Detailed report saved to {output_path}",
    ]
    return "\n".join(lines)


def write_report(path: Path, report: str) -> None:
    path.write_text(report, encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Compute ASN-style indicators from a Scopus CSV export. Citation "
            "indicators use the total 'Cited by' values exported by Scopus."
        )
    )
    parser.add_argument(
        "csv_file",
        nargs="?",
        default="scopus.csv",
        type=Path,
        help="Scopus CSV export to read. Default: scopus.csv",
    )
    parser.add_argument(
        "-o",
        "--output",
        default=Path("asn_indicators_report.txt"),
        type=Path,
        help="Text report to write. Default: asn_indicators_report.txt",
    )
    parser.add_argument(
        "--current-year",
        "--as-of-year",
        dest="current_year",
        default=date.today().year,
        type=int,
        help="Final year for inclusive publication windows. Default: current year",
    )
    parser.add_argument(
        "--no-deduplicate",
        action="store_true",
        help="Do not deduplicate records by EID or DOI.",
    )
    parser.add_argument(
        "--include-errata",
        action="store_true",
        help='Include records whose Scopus "Document Type" is "Erratum".',
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    papers = read_scopus_csv(
        args.csv_file,
        deduplicate=not args.no_deduplicate,
        exclude_errata=not args.include_errata,
    )
    report = build_report(papers, as_of_year=args.current_year)
    write_report(args.output, report)
    print(build_short_summary(papers, as_of_year=args.current_year, output_path=args.output))


if __name__ == "__main__":
    main()
