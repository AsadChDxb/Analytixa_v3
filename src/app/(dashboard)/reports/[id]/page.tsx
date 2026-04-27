/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import InlineSnackbar from "@/components/InlineSnackbar";
import {
  calculateBottomTotals,
  formatDateTimeFixed,
  formatCurrency,
  getOperatorsByDataType,
  inferDataType,
  parseBottomTotalsFromParameters,
  parseHeaderLayout,
  parsePdfLayoutFromParameters,
  transformReportRows,
} from "@/lib/reportUtils";

type ReportDefinition = {
  id: number;
  name: string;
  code: string;
  description: string;
  datasourceId: number;
  ownerUserId: number;
  isPublic: boolean;
  isPrivate: boolean;
  columns: Array<{ columnName: string; displayName: string; displayOrder: number }>;
  filters: Array<{ fieldName: string; operator: string; value: string | null; valueType: string }>;
  sorts: Array<{ fieldName: string; direction: string; sortOrder: number }>;
  groups: Array<{ fieldName: string; groupOrder: number }>;
  aggregations: Array<{ fieldName: string; aggregateFunction: string }>;
  parameters: Array<{ name: string; value: string | null; dataType: string }>;
  branding: {
    logoUrl: string | null;
    title: string;
    subtitle: string | null;
    headerFieldsJson: string | null;
    headerAlignment: string;
    showLogo: boolean;
    showGeneratedDate: boolean;
    showGeneratedBy: boolean;
    footerText: string | null;
    watermarkText: string | null;
  };
};

type RunResult = {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  totalCount: number;
};

type RuntimeFilter = {
  id: string;
  columnName: string;
  valueType: string;
  operator: string;
  value: string;
  startValue: string;
  endValue: string;
};

const uid = () => `${Date.now()}_${Math.random().toString(16).slice(2)}`;
const PRINT_SURFACE_ID = "report-print-surface";

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error !== "object" || error === null) {
    return fallback;
  }

  const maybeAxiosError = error as {
    response?: {
      data?: {
        errors?: string[];
      };
    };
  };

  return maybeAxiosError.response?.data?.errors?.[0] ?? fallback;
};

const toComparable = (value: unknown, type: string): string | number => {
  const normalized = type.toLowerCase();

  if (normalized === "number") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  if (normalized === "date") {
    const time = Date.parse(String(value ?? ""));
    return Number.isNaN(time) ? 0 : time;
  }

  if (normalized === "boolean") {
    return String(value ?? "").toLowerCase() === "true" ? 1 : 0;
  }

  return String(value ?? "").toLowerCase();
};

const formatCellValue = (value: unknown, columnName: string, columnType: string): string => {
  const normalized = columnType.toLowerCase();
  
  // Only format as currency for decimal/float types with amount/qty/price keywords
  const shouldFormatCurrency = (normalized === "decimal" || normalized === "float" || normalized === "number")
    && (columnName.toLowerCase().includes("amount") || 
        columnName.toLowerCase().includes("quantity") || 
        columnName.toLowerCase().includes("qty") ||
        columnName.toLowerCase().includes("price") ||
        columnName.toLowerCase().includes("cost") ||
        columnName.toLowerCase().includes("total") ||
        columnName.toLowerCase().includes("rate"));
  
  if (shouldFormatCurrency) {
    return formatCurrency(value);
  }
  
  // For integers/bigints, just show as-is without formatting
  if (normalized === "int" || normalized === "bigint" || normalized === "integer") {
    return String(value ?? "");
  }
  
  if (normalized === "date") {
    return formatDateTimeFixed(String(value ?? ""));
  }
  
  return String(value ?? "");
};

const matchesRuntimeFilter = (rowValue: unknown, filter: RuntimeFilter): boolean => {
  const operator = filter.operator;
  const type = filter.valueType.toLowerCase();

  if (type === "date" && operator === "between") {
    const current = Number(toComparable(rowValue, "date"));
    const from = filter.startValue ? Number(toComparable(filter.startValue, "date")) : Number.NEGATIVE_INFINITY;
    const to = filter.endValue ? Number(toComparable(filter.endValue, "date")) : Number.POSITIVE_INFINITY;
    return current >= from && current <= to;
  }

  const left = toComparable(rowValue, type);
  const right = toComparable(filter.value, type);

  switch (operator) {
    case "contains":
      return String(left).includes(String(right));
    case "startsWith":
      return String(left).startsWith(String(right));
    case "endsWith":
      return String(left).endsWith(String(right));
    case "=":
      return left === right;
    case "!=":
      return left !== right;
    case ">":
      return left > right;
    case ">=":
      return left >= right;
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    default:
      return true;
  }
};

function ReportViewerContent() {
  const params = useParams<{ id: string }>();
  const reportId = Number(params.id);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [definition, setDefinition] = useState<ReportDefinition | null>(null);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [runtimeFilters, setRuntimeFilters] = useState<RuntimeFilter[]>([]);
  const [runtimeFiltersApplied, setRuntimeFiltersApplied] = useState(false);
  const [showRuntimeFilters, setShowRuntimeFilters] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const headerLayout = useMemo(() => parseHeaderLayout(definition?.branding.headerFieldsJson), [definition?.branding.headerFieldsJson]);
  const pdfLayout = useMemo(() => parsePdfLayoutFromParameters(definition?.parameters), [definition?.parameters]);

  const transformed = useMemo(() => {
    if (!definition || !runResult) {
      return { columns: [], rows: [] as Array<Record<string, unknown>> };
    }

    return transformReportRows(runResult.rows, {
      columns: definition.columns,
      filters: definition.filters,
      sorts: definition.sorts,
      groups: definition.groups,
      aggregations: definition.aggregations,
    });
  }, [definition, runResult]);

  const runtimeColumnTypes = useMemo(() => {
    const map = new Map<string, string>();

    for (const column of transformed.columns) {
      const sample = transformed.rows.find((row) => row[column] !== null && row[column] !== undefined && String(row[column]).trim().length > 0)?.[column];
      map.set(column, sample === undefined ? "string" : inferDataType(sample));
    }

    return map;
  }, [transformed.columns, transformed.rows]);

  const filteredRows = useMemo(() => {
    if (!runtimeFiltersApplied || runtimeFilters.length === 0) {
      return transformed.rows;
    }

    return transformed.rows.filter((row) =>
      runtimeFilters.every((filter) => matchesRuntimeFilter(row[filter.columnName], filter))
    );
  }, [runtimeFilters, runtimeFiltersApplied, transformed.rows]);

  const bottomTotals = useMemo(() => {
    if (!definition) {
      return {} as Record<string, string>;
    }

    return calculateBottomTotals(
      filteredRows,
      parseBottomTotalsFromParameters(definition.parameters),
      definition.columns.map((column) => ({ columnName: column.columnName, displayName: column.displayName }))
    );
  }, [definition, filteredRows]);

  const loadDefinition = async () => {
    setError("");
    try {
      const res = await api.get(`/reports/${reportId}`);
      setDefinition((res.data?.data ?? null) as ReportDefinition | null);
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Failed to load report definition."));
    }
  };

  const buildRuntimeParameters = () => ({
    runtimeFilters: runtimeFilters.map((filter) => ({
      columnName: filter.columnName,
      valueType: filter.valueType,
      operator: filter.operator,
      value: filter.value,
      startValue: filter.startValue,
      endValue: filter.endValue,
    })),
  });

  const runReport = async (successMessage: string) => {
    setStatus("");
    setError("");
    setRunLoading(true);

    try {
      const res = await api.post("/reports/run", {
        reportId,
        runtimeParameters: buildRuntimeParameters(),
        pageNumber: 1,
        pageSize: 100000,
      });

      const result = (res.data?.data ?? null) as RunResult | null;
      setRunResult(result);
      setStatus(successMessage);
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Failed to run report."));
    } finally {
      setRunLoading(false);
    }
  };

  useEffect(() => {
    void loadDefinition();
  }, [reportId]);

  useEffect(() => {
    if (searchParams.get("autorun") === "1") {
      setRuntimeFiltersApplied(false);
      void runReport("Report executed.");
    }
  }, [searchParams]);

  const addRuntimeFilter = () => {
    const firstColumn = transformed.columns[0];
    if (!firstColumn) {
      setError("Run report first to configure run-time filters.");
      return;
    }

    const type = runtimeColumnTypes.get(firstColumn) || "string";
    const operators = getOperatorsByDataType(type);

    setRuntimeFilters((prev) => [
      ...prev,
      {
        id: uid(),
        columnName: firstColumn,
        valueType: type,
        operator: type === "date" ? "between" : operators[0],
        value: "",
        startValue: "",
        endValue: "",
      },
    ]);
  };

  const clearRuntimeFilters = () => {
    setRuntimeFilters([]);
    setRuntimeFiltersApplied(false);
    setStatus("Run-time filters cleared.");
  };

  const applyRuntimeFilters = async () => {
    setRuntimeFiltersApplied(true);
    await runReport("Report executed with run-time filters.");
  };

  const openPdf = async () => {
    if (transformed.columns.length === 0 || filteredRows.length === 0) {
      setError("Run report first so PDF can include table data.");
      return;
    }

    setStatus("");
    setError("");
    setExportingPdf(true);

    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default as unknown as (
        doc: unknown,
        options: Record<string, unknown>
      ) => void;

      const pdf = new jsPDF({
        unit: "mm",
        format: pdfLayout.pageSize,
        orientation: pdfLayout.orientation,
      });
      const pageWidth = pdf.internal.pageSize.getWidth();

      const drawTextBlock = (
        lines: string[],
        align: "left" | "center" | "right",
        startY: number,
        fontSize: number
      ) => {
        if (lines.length === 0) {
          return startY;
        }

        const x = align === "left" ? 8 : align === "center" ? pageWidth / 2 : pageWidth - 8;
        pdf.setFontSize(fontSize);

        let y = startY;
        lines.forEach((line) => {
          pdf.text(line, x, y, { align });
          y += fontSize <= 9 ? 4 : 5;
        });
        return y;
      };

      const sessionUser = getSessionUser();
      const headerLines = (headerLayout.headerFields ?? [])
        .map((field) => `${field.label}: ${field.value}`)
        .filter((line) => line.trim().length > 0);

      let headerBottomY = 8;
      if (headerLines.length > 0) {
        const headerAlign =
          headerLayout.headerPosition === "center"
            ? "center"
            : headerLayout.headerPosition === "right"
              ? "right"
              : "left";
        headerBottomY = drawTextBlock(headerLines, headerAlign, 10, 9);
      }

      let logoBottomY = 8;
      if (definition?.branding.showLogo && definition.branding.logoUrl) {
        const dataUrl = definition.branding.logoUrl;
        const imageFormat = dataUrl.includes("image/png") ? "PNG" : "JPEG";

        try {
          const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("Failed to load logo image for PDF."));
            img.src = dataUrl;
          });

          const maxWidth = 34;
          const maxHeight = 16;
          const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
          const width = Math.max(1, image.width * scale);
          const height = Math.max(1, image.height * scale);

          const logoX =
            headerLayout.logoPosition === "center"
              ? (pageWidth - width) / 2
              : headerLayout.logoPosition === "right"
                ? pageWidth - 8 - width
                : 8;

          const logoY = 8;
          pdf.addImage(dataUrl, imageFormat, logoX, logoY, width, height);
          logoBottomY = logoY + height;
        } catch {
          // Skip logo if image decoding fails; keep PDF export working.
        }
      }

      const columns = transformed.columns;
      const rows = filteredRows.map((row) =>
        columns.map((column) => {
          const columnType = runtimeColumnTypes.get(column) || "string";
          return formatCellValue(row[column], column, columnType);
        })
      );

      if (Object.keys(bottomTotals).length > 0) {
        rows.push(
          columns.map((column) => {
            const totalValue = bottomTotals[column];
            if (!totalValue) {
              return "";
            }

            const columnType = runtimeColumnTypes.get(column) || "string";
            return formatCellValue(totalValue, column, columnType);
          })
        );
      }

      let cursorY = Math.max(headerBottomY, logoBottomY) + 4;
      pdf.setFontSize(12);
      pdf.text(definition?.branding.title || definition?.name || "Report", 8, cursorY);
      cursorY += 6;

      if (definition?.branding.subtitle) {
        pdf.setFontSize(10);
        pdf.text(definition.branding.subtitle, 8, cursorY);
        cursorY += 5;
      }

      if (definition?.branding.showGeneratedDate) {
        pdf.setFontSize(9);
        pdf.text(`Generated: ${formatDateTimeFixed(new Date())}`, 8, cursorY);
        cursorY += 5;
      }

      if (definition?.branding.showGeneratedBy && sessionUser) {
        pdf.setFontSize(9);
        pdf.text(`Generated by: ${sessionUser.fullName || sessionUser.username}`, 8, cursorY);
        cursorY += 5;
      }

      autoTable(pdf, {
        startY: cursorY,
        head: [columns],
        body: rows,
        theme: "grid",
        styles: {
          fontSize: 8,
          cellPadding: 1.8,
          overflow: "linebreak",
        },
        headStyles: {
          fillColor: [245, 247, 249],
          textColor: [35, 35, 35],
          fontStyle: "bold",
        },
        margin: {
          top: 8,
          right: 8,
          bottom: 12,
          left: 8,
        },
      });

      const pageCount = pdf.getNumberOfPages();
      for (let page = 1; page <= pageCount; page += 1) {
        pdf.setPage(page);
        const pageHeight = pdf.internal.pageSize.getHeight();
        pdf.setFontSize(9);
        if (definition?.branding.footerText) {
          pdf.text(definition.branding.footerText, 8, pageHeight - 6);
        }
        pdf.text(`Page ${page} of ${pageCount}`, pageWidth / 2, pageHeight - 6, { align: "center" });
      }

      const blob = pdf.output("blob");
      const url = window.URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => window.URL.revokeObjectURL(url), 60000);
      setStatus("PDF exported successfully.");
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Failed to open PDF."));
    } finally {
      setExportingPdf(false);
    }
  };

  const exportCurrentViewToExcel = () => {
    const reportElement = document.getElementById(PRINT_SURFACE_ID);
    if (!reportElement) {
      setError("Run report first to export current view.");
      return;
    }

    setExportingExcel(true);

    // Clone and expand — same rationale as PDF: we need fully-expanded HTML so
    // Excel receives all rows, not just the visible scrolled portion.
    const clone = reportElement.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".reportTableScroll").forEach((el) => {
      const elem = el as HTMLElement;
      elem.style.maxHeight = "none";
      elem.style.height = "auto";
      elem.style.overflow = "visible";
    });
    clone.querySelectorAll(".noPrint").forEach((el) => el.remove());

    try {
      const html = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office"
              xmlns:x="urn:schemas-microsoft-com:office:excel"
              xmlns="http://www.w3.org/TR/REC-html40">
          <head>
            <meta charset="utf-8" />
          </head>
          <body>
            ${clone.innerHTML}
          </body>
        </html>
      `;

      const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${definition?.code ?? "report"}.xls`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      setStatus("Current report view exported to Excel.");
    } finally {
      setExportingExcel(false);
    }
  };

  if (!definition) {
    return <div className="card"><p>Loading report viewer...</p></div>;
  }

  const renderHeaderCell = (position: "left" | "center" | "right") => {
    const showLogoHere = definition.branding.showLogo && headerLayout.logoPosition === position;
    const showHeadersHere = headerLayout.headerPosition === position;

    return (
      <div className="simpleHeaderCell">
        {showLogoHere ? (
          definition.branding.logoUrl ? <img src={definition.branding.logoUrl} alt="logo" className="reportLogo" /> : <span>Logo</span>
        ) : null}
        {showHeadersHere ? (
          <div>
            {headerLayout.headerFields.map((field) => (
              <p key={field.id}><strong>{field.label}:</strong> {field.value}</p>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  const icon = (name: "back" | "edit" | "play" | "filter" | "export") => {
    const common = {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.8,
      strokeLinecap: "round" as const,
      strokeLinejoin: "round" as const,
      className: "btnIconSvg",
      "aria-hidden": true,
    };

    if (name === "back") {
      return <svg {...common}><path d="M15 18l-6-6 6-6" /><path d="M9 12h10" /></svg>;
    }

    if (name === "edit") {
      return <svg {...common}><path d="M14 3l7 7-9.5 9.5H4v-7.5L14 3z" /><path d="M13 4l7 7" /></svg>;
    }

    if (name === "play") {
      return <svg {...common}><polygon points="8 5 19 12 8 19 8 5" /></svg>;
    }

    if (name === "filter") {
      return <svg {...common}><path d="M3 5h18l-7 8v6l-4-2v-4L3 5z" /></svg>;
    }

    return <svg {...common}><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 21h14" /></svg>;
  };

  return (
    <div className="stack">
      <section className="card noPrint">
        <h2>Report Viewer: {definition.name}</h2>
        <div className="actions reportActionWrap actionBarWrap">
          <div className="actions actionBarLeft">
            <button type="button" className="ghost btnWithIcon" onClick={() => router.push("/reports")}>
              <span className="btnIcon">{icon("back")}</span>
              <span>Back to My Reports</span>
            </button>
            <button type="button" className="ghost btnWithIcon" onClick={() => router.push(`/report-builder?reportId=${reportId}`)}>
              <span className="btnIcon">{icon("edit")}</span>
              <span>Edit in Builder</span>
            </button>
            <button
              type="button"
              className="btnWithIcon"
              onClick={() => {
                setRuntimeFiltersApplied(false);
                void runReport("Report executed.");
              }}
              disabled={runLoading}
            >
              <span className="btnIcon">{icon("play")}</span>
              <span>{runLoading ? "Running..." : "Run Report"}</span>
            </button>
            <button
              type="button"
              className="ghost btnWithIcon"
              onClick={() => setShowRuntimeFilters((prev) => !prev)}
            >
              <span className="btnIcon">{icon("filter")}</span>
              <span>{showRuntimeFilters ? "Hide Filter" : "Filter"}</span>
            </button>
          </div>

          <div className="actions actionBarRight">
            <button type="button" className="ghost btnWithIcon" onClick={() => void openPdf()} disabled={exportingPdf}>
              <span className="btnIcon">{icon("export")}</span>
              <span>{exportingPdf ? "Opening..." : "PDF"}</span>
            </button>
            <button type="button" className="ghost btnWithIcon" onClick={exportCurrentViewToExcel} disabled={exportingExcel}>
              <span className="btnIcon">{icon("export")}</span>
              <span>{exportingExcel ? "Exporting..." : "Excel"}</span>
            </button>
          </div>
        </div>
      </section>

      {showRuntimeFilters ? (
      <section className="card noPrint">
        <h3>Run-Time Filters</h3>
        <p className="mutedDescription">Create temporary filters for this run only. These filters are not saved in report definition.</p>
        <div className="actions">
          <button type="button" className="ghost" onClick={addRuntimeFilter}>Add Filter</button>
          <button type="button" onClick={() => void applyRuntimeFilters()} disabled={runLoading || transformed.columns.length === 0}>
            {runLoading ? "Running..." : "Apply Filters & Run"}
          </button>
          <button type="button" className="ghost" onClick={clearRuntimeFilters}>Clear Runtime Filters</button>
        </div>

        {runtimeFilters.length > 0 ? (
          <div className="runtimeFilterList">
            {runtimeFilters.map((filter) => {
              const type = runtimeColumnTypes.get(filter.columnName) || filter.valueType || "string";
              const operators = type === "date" ? ["between", ...getOperatorsByDataType(type)] : getOperatorsByDataType(type);

              return (
                <div key={filter.id} className="builderRowGrid">
                  <select
                    value={filter.columnName}
                    onChange={(event) => {
                      const nextColumn = event.target.value;
                      const nextType = runtimeColumnTypes.get(nextColumn) || "string";
                      const nextOperator = nextType === "date" ? "between" : getOperatorsByDataType(nextType)[0];

                      setRuntimeFilters((prev) => prev.map((item) =>
                        item.id === filter.id
                          ? {
                              ...item,
                              columnName: nextColumn,
                              valueType: nextType,
                              operator: nextOperator,
                              value: "",
                              startValue: "",
                              endValue: "",
                            }
                          : item
                      ));
                    }}
                  >
                    {transformed.columns.map((column) => (
                      <option key={column} value={column}>{column}</option>
                    ))}
                  </select>

                  <select
                    value={filter.operator}
                    onChange={(event) => {
                      const operator = event.target.value;
                      setRuntimeFilters((prev) => prev.map((item) =>
                        item.id === filter.id
                          ? {
                              ...item,
                              operator,
                              value: operator === "between" ? "" : item.value,
                              startValue: operator === "between" ? item.startValue : "",
                              endValue: operator === "between" ? item.endValue : "",
                            }
                          : item
                      ));
                    }}
                  >
                    {operators.map((operator) => (
                      <option key={operator} value={operator}>{operator}</option>
                    ))}
                  </select>

                  {type === "date" && filter.operator === "between" ? (
                    <div className="dateRangeWrap">
                      <input
                        type="date"
                        value={filter.startValue}
                        onChange={(event) =>
                          setRuntimeFilters((prev) => prev.map((item) =>
                            item.id === filter.id ? { ...item, startValue: event.target.value } : item
                          ))
                        }
                      />
                      <input
                        type="date"
                        value={filter.endValue}
                        onChange={(event) =>
                          setRuntimeFilters((prev) => prev.map((item) =>
                            item.id === filter.id ? { ...item, endValue: event.target.value } : item
                          ))
                        }
                      />
                    </div>
                  ) : (
                    <input
                      type={type === "number" ? "number" : type === "date" ? "date" : "text"}
                      value={filter.value}
                      onChange={(event) =>
                        setRuntimeFilters((prev) => prev.map((item) =>
                          item.id === filter.id ? { ...item, value: event.target.value } : item
                        ))
                      }
                    />
                  )}

                  <button
                    type="button"
                    className="danger smallButton"
                    onClick={() => setRuntimeFilters((prev) => prev.filter((item) => item.id !== filter.id))}
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mutedDescription">No run-time filter configured.</p>
        )}
      </section>
      ) : null}

      <section className="card reportOutputCard">
        <h3>
          Report Output
          {runResult ? <span className="mutedDescription"> | Rows loaded: {filteredRows.length.toLocaleString()}</span> : null}
        </h3>
        <div className="reportPreviewWrap printSurface" id={PRINT_SURFACE_ID}>
          <div className="reportHeaderGrid simpleHeaderGrid">
            {renderHeaderCell("left")}
            {renderHeaderCell("center")}
            {renderHeaderCell("right")}
          </div>
          <h3>{definition.branding.title}</h3>
          {definition.branding.subtitle ? <p className="mutedDescription">{definition.branding.subtitle}</p> : null}
          {definition.branding.showGeneratedDate ? <p className="mutedDescription">Generated: {formatDateTimeFixed(new Date())}</p> : null}

          {transformed.columns.length > 0 ? (
            <div className="reportTableScroll">
              <table className="table">
                <thead>
                  <tr>
                    {transformed.columns.map((column) => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, index) => (
                    <tr key={index}>
                      {transformed.columns.map((column) => {
                        const columnType = runtimeColumnTypes.get(column) || "string";
                        return (
                          <td key={column}>{formatCellValue(row[column], column, columnType)}</td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                {Object.keys(bottomTotals).length > 0 ? (
                  <tfoot>
                    <tr className="totalsRow">
                      {transformed.columns.map((column) => {
                        const columnType = runtimeColumnTypes.get(column) || "string";
                        const totalValue = bottomTotals[column];
                        return (
                          <td key={column}>
                            {totalValue ? formatCellValue(totalValue, column, columnType) : ""}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          ) : (
            <p>Run report to view data.</p>
          )}

          {runtimeFiltersApplied ? <p className="mutedDescription"><strong>Runtime filter mode:</strong> Applied ({runtimeFilters.length} filter(s))</p> : null}

          {definition.branding.footerText ? <p>{definition.branding.footerText}</p> : null}
          {definition.branding.watermarkText ? <p className="watermarkText">{definition.branding.watermarkText}</p> : null}
        </div>
      </section>

      <InlineSnackbar message={status} type="success" onClose={() => setStatus("")} />
      <InlineSnackbar message={error} type="error" onClose={() => setError("")} />
    </div>
  );
}

export default function ReportViewerPage() {
  return (
    <Suspense fallback={<div className="card burst"><p className="dashboardSub">Loading report viewer...</p></div>}>
      <ReportViewerContent />
    </Suspense>
  );
}
