(function () {
  "use strict";

  const csvFile = document.querySelector("#csv-file");
  const fileDrop = document.querySelector("#file-drop");
  const currentYear = document.querySelector("#current-year");
  const deduplicate = document.querySelector("#deduplicate");
  const excludeErrata = document.querySelector("#exclude-errata");
  const status = document.querySelector("#status");
  const statusMessage = document.querySelector("#status-message");
  const removedRecords = document.querySelector("#removed-records");
  const results = document.querySelector("#results");
  const summaryGrid = document.querySelector("#summary-grid");
  const tables = document.querySelector("#tables");
  const downloadReport = document.querySelector("#download-report");
  const downloadTables = document.querySelector("#download-tables");

  let lastAnalysis = null;

  currentYear.value = String(new Date().getFullYear());
  downloadReport.disabled = true;
  downloadTables.disabled = true;

  csvFile.addEventListener("change", analyzeSelectedFile);
  fileDrop.addEventListener("dragenter", handleDragEnter);
  fileDrop.addEventListener("dragover", handleDragOver);
  fileDrop.addEventListener("dragleave", handleDragLeave);
  fileDrop.addEventListener("drop", handleDrop);
  currentYear.addEventListener("change", analyzeSelectedFile);
  deduplicate.addEventListener("change", analyzeSelectedFile);
  excludeErrata.addEventListener("change", analyzeSelectedFile);
  downloadReport.addEventListener("click", () => {
    if (lastAnalysis) {
      downloadText("asn_indicators_report.txt", lastAnalysis.reportText, "text/plain");
    }
  });
  downloadTables.addEventListener("click", () => {
    if (lastAnalysis) {
      downloadText("asn_indicators_tables.csv", lastAnalysis.tablesCsv, "text/csv");
    }
  });

  function handleDragEnter(event) {
    event.preventDefault();
    fileDrop.classList.add("drag-over");
  }

  function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    fileDrop.classList.add("drag-over");
  }

  function handleDragLeave(event) {
    if (!fileDrop.contains(event.relatedTarget)) {
      fileDrop.classList.remove("drag-over");
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    fileDrop.classList.remove("drag-over");
    const file = Array.from(event.dataTransfer.files).find((item) => {
      return item.type === "text/csv" || item.name.toLowerCase().endsWith(".csv");
    });
    if (!file) {
      clearResults();
      showStatus("Drop a CSV file exported from Scopus.", true);
      return;
    }
    const transfer = new DataTransfer();
    transfer.items.add(file);
    csvFile.files = transfer.files;
    analyzeSelectedFile();
  }

  async function analyzeSelectedFile() {
    const file = csvFile.files[0];
    if (!file) {
      showStatus("Waiting for a Scopus CSV export.");
      clearResults();
      return;
    }

    try {
      showStatus("Reading " + file.name + "...");
      const text = await file.text();
      const rows = parseCsv(text);
      const result = readScopusRows(rows, {
        deduplicate: deduplicate.checked,
        excludeErrata: excludeErrata.checked,
      });
      const papers = result.papers;
      const asOfYear = parseYear(currentYear.value);
      lastAnalysis = buildAnalysis(papers, asOfYear);
      renderAnalysis(lastAnalysis);
      showStatus(
        "Processed " +
          papers.length +
          " records for inclusive windows ending in " +
          asOfYear +
          ".",
        false,
        result.removed
      );
    } catch (error) {
      clearResults();
      showStatus(error.message || String(error), true);
    }
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];

      if (inQuotes) {
        if (char === '"' && next === '"') {
          field += '"';
          i += 1;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          field += char;
        }
        continue;
      }

      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        row.push(field);
        field = "";
      } else if (char === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (char !== "\r") {
        field += char;
      }
    }

    if (inQuotes) {
      throw new Error("CSV parse error: unterminated quoted field.");
    }
    if (field !== "" || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
  }

  function readScopusRows(rows, options) {
    if (rows.length === 0) {
      throw new Error("The CSV file is empty.");
    }

    const headers = rows[0].map((header) => header.trim());
    const required = ["Authors", "Title", "Year", "Cited by", "DOI"];
    if (options.excludeErrata) {
      required.push("Document Type");
    }
    const missing = required.filter((column) => !headers.includes(column));
    if (missing.length > 0) {
      throw new Error("Missing required Scopus column(s): " + missing.join(", "));
    }

    const seen = new Set();
    const papers = [];
    const removed = [];
    rows.slice(1).forEach((cells, index) => {
      const rowNumber = index + 2;
      const row = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] || ""]));

      if (
        options.excludeErrata &&
        (row["Document Type"] || "").trim().toLowerCase() === "erratum"
      ) {
        removed.push(removedRecord(row, rowNumber, "erratum"));
        return;
      }

      if (options.deduplicate) {
        const recordId = ((row.EID || row.DOI || "") + "").trim();
        if (recordId) {
          if (seen.has(recordId)) {
            removed.push(removedRecord(row, rowNumber, "duplicate " + recordId));
            return;
          }
          seen.add(recordId);
        }
      }

      const year = parseOptionalInt(row.Year, "Year", rowNumber);
      const citations = parseOptionalInt(row["Cited by"], "Cited by", rowNumber);
      if (year === null) {
        return;
      }
      papers.push({
        year,
        citations: citations || 0,
        firstAuthor: firstAuthor(row.Authors || ""),
        doi: (row.DOI || "").trim() || "n/a",
        title: (row.Title || "").trim(),
      });
    });

    return { papers, removed };
  }

  function removedRecord(row, rowNumber, reason) {
    return {
      rowNumber,
      reason,
      firstAuthor: firstAuthor(row.Authors || ""),
      year: (row.Year || "").trim() || "n/a",
      doi: (row.DOI || "").trim() || "n/a",
      title: (row.Title || "").trim() || "Untitled",
    };
  }

  function parseOptionalInt(value, fieldName, rowNumber) {
    const clean = (value || "").trim();
    if (clean === "") {
      return null;
    }
    if (!/^-?\d+$/.test(clean)) {
      throw new Error(
        "Row " + rowNumber + ": cannot parse " + fieldName + " value " + JSON.stringify(value) + " as an integer"
      );
    }
    return Number.parseInt(clean, 10);
  }

  function parseYear(value) {
    const year = Number.parseInt(value, 10);
    if (!Number.isInteger(year) || year < 1900 || year > 2200) {
      throw new Error("Reference year must be an integer between 1900 and 2200.");
    }
    return year;
  }

  function firstAuthor(authors) {
    return authors.split(";")[0].trim() || "n/a";
  }

  function fromYear(asOfYear, windowYears) {
    return asOfYear - windowYears + 1;
  }

  function papersInWindow(papers, asOfYear, windowYears) {
    const firstYear = fromYear(asOfYear, windowYears);
    return papers
      .filter((paper) => firstYear <= paper.year && paper.year <= asOfYear)
      .sort((a, b) => {
        if (b.year !== a.year) return b.year - a.year;
        if (a.firstAuthor !== b.firstAuthor) return a.firstAuthor.localeCompare(b.firstAuthor);
        return a.title.localeCompare(b.title);
      });
  }

  function hIndex(citations) {
    const sorted = citations.slice().sort((a, b) => b - a);
    let h = 0;
    sorted.forEach((citationCount, index) => {
      const rank = index + 1;
      if (citationCount >= rank) {
        h = rank;
      }
    });
    return h;
  }

  function hIndexDetails(papers) {
    const ranked = papers.slice().sort((a, b) => {
      if (b.citations !== a.citations) return b.citations - a.citations;
      if (b.year !== a.year) return b.year - a.year;
      return a.firstAuthor.localeCompare(b.firstAuthor);
    });
    const h = hIndex(ranked.map((paper) => paper.citations));
    return {
      h,
      rows: ranked.map((paper, index) => {
        const rank = index + 1;
        return {
          rank,
          citations: paper.citations,
          counts: paper.citations >= rank,
          firstAuthor: paper.firstAuthor,
          year: paper.year,
          doi: paper.doi,
          title: paper.title,
        };
      }),
    };
  }

  function buildAnalysis(papers, asOfYear) {
    const papers5 = papersInWindow(papers, asOfYear, 5);
    const papers10 = papersInWindow(papers, asOfYear, 10);
    const papers15 = papersInWindow(papers, asOfYear, 15);
    const h10 = hIndexDetails(papers10);
    const h15 = hIndexDetails(papers15);

    const sections = [
      {
        id: "papers-5",
        title: "Papers 5 years",
        window: windowLabel(asOfYear, 5),
        meta: "Count: " + papers5.length,
        rows: paperRows(papers5),
        columns: paperColumns(),
      },
      {
        id: "papers-10",
        title: "Papers 10 years",
        window: windowLabel(asOfYear, 10),
        meta: "Count: " + papers10.length + "; total citations: " + sumCitations(papers10),
        rows: paperRows(papers10),
        columns: paperColumns(),
      },
      {
        id: "citations-15",
        title: "Citations 15 years",
        window: windowLabel(asOfYear, 15),
        meta: "Total citations: " + sumCitations(papers15),
        rows: paperRows(papers15),
        columns: paperColumns(),
      },
      {
        id: "h-index-10",
        title: "H index 10 years",
        window: windowLabel(asOfYear, 10),
        meta: "H index: " + h10.h,
        rows: h10.rows,
        columns: hColumns(),
      },
      {
        id: "h-index-15",
        title: "H index 15 years",
        window: windowLabel(asOfYear, 15),
        meta: "H index: " + h15.h,
        rows: h15.rows,
        columns: hColumns(),
      },
    ];

    const summary = [
      {
        label: "Prima fascia / commissari: papers",
        value: papers10.length,
        window: windowLabel(asOfYear, 10),
      },
      {
        label: "Prima fascia / commissari: citations",
        value: sumCitations(papers15),
        window: windowLabel(asOfYear, 15),
      },
      {
        label: "Prima fascia / commissari: h-index",
        value: h15.h,
        window: windowLabel(asOfYear, 15),
      },
      {
        label: "Seconda fascia: papers",
        value: papers5.length,
        window: windowLabel(asOfYear, 5),
      },
      {
        label: "Seconda fascia: citations",
        value: sumCitations(papers10),
        window: windowLabel(asOfYear, 10),
      },
      {
        label: "Seconda fascia: h-index",
        value: h10.h,
        window: windowLabel(asOfYear, 10),
      },
    ];

    return {
      asOfYear,
      summary,
      sections,
      reportText: buildReportText(asOfYear, sections, h10, h15),
      tablesCsv: buildTablesCsv(sections),
    };
  }

  function windowLabel(asOfYear, windowYears) {
    return fromYear(asOfYear, windowYears) + "-" + asOfYear;
  }

  function sumCitations(papers) {
    return papers.reduce((total, paper) => total + paper.citations, 0);
  }

  function paperRows(papers) {
    return papers.map((paper, index) => ({
      rank: index + 1,
      firstAuthor: paper.firstAuthor,
      year: paper.year,
      doi: paper.doi,
      citations: paper.citations,
      title: paper.title,
    }));
  }

  function paperColumns() {
    return [
      ["rank", "#"],
      ["firstAuthor", "First author"],
      ["year", "Year"],
      ["doi", "DOI"],
      ["citations", "Citations"],
      ["title", "Title"],
    ];
  }

  function hColumns() {
    return [
      ["rank", "Rank"],
      ["citations", "Citations"],
      ["counts", "Counts for h"],
      ["firstAuthor", "First author"],
      ["year", "Year"],
      ["doi", "DOI"],
      ["title", "Title"],
    ];
  }

  function buildReportText(asOfYear, sections) {
    const lines = [
      "ASN indicators",
      "Reference year: " + asOfYear,
      "Publication windows are inclusive, e.g. 5 years means " + windowLabel(asOfYear, 5) + ".",
      "",
      "ASN indicators summary",
      " Prima fascia/commissari:",
    ];
    const summaryByLabel = Object.fromEntries(lastSummaryFromSections(asOfYear, sections));
    lines.push("  Papers 10 years (" + windowLabel(asOfYear, 10) + "): " + summaryByLabel.papers10);
    lines.push("  Citations 15 years (" + windowLabel(asOfYear, 15) + "): " + summaryByLabel.citations15);
    lines.push("  H index 15 years (" + windowLabel(asOfYear, 15) + "): " + summaryByLabel.h15);
    lines.push(" Seconda fascia:");
    lines.push("  Papers 5 years (" + windowLabel(asOfYear, 5) + "): " + summaryByLabel.papers5);
    lines.push("  Citations 10 years (" + windowLabel(asOfYear, 10) + "): " + summaryByLabel.citations10);
    lines.push("  H index 10 years (" + windowLabel(asOfYear, 10) + "): " + summaryByLabel.h10);
    lines.push("");

    sections.forEach((section) => {
      lines.push("# " + section.title + " (" + section.window + ")");
      lines.push(section.meta);
      section.rows.forEach((row) => {
        if ("counts" in row) {
          lines.push(
            row.rank +
              ". " +
              row.citations +
              " citations " +
              (row.counts ? ">= rank " : "< rank ") +
              row.rank +
              ": " +
              (row.counts ? "counts" : "does not count") +
              "; " +
              row.firstAuthor +
              " (" +
              row.year +
              "); DOI: " +
              row.doi
          );
        } else {
          lines.push(
            row.rank +
              ". " +
              row.firstAuthor +
              " (" +
              row.year +
              "); DOI: " +
              row.doi +
              "; citations: " +
              row.citations
          );
        }
      });
      lines.push("");
    });
    return lines.join("\n");
  }

  function lastSummaryFromSections(asOfYear, sections) {
    const get = (id) => sections.find((section) => section.id === id);
    const papers5 = get("papers-5").rows.length;
    const papers10 = get("papers-10").rows.length;
    const citations10 = get("papers-10").rows.reduce((total, row) => total + row.citations, 0);
    const citations15 = get("citations-15").rows.reduce((total, row) => total + row.citations, 0);
    const h10 = get("h-index-10").meta.replace("H index: ", "");
    const h15 = get("h-index-15").meta.replace("H index: ", "");
    return [
      ["papers5", papers5],
      ["papers10", papers10],
      ["citations10", citations10],
      ["citations15", citations15],
      ["h10", h10],
      ["h15", h15],
    ];
  }

  function renderAnalysis(analysis) {
    summaryGrid.replaceChildren(
      ...analysis.summary.map((metric) => {
        const card = document.createElement("article");
        card.className = "metric";
        card.innerHTML =
          '<div class="metric-label"></div><div class="metric-value"></div><div class="metric-window"></div>';
        card.querySelector(".metric-label").textContent = metric.label;
        card.querySelector(".metric-value").textContent = String(metric.value);
        card.querySelector(".metric-window").textContent = metric.window;
        return card;
      })
    );

    tables.replaceChildren(...analysis.sections.map(renderTable));
    results.classList.remove("hidden");
    downloadReport.disabled = false;
    downloadTables.disabled = false;
  }

  function renderTable(section) {
    const article = document.createElement("article");
    article.className = "table-card";

    const title = document.createElement("h3");
    title.textContent = section.title + " (" + section.window + ")";
    article.append(title);

    const meta = document.createElement("p");
    meta.className = "table-meta";
    meta.textContent = section.meta;
    article.append(meta);

    if (section.rows.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No records in this window.";
      article.append(empty);
      return article;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "table-scroll";
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const tbody = document.createElement("tbody");
    const headerRow = document.createElement("tr");
    section.columns.forEach(([, label]) => {
      const th = document.createElement("th");
      th.textContent = label;
      headerRow.append(th);
    });
    thead.append(headerRow);

    section.rows.forEach((row) => {
      const tr = document.createElement("tr");
      section.columns.forEach(([key]) => {
        const td = document.createElement("td");
        const value = key === "counts" ? (row[key] ? "yes" : "no") : row[key];
        if (key === "doi" && doiUrl(value)) {
          const link = document.createElement("a");
          link.href = doiUrl(value);
          link.target = "_blank";
          link.rel = "noreferrer";
          link.textContent = String(value);
          td.append(link);
        } else {
          td.textContent = String(value);
        }
        if (key === "rank" || key === "year" || key === "citations") {
          td.className = "numeric";
        }
        tr.append(td);
      });
      tbody.append(tr);
    });

    table.append(thead, tbody);
    wrapper.append(table);
    article.append(wrapper);
    return article;
  }

  function buildTablesCsv(sections) {
    const rows = [["section", "window", "rank", "first_author", "year", "doi", "citations", "counts_for_h", "title"]];
    sections.forEach((section) => {
      section.rows.forEach((row) => {
        rows.push([
          section.title,
          section.window,
          row.rank,
          row.firstAuthor,
          row.year,
          row.doi,
          row.citations,
          "counts" in row ? (row.counts ? "yes" : "no") : "",
          row.title,
        ]);
      });
    });
    return rows.map((row) => row.map(csvEscape).join(",")).join("\n") + "\n";
  }

  function csvEscape(value) {
    const text = String(value == null ? "" : value);
    if (/[",\n\r]/.test(text)) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }

  function doiUrl(value) {
    const doi = String(value || "").trim();
    if (!doi || doi.toLowerCase() === "n/a") {
      return "";
    }
    if (/^https?:\/\//i.test(doi)) {
      return doi;
    }
    return "https://doi.org/" + encodeURIComponent(doi).replace(/%2F/g, "/");
  }

  function downloadText(filename, text, type) {
    const blob = new Blob([text], { type: type + ";charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function clearResults() {
    lastAnalysis = null;
    results.classList.add("hidden");
    summaryGrid.replaceChildren();
    tables.replaceChildren();
    downloadReport.disabled = true;
    downloadTables.disabled = true;
  }

  function showStatus(message, isError, removed) {
    statusMessage.textContent = message;
    status.classList.toggle("error", Boolean(isError));
    renderRemovedRecords(removed || []);
  }

  function renderRemovedRecords(removed) {
    removedRecords.replaceChildren();
    if (removed.length === 0) {
      removedRecords.classList.add("hidden");
      return;
    }

    removedRecords.classList.remove("hidden");
    const summary = document.createElement("div");
    summary.textContent =
      "Removed " +
      removed.length +
      " record" +
      (removed.length === 1 ? "" : "s") +
      " because of errata filtering or deduplication:";
    const list = document.createElement("ul");
    removed.forEach((record) => {
      const item = document.createElement("li");
      item.textContent =
        "Row " +
        record.rowNumber +
        " (" +
        record.reason +
        "): " +
        record.firstAuthor +
        " " +
        record.year +
        ", DOI " +
        record.doi +
        ", " +
        record.title;
      list.append(item);
    });
    removedRecords.append(summary, list);
  }

  window.asnIndicators = {
    buildAnalysis,
    doiUrl,
    parseCsv,
    readScopusRows,
  };
})();
