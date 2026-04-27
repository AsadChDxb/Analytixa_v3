"use client";

export const dynamic = "force-dynamic";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import {
  Suspense,
  FormEvent,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReactGridLayout from "react-grid-layout";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import clsx from "clsx";
import api from "@/lib/api";
import InlineSnackbar from "@/components/InlineSnackbar";
import {
  buildGroupedChartData,
  buildMetricValue,
  createDashboardWidget,
  DatasourceColumn,
  DashboardAggregate,
  DashboardDefinition,
  DashboardMetricFormat,
  DashboardRecord,
  DashboardWidget,
  DashboardWidgetType,
  Datasource,
  emptyDashboardDefinition,
  formatChartAxisLabel,
  formatMetricValue,
  getWidgetPalette,
  getTableColumns,
  isNumericDataType,
  normalizeDashboardDefinition,
  palettePresets,
  widgetCatalog,
} from "@/lib/dashboardBuilder";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RGL = ReactGridLayout as any;

/* â”€â”€â”€ local types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
type BuilderPreviewResult = {
  rows: DashboardRecord[];
  columns: { name: string; dataType: string }[];
};

const GRID_COLS = 12;
const GRID_ROW_HEIGHT = 60;
const GRID_MARGIN = 12;
const GRID_PADDING = 12;

const aggregateOptions: { value: DashboardAggregate; label: string }[] = [
  { value: "sum", label: "Sum" },
  { value: "avg", label: "Average" },
  { value: "count", label: "Count" },
  { value: "min", label: "Min" },
  { value: "max", label: "Max" },
];

const formatOptions: { value: DashboardMetricFormat; label: string }[] = [
  { value: "number", label: "Number" },
  { value: "currency", label: "Currency" },
  { value: "percent", label: "Percent" },
];

function getErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Unexpected error";
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function aggregateNumbers(values: number[], mode: DashboardAggregate): number {
  if (mode === "count") {
    return values.length;
  }
  if (values.length === 0) {
    return 0;
  }
  if (mode === "sum") {
    return values.reduce((acc, current) => acc + current, 0);
  }
  if (mode === "avg") {
    return values.reduce((acc, current) => acc + current, 0) / values.length;
  }
  if (mode === "min") {
    return Math.min(...values);
  }
  return Math.max(...values);
}

/* â”€â”€â”€ Mini SVG chart previews for the catalog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function MiniChartSvg({ type, color }: { type: DashboardWidgetType; color: string }) {
  const c = color;
  const light = `${c}33`;

  switch (type) {
    case "bar":
      return (
        <svg viewBox="0 0 52 36" className="miniChartSvg">
          <rect x="4" y="18" width="8" height="14" fill={c} rx="1.5" />
          <rect x="14" y="10" width="8" height="22" fill={c} rx="1.5" />
          <rect x="24" y="6" width="8" height="26" fill={c} rx="1.5" />
          <rect x="34" y="14" width="8" height="18" fill={c} rx="1.5" />
          <rect x="44" y="22" width="8" height="10" fill={c} rx="1.5" />
        </svg>
      );
    case "line":
      return (
        <svg viewBox="0 0 52 36" className="miniChartSvg">
          <polyline points="4,28 14,18 24,22 34,10 44,14 52,8" fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round" />
          <circle cx="4" cy="28" r="2" fill={c} />
          <circle cx="14" cy="18" r="2" fill={c} />
          <circle cx="24" cy="22" r="2" fill={c} />
          <circle cx="34" cy="10" r="2" fill={c} />
          <circle cx="44" cy="14" r="2" fill={c} />
        </svg>
      );
    case "area":
      return (
        <svg viewBox="0 0 52 36" className="miniChartSvg">
          <polygon points="4,32 4,26 14,16 24,20 34,8 44,12 52,6 52,32" fill={light} />
          <polyline points="4,26 14,16 24,20 34,8 44,12 52,6" fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round" />
        </svg>
      );
    case "pie":
      return (
        <svg viewBox="0 0 52 36" className="miniChartSvg">
          <circle cx="26" cy="18" r="14" fill={light} stroke={c} strokeWidth="1.5" />
          <path d="M26,18 L26,4 A14,14 0 0,1 40,18 Z" fill={c} />
          <path d="M26,18 L40,18 A14,14 0 0,1 26,32 Z" fill={`${c}99`} />
        </svg>
      );
    case "donut":
      return (
        <svg viewBox="0 0 52 36" className="miniChartSvg">
          <circle cx="26" cy="18" r="14" fill="none" stroke={light} strokeWidth="7" />
          <circle cx="26" cy="18" r="14" fill="none" stroke={c} strokeWidth="7" strokeDasharray="35 53" strokeDashoffset="-5" strokeLinecap="round" />
          <circle cx="26" cy="18" r="14" fill="none" stroke={`${c}77`} strokeWidth="7" strokeDasharray="22 66" strokeDashoffset="-43" strokeLinecap="round" />
        </svg>
      );
    case "kpi":
      return (
        <svg viewBox="0 0 52 36" className="miniChartSvg">
          <text x="26" y="22" textAnchor="middle" fontSize="16" fontWeight="800" fill={c}>42</text>
          <text x="26" y="30" textAnchor="middle" fontSize="7" fill={`${c}99`}>Metric</text>
        </svg>
      );
    case "tile":
      return (
        <svg viewBox="0 0 52 36" className="miniChartSvg">
          <rect x="4" y="6" width="44" height="24" rx="4" fill={light} />
          <text x="26" y="20" textAnchor="middle" fontSize="11" fontWeight="700" fill={c}>1,234</text>
          <text x="26" y="27" textAnchor="middle" fontSize="6" fill={`${c}88`}>Label</text>
        </svg>
      );
    case "table":
      return (
        <svg viewBox="0 0 52 36" className="miniChartSvg">
          <rect x="4" y="4" width="44" height="6" rx="1" fill={c} />
          <rect x="4" y="12" width="44" height="5" rx="1" fill={light} />
          <rect x="4" y="19" width="44" height="5" rx="1" fill={light} />
          <rect x="4" y="26" width="44" height="5" rx="1" fill={light} />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 52 36" className="miniChartSvg">
          <rect x="4" y="4" width="44" height="28" rx="4" fill={light} />
        </svg>
      );
  }
}

/* â”€â”€â”€ Canvas chart body â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function CanvasChartBody({
  widget,
  rows,
  definition,
}: {
  widget: DashboardWidget;
  rows: DashboardRecord[];
  definition: DashboardDefinition;
}) {
  const palette = getWidgetPalette(widget, definition);
  const cfg = widget.config;

  if (widget.type === "kpi" || widget.type === "tile") {
    const val = buildMetricValue(rows, widget);
    return (
      <div className={widget.type === "kpi" ? "canvasMetricKpi" : "canvasMetricTile"}
        style={{ "--widget-color": palette[0] } as React.CSSProperties}>
        <strong>{formatMetricValue(val, cfg.format ?? "number", cfg.currencySymbol)}</strong>
      </div>
    );
  }

  if (widget.type === "table") {
    const cols = getTableColumns(rows, widget);
    const displayRows = rows.slice(0, cfg.limit ?? 100);
    return (
      <div className="canvasTableWrap">
        <table className="canvasTable">
          <thead>
            <tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {displayRows.map((row, ri) => (
              <tr key={ri}>
                {cols.map((c) => <td key={c}>{String(row[c] ?? "")}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const chartData = buildGroupedChartData(rows, widget);
  if (!chartData.length) {
    return (
      <div className="canvasEmptyBody">
        <MiniChartSvg type={widget.type} color={palette[0]} />
        <p>Configure X &amp; Y fields to see chart</p>
      </div>
    );
  }

  const showLegend = cfg.showLegend !== false;
  const xKey = "name";
  const yKey = "value";

  if (widget.type === "pie" || widget.type === "donut") {
    const pieData = chartData;
    const legendFormatter = (value: string | number) => {
      if (!cfg.legendLabel) {
        return String(value);
      }
      return `${cfg.legendLabel}: ${String(value)}`;
    };
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
            innerRadius={widget.type === "donut" ? "40%" : 0} outerRadius="70%">
            {pieData.map((_entry, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
          </Pie>
          <Tooltip labelFormatter={formatChartAxisLabel} />
          {showLegend && <Legend formatter={legendFormatter} />}
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (widget.type === "line") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef3f0" />
          <XAxis dataKey={xKey} tick={{ fontSize: 11 }} tickFormatter={formatChartAxisLabel} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip labelFormatter={formatChartAxisLabel} />
          {showLegend && <Legend />}
          <Line
            type="monotone"
            dataKey={yKey}
            name={cfg.legendLabel || cfg.yField || "Value"}
            stroke={palette[0]}
            dot={false}
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (widget.type === "area") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef3f0" />
          <XAxis dataKey={xKey} tick={{ fontSize: 11 }} tickFormatter={formatChartAxisLabel} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip labelFormatter={formatChartAxisLabel} />
          {showLegend && <Legend />}
          <Area
            type="monotone"
            dataKey={yKey}
            name={cfg.legendLabel || cfg.yField || "Value"}
            stroke={palette[0]}
            fill={`${palette[0]}33`}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  // default: bar
  const barFields = (cfg.yFields?.length ? cfg.yFields : cfg.yField ? [cfg.yField] : []).filter(Boolean);
  if (!cfg.xField || barFields.length === 0) {
    return (
      <div className="canvasEmptyBody">
        <MiniChartSvg type={widget.type} color={palette[0]} />
        <p>Configure X &amp; Y values to compare</p>
      </div>
    );
  }

  const aggregateMode = cfg.aggregate ?? "sum";
  const grouped = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const rawKey = row[cfg.xField];
    const key = typeof rawKey === "string" && rawKey.trim().length > 0 ? rawKey : String(rawKey ?? "Unspecified");
    const existing = grouped.get(key) ?? { name: key };
    for (const field of barFields) {
      const bucketKey = `__${field}`;
      const values = (existing[bucketKey] as number[] | undefined) ?? [];
      const numericValue = toNumber(row[field]);
      if (numericValue !== null) {
        values.push(numericValue);
      }
      existing[bucketKey] = values;
    }
    grouped.set(key, existing);
  }

  const multiSeriesData = Array.from(grouped.values())
    .map((item) => {
      const next: Record<string, unknown> = { name: item.name };
      for (const field of barFields) {
        const values = (item[`__${field}`] as number[] | undefined) ?? [];
        next[field] = aggregateNumbers(values, aggregateMode);
      }
      return next;
    })
    .slice(0, cfg.limit ?? 100);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={multiSeriesData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef3f0" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} tickFormatter={formatChartAxisLabel} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip labelFormatter={formatChartAxisLabel} />
        {showLegend && <Legend />}
        {barFields.map((field, seriesIndex) => (
          <Bar
            key={field}
            dataKey={field}
            name={widget.config.legendLabels?.[seriesIndex]?.trim() || field}
            fill={palette[seriesIndex % palette.length]}
            radius={[3, 3, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/* â”€â”€â”€ Widget config panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function WidgetConfigPanel({
  widget,
  columns,
  previewRows,
  datasources,
  defaultDatasourceId,
  definition,
  onChange,
  onDelete,
}: {
  widget: DashboardWidget;
  columns: { name: string; dataType: string }[];
  previewRows: DashboardRecord[];
  datasources: Datasource[];
  defaultDatasourceId?: number;
  definition: DashboardDefinition;
  onChange: (w: DashboardWidget) => void;
  onDelete: () => void;
}) {
  const catalog = widgetCatalog.find((c) => c.type === widget.type);
  const color = catalog?.accent ?? "#2fb37b";

  function updateConfig(patch: Partial<DashboardWidget["config"]>) {
    onChange({ ...widget, config: { ...widget.config, ...patch } });
  }

  const isNumericValue = (value: unknown) => {
    if (typeof value === "number") {
      return Number.isFinite(value);
    }
    if (typeof value === "string") {
      const normalized = value.trim();
      if (!normalized) {
        return false;
      }
      const parsed = Number(normalized);
      return Number.isFinite(parsed);
    }
    return false;
  };

  const previewKeys = Array.from(new Set(previewRows.flatMap((row) => Object.keys(row))));
  const allCols = Array.from(new Set([...columns.map((c) => c.name), ...previewKeys]));
  const numericColsFromTypes = columns.filter((c) => isNumericDataType(c.dataType)).map((c) => c.name);
  const numericColsFromRows = allCols.filter((name) =>
    previewRows.some((row) => isNumericValue(row[name]))
  );
  const numericCols = Array.from(new Set([...numericColsFromTypes, ...numericColsFromRows]));
  const allowedX = allCols;
  const allowedY = numericCols;

  const isBar = widget.type === "bar";
  const isLineOrArea = widget.type === "line" || widget.type === "area";
  const isPieLike = widget.type === "pie" || widget.type === "donut";
  const isMetric = widget.type === "kpi" || widget.type === "tile";
  const isTable = widget.type === "table";
  const hasAxes = isBar || isLineOrArea || isPieLike;
  const metricAggregate = widget.config.aggregate ?? "sum";
  const metricValueOptions = metricAggregate === "count" ? allCols : numericCols;

  const palette = getWidgetPalette(widget, definition);
  const selectedDatasourceId = widget.config.datasourceId ?? defaultDatasourceId;

  return (
    <div className="widgetConfigPanel">
      <div className="widgetConfigHeader">
        <div className="widgetConfigHeaderLeft">
          <MiniChartSvg type={widget.type} color={color} />
          <strong>{widget.title || widget.type}</strong>
          <span className="widgetTypePill">{widget.type}</span>
        </div>
        <button className="widgetDeleteIconBtn large" onClick={onDelete} title="Delete widget">x</button>
      </div>

      <div className="widgetConfigBody">
        {/* Identity */}
        <div className="configSection">
          <div className="configSectionTitle">Identity</div>
          <label className="configLabel">
            Title
            <input className="configInput" value={widget.title ?? ""} placeholder="Widget title"
              onChange={(e) => onChange({ ...widget, title: e.target.value })} />
          </label>
          <label className="configLabel">
            Subtitle
            <input className="configInput" value={widget.subtitle ?? ""} placeholder="Optional subtitle"
              onChange={(e) => onChange({ ...widget, subtitle: e.target.value })} />
          </label>

          <label className="configLabel">
            Datasource
            <select
              className="configSelect"
              value={selectedDatasourceId ? String(selectedDatasourceId) : ""}
              onChange={(e) => {
                const nextId = e.target.value ? Number(e.target.value) : undefined;
                updateConfig({
                  datasourceId: nextId,
                  xField: undefined,
                  yField: undefined,
                  yFields: undefined,
                  labelField: undefined,
                  valueField: undefined,
                });
              }}
            >
              <option value="">- select datasource -</option>
              {datasources.map((d) => (
                <option key={d.id} value={String(d.id)}>{d.name}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Axis & Data */}
        {hasAxes && (
          <div className="configSection">
            <div className="configSectionTitle">Axis &amp; Data</div>
            {isBar && (
              <>
                <label className="configLabel">
                  X Axis (Category)
                  <select className="configSelect" value={widget.config.xField ?? ""}
                    onChange={(e) => updateConfig({ xField: e.target.value || undefined })}>
                    <option value="">- none -</option>
                    {allowedX.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="configLabel">
                  Y Values (Multiple)
                  <select
                    className="configSelect"
                    multiple
                    value={widget.config.yFields?.length ? widget.config.yFields : widget.config.yField ? [widget.config.yField] : []}
                    onChange={(e) => {
                      const selected = Array.from(e.currentTarget.selectedOptions).map((opt) => opt.value);
                      updateConfig({
                        yFields: selected.length ? selected : undefined,
                        yField: selected[0] ?? undefined,
                      });
                    }}
                  >
                    {allowedY.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              </>
            )}

            {isLineOrArea && (
              <div className="configRow2">
                <label className="configLabel">
                  X Axis (Category)
                  <select className="configSelect" value={widget.config.xField ?? ""}
                    onChange={(e) => updateConfig({ xField: e.target.value || undefined })}>
                    <option value="">- none -</option>
                    {allowedX.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="configLabel">
                  Y Axis (Value)
                  <select className="configSelect" value={widget.config.yField ?? ""}
                    onChange={(e) => updateConfig({ yField: e.target.value || undefined, yFields: undefined })}>
                    <option value="">- none -</option>
                    {allowedY.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              </div>
            )}

            {isPieLike && (
              <div className="configRow2">
                <label className="configLabel">
                  Category Field
                  <select className="configSelect" value={widget.config.xField ?? ""}
                    onChange={(e) => updateConfig({ xField: e.target.value || undefined })}>
                    <option value="">- none -</option>
                    {allowedX.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="configLabel">
                  Value Field
                  <select className="configSelect" value={widget.config.yField ?? ""}
                    onChange={(e) => updateConfig({ yField: e.target.value || undefined, yFields: undefined })}>
                    <option value="">- none -</option>
                    {allowedY.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              </div>
            )}

            <div className="configRow2">
              <label className="configLabel">
                Aggregate
                <select className="configSelect" value={widget.config.aggregate ?? "sum"}
                  onChange={(e) => updateConfig({ aggregate: e.target.value as DashboardAggregate })}>
                  {aggregateOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="configLabel">
                Row Limit
                <input className="configInput" type="number" min={1} max={500}
                  value={widget.config.limit ?? 100}
                  onChange={(e) => updateConfig({ limit: Number(e.target.value) })} />
              </label>
            </div>
            <label className="configLabel">
              Group / Label Field
              <select className="configSelect" value={widget.config.labelField ?? ""}
                onChange={(e) => updateConfig({ labelField: e.target.value || undefined })}>
                <option value="">- none -</option>
                {allCols.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="configLabel" style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
              <input type="checkbox" checked={widget.config.showLegend !== false}
                onChange={(e) => updateConfig({ showLegend: e.target.checked })} />
              Show legend
            </label>

            {isBar && (
              <label className="configLabel">
                Legend Labels (comma-separated)
                <input
                  className="configInput"
                  value={widget.config.legendLabels?.join(", ") ?? ""}
                  placeholder="Sales, Expenses"
                  onChange={(e) => {
                    const labels = e.target.value
                      .split(",")
                      .map((item) => item.trim())
                      .filter((item) => item.length > 0);
                    updateConfig({ legendLabels: labels.length ? labels : undefined });
                  }}
                />
              </label>
            )}

            {(isLineOrArea || isPieLike) && (
              <label className="configLabel">
                Legend Text
                <input
                  className="configInput"
                  value={widget.config.legendLabel ?? ""}
                  placeholder={isPieLike ? "Status" : "Revenue"}
                  onChange={(e) => updateConfig({ legendLabel: e.target.value || undefined })}
                />
              </label>
            )}
          </div>
        )}

        {/* Metric (KPI / Tile) */}
        {isMetric && (
          <div className="configSection">
            <div className="configSectionTitle">Metric</div>
            <label className="configLabel">
              Value Field
              <select className="configSelect" value={widget.config.yField ?? ""}
                onChange={(e) => {
                  const selectedField = e.target.value || undefined;
                  updateConfig({ yField: selectedField, valueField: selectedField });
                }}>
                <option value="">- none -</option>
                {metricValueOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <div className="configRow2">
              <label className="configLabel">
                Aggregate
                <select className="configSelect" value={metricAggregate}
                  onChange={(e) => {
                    const aggregate = e.target.value as DashboardAggregate;
                    const selectedField = widget.config.yField ?? widget.config.valueField;
                    const fieldIsNumeric = selectedField ? numericCols.includes(selectedField) : false;
                    const nextField = aggregate === "count"
                      ? selectedField
                      : fieldIsNumeric
                        ? selectedField
                        : (numericCols[0] ?? undefined);
                    updateConfig({ aggregate, metric: aggregate, yField: nextField, valueField: nextField });
                  }}>
                  {aggregateOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="configLabel">
                Format
                <select className="configSelect" value={widget.config.format ?? "number"}
                  onChange={(e) => updateConfig({ format: e.target.value as DashboardMetricFormat })}>
                  {formatOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            </div>
            {(widget.config.format ?? "number") === "currency" && (
              <label className="configLabel">
                Currency Symbol
                <input
                  className="configInput"
                  value={widget.config.currencySymbol ?? "$"}
                  placeholder="$"
                  maxLength={4}
                  onChange={(e) => updateConfig({ currencySymbol: e.target.value || "$" })}
                />
              </label>
            )}
          </div>
        )}

        {/* Table */}
        {isTable && (
          <div className="configSection">
            <div className="configSectionTitle">Table Settings</div>
            <label className="configLabel">
              Columns (comma-separated, blank = all)
              <input className="configInput"
                value={widget.config.labelField ?? ""}
                placeholder="label column name"
                onChange={(e) => updateConfig({ labelField: e.target.value || undefined })} />
            </label>
            <label className="configLabel">
              Row Limit
              <input className="configInput" type="number" min={1} max={500}
                value={widget.config.limit ?? 100}
                onChange={(e) => updateConfig({ limit: Number(e.target.value) })} />
            </label>
          </div>
        )}

        {/* Style */}
        <div className="configSection">
          <div className="configSectionTitle">Style</div>
          <label className="configLabel">Accent Color</label>
          <div className="configColorRow">
            <input type="color" className="configColorInput"
              value={widget.config.accent ?? palette[0]}
              onChange={(e) => updateConfig({ accent: e.target.value })} />
            <span className="configColorHex">{widget.config.accent ?? palette[0]}</span>
          </div>
          <label className="configLabel" style={{ marginTop: "0.4rem" }}>Color Palette</label>
          <div className="configPaletteList">
            {palettePresets.map((p) => (
              <button
                key={p.id}
                type="button"
                className="configPaletteBtn"
                onClick={() =>
                  onChange({
                    ...widget,
                    config: { ...widget.config, accent: p.colors[0], paletteId: p.id },
                  })
                }
              >
                {p.colors.slice(0, 5).map((c, i) => <span key={i} style={{ background: c }} />)}
                <small style={{ fontSize: "0.75rem", color: "#5a7a6a", marginLeft: "0.3rem" }}>{p.name}</small>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* â”€â”€â”€ Main builder content â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function DashboardBuilderContent() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get("id");

  const [datasources, setDatasources] = useState<Datasource[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [datasourceId, setDatasourceId] = useState("");
  const [definition, setDefinition] = useState<DashboardDefinition>(emptyDashboardDefinition);
  const [previewCache, setPreviewCache] = useState<Record<number, BuilderPreviewResult>>({});
  const [leftTab, setLeftTab] = useState<"catalog" | "config">("catalog");
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [draggingType, setDraggingType] = useState<DashboardWidgetType | null>(null);
  const draggingTypeRef = useRef<DashboardWidgetType | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [canvasWidth, setCanvasWidth] = useState(800);
  const [leftPanelPercent, setLeftPanelPercent] = useState(30);
  const [resizingPanels, setResizingPanels] = useState(false);
  const pageLayoutRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!resizingPanels) {
      return;
    }

    const onMouseMove = (event: MouseEvent) => {
      const rect = pageLayoutRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) {
        return;
      }
      const ratio = ((event.clientX - rect.left) / rect.width) * 100;
      const next = Math.max(20, Math.min(55, ratio));
      setLeftPanelPercent(next);
    };

    const onMouseUp = () => {
      setResizingPanels(false);
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [resizingPanels]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setCanvasWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"" | "saved" | "error">("");
  const [error, setError] = useState("");

  /* Load datasources */
  useEffect(() => {
    api
      .get<{ data: { items?: Datasource[] } }>("/datasources/allowed?pageNumber=1&pageSize=200")
      .then((res) => {
        setDatasources(res.data?.data?.items ?? []);
      })
      .catch(() => {
        setDatasources([]);
      });
  }, []);

  /* Load existing dashboard */
  useEffect(() => {
    if (!editId) return;
    api.get<{ data: { name: string; code: string; description: string; datasourceId: string; definition: unknown } }>(
      `/dashboards/${editId}`
    ).then((res) => {
      const d = res.data.data;
      setName(d.name ?? "");
      setCode(d.code ?? "");
      setDescription(d.description ?? "");
      setDatasourceId(String(d.datasourceId ?? ""));
      setDefinition(normalizeDashboardDefinition(d.definition));
    }).catch(() => {});
  }, [editId]);

  const previewCacheRef = useRef<Record<number, BuilderPreviewResult>>({});
  useEffect(() => { previewCacheRef.current = previewCache; }, [previewCache]);

  const ensurePreviewForDatasource = useCallback(async (id?: number) => {
    if (!id || previewCacheRef.current[id]) return;

    setPreviewLoading(true);
    try {
      const ds = datasources.find((d) => d.id === id);
      const res = await api.post<{ data: { columns: string[]; rows: DashboardRecord[]; totalCount: number } }>(
        "/datasources/run",
        { datasourceId: id, parameters: {}, pageNumber: 1, pageSize: 300 }
      );
      const allowedCols = ds?.allowedColumns ?? [];
      const columns = (res.data?.data?.columns ?? []).map((colName) => {
        const found = allowedCols.find((ac) => ac.columnName === colName);
        return { name: colName, dataType: found?.dataType ?? "nvarchar" };
      });
      setPreviewCache((prev) => ({
        ...prev,
        [id]: { rows: res.data?.data?.rows ?? [], columns },
      }));
    } catch {
      // fail silently – user sees empty chart with prompt
    } finally {
      setPreviewLoading(false);
    }
  }, [datasources]);

  useEffect(() => {
    const ids = new Set<number>();
    if (datasourceId) {
      ids.add(Number(datasourceId));
    }
    definition.widgets.forEach((widget) => {
      const id = widget.config.datasourceId ?? (datasourceId ? Number(datasourceId) : undefined);
      if (id) {
        ids.add(id);
      }
    });

    ids.forEach((id) => {
      void ensurePreviewForDatasource(id);
    });
  }, [definition.widgets, datasourceId, ensurePreviewForDatasource]);

  /* RGL layout derived from widgets */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rglLayout = useMemo<any[]>(() => {
    return definition.widgets.map((w) => {
      const isMetricWidget = w.type === "kpi" || w.type === "tile";

      return {
        i: w.id,
        x: w.layout.gx ?? 0,
        y: w.layout.gy ?? 0,
        w: w.layout.gw ?? 6,
        h: w.layout.gh ?? 4,
        minW: isMetricWidget ? 1 : 2,
        minH: isMetricWidget ? 1 : 2,
      };
    });
  }, [definition.widgets]);

  /* Handle external drop from catalog onto canvas */
  const onCanvasExternalDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const eventType = event.dataTransfer.getData("application/x-widget-type");
      const widgetType = (eventType as DashboardWidgetType) || draggingTypeRef.current || draggingType;
      if (!widgetType || !canvasRef.current) {
        return;
      }

      const defaultDatasource = datasourceId
        ? datasources.find((d) => d.id === Number(datasourceId))
        : datasources[0];
      const allowedColumns: DatasourceColumn[] = (defaultDatasource?.allowedColumns ?? []).filter((c) => c.isAllowed);
      const widget = createDashboardWidget(widgetType, definition.widgets.length, allowedColumns);
      if (defaultDatasource) {
        widget.config.datasourceId = defaultDatasource.id;
      }
      const rect = canvasRef.current.getBoundingClientRect();
      const contentWidth = Math.max(1, canvasWidth - GRID_PADDING * 2);
      const colWidth = contentWidth / GRID_COLS;
      const relativeX = Math.max(0, event.clientX - rect.left - GRID_PADDING);
      const relativeY = Math.max(0, event.clientY - rect.top - GRID_PADDING + canvasRef.current.scrollTop);

      const gx = Math.max(0, Math.min(GRID_COLS - widget.layout.gw, Math.floor(relativeX / colWidth)));
      const gy = Math.max(0, Math.floor(relativeY / (GRID_ROW_HEIGHT + GRID_MARGIN)));

      widget.layout.gx = gx;
      widget.layout.gy = gy;

      setDefinition((prev) => ({ ...prev, widgets: [...prev.widgets, widget] }));
      setSelectedWidgetId(widget.id);
      setLeftTab("config");
      draggingTypeRef.current = null;
      setDraggingType(null);
    },
    [canvasWidth, datasourceId, datasources, definition.widgets.length, draggingType]
  );

  /* Sync RGL layout back to widgets */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onLayoutChange = useCallback((layout: any[]) => {
    setDefinition((prev) => {
      const updated = prev.widgets.map((w) => {
        const l = layout.find((ll: LayoutItem) => ll.i === w.id);
        if (!l) return w;
        const isMetricWidget = w.type === "kpi" || w.type === "tile";
        return {
          ...w,
          layout: {
            ...w.layout,
            gx: l.x,
            gy: l.y,
            gw: l.w,
            gh: l.h,
            // Keep legacy layout fields in sync so output view restores exact size/position
            columnStart: l.x + 1,
            columnSpan: l.w,
            rowSpan: Math.max(1, Math.round(l.h / 2)),
            minHeight: Math.max(
              isMetricWidget ? 120 : 180,
              l.h * GRID_ROW_HEIGHT + Math.max(0, l.h - 1) * GRID_MARGIN
            ),
          },
        };
      });
      return { ...prev, widgets: updated };
    });
  }, []);

  const deleteWidget = useCallback((id: string) => {
    setDefinition((prev) => ({ ...prev, widgets: prev.widgets.filter((w) => w.id !== id) }));
    setSelectedWidgetId((sel) => (sel === id ? null : sel));
    setLeftTab("catalog");
  }, []);

  const updateWidget = useCallback((updated: DashboardWidget) => {
    setDefinition((prev) => ({
      ...prev,
      widgets: prev.widgets.map((w) => (w.id === updated.id ? updated : w)),
    }));
  }, []);

  const selectedWidget = definition.widgets.find((w) => w.id === selectedWidgetId) ?? null;

  const selectedWidgetDatasourceId = selectedWidget?.config.datasourceId ?? (datasourceId ? Number(datasourceId) : undefined);
  const selectedDatasource = selectedWidgetDatasourceId ? datasources.find((d) => d.id === selectedWidgetDatasourceId) : undefined;
  const selectedAllowedColumns = (selectedDatasource?.allowedColumns ?? [])
    .filter((c) => c.isAllowed)
    .map((c) => ({ name: c.columnName, dataType: c.dataType }));
  const selectedPreviewColumns = selectedWidgetDatasourceId ? (previewCache[selectedWidgetDatasourceId]?.columns ?? []) : [];
  const selectedPreviewRows = selectedWidgetDatasourceId ? (previewCache[selectedWidgetDatasourceId]?.rows ?? []) : [];
  const selectedColumns = selectedAllowedColumns.length > 0 ? selectedAllowedColumns : selectedPreviewColumns;

  const handleWidgetClick = (id: string) => {
    setSelectedWidgetId(id);
    setLeftTab("config");
  };

  /* Save */
  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatus("");
    setError("");

    const primaryDatasourceId = (datasourceId ? Number(datasourceId) : undefined)
      ?? definition.widgets.find((w) => w.config.datasourceId)?.config.datasourceId;

    if (!primaryDatasourceId) {
      setError("At least one widget datasource is required before saving.");
      setStatus("error");
      setSaving(false);
      return;
    }

    const definitionToSave: DashboardDefinition = {
      ...definition,
      widgets: definition.widgets.map((w) => ({
        ...w,
        config: {
          ...w.config,
          datasourceId: w.config.datasourceId ?? primaryDatasourceId,
        },
      })),
    };

    try {
      const payload = {
        name,
        code,
        description,
        datasourceId: primaryDatasourceId,
        definition: definitionToSave,
      };
      let savedId = Number(editId ?? 0);
      if (editId) {
        await api.put(`/dashboards/${editId}`, payload);
      } else {
        const createRes = await api.post<{ data?: { id?: number } }>("/dashboards", payload);
        savedId = Number(createRes.data?.data?.id ?? 0);
      }

      if (savedId > 0) {
        router.push(`/dashboards/${savedId}`);
        return;
      }

      setStatus("saved");
    } catch (err) {
      setError(getErrorMessage(err));
      setStatus("error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="builderPageLayout"
      ref={pageLayoutRef}
      style={{ "--builder-left-width": `${leftPanelPercent}%` } as React.CSSProperties}
    >
      {/* â•â•â• LEFT PANEL 40% â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <div className="builderPanelLeft">
        {/* Meta form */}
        <div className="builderMetaSection">
          <div className="builderMetaHeading">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <path d="M9 9h6M9 12h6M9 15h4" />
            </svg>
            Dashboard Settings
          </div>
          <form className="builderMetaForm" onSubmit={handleSave}>
            <div className="builderMetaRow">
              <label className="builderMetaLabel">
                Name *
                <input className="builderMetaInput" value={name} placeholder="Dashboard name"
                  onChange={(e) => setName(e.target.value)} required />
              </label>
              <label className="builderMetaLabel">
                Code
                <input className="builderMetaInput" value={code} placeholder="e.g. SALES-Q1"
                  onChange={(e) => setCode(e.target.value)} />
              </label>
            </div>
            <label className="builderMetaLabel">
              Description
              <textarea className="builderMetaTextarea" rows={2} value={description}
                placeholder="Optional description"
                onChange={(e) => setDescription(e.target.value)} />
            </label>
            {status === "saved" && <InlineSnackbar type="success" message="Dashboard saved!" onClose={() => setStatus("")} />}
            {status === "error" && <InlineSnackbar type="error" message={error} onClose={() => setStatus("")} />}
            <div className="builderMetaBtns">
              <button type="button" className="builderBackBtn"
                onClick={() => router.push("/dashboards")}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: "0.35rem" }}>
                  <path d="M15 18l-6-6 6-6" />
                </svg>
                Back
              </button>
              <button type="submit" className="builderSaveBtn" disabled={saving || !name}>
                {saving ? "Saving..." : editId ? "Update Dashboard" : "Save Dashboard"}
              </button>
            </div>
          </form>
        </div>

        {/* Tabs */}
        <div className="builderTabBar">
          <button
            className={clsx("builderTab", leftTab === "catalog" && "builderTabActive")}
            onClick={() => setLeftTab("catalog")}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
            Chart Catalog
          </button>
          <button
            className={clsx("builderTab", leftTab === "config" && "builderTabActive")}
            onClick={() => setLeftTab("config")}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="3" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" /></svg>
            Widget Config
            {selectedWidget && <span className="widgetTypePill">{selectedWidget.type}</span>}
          </button>
        </div>

        {/* Tab content */}
        <div className="builderTabContent">
          {leftTab === "catalog" && (
            <div className="builderCatalogWrap">
              <p className="builderCatalogHint">
                {"Drag a chart onto the canvas ->"}
              </p>

              {/* Field guide */}
              {selectedColumns.length > 0 && (
                <div className="builderFieldGuide">
                  <div className="builderFieldGroup">
                    <div className="builderFieldGroupLabel">Numeric columns</div>
                    <div className="builderFieldChips">
                      {selectedColumns.filter((c) => isNumericDataType(c.dataType)).map((c) => (
                        <span key={c.name} style={{ padding: "0.2rem 0.45rem", borderRadius: "999px", fontSize: "0.73rem", background: "#e8f7ef", border: "1px solid #b8dfcc", color: "#1f7a4a", fontWeight: 600 }}>
                          {c.name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="builderFieldGroup">
                    <div className="builderFieldGroupLabel">Category columns</div>
                    <div className="builderFieldChips">
                      {selectedColumns.filter((c) => !isNumericDataType(c.dataType)).map((c) => (
                        <span key={c.name} style={{ padding: "0.2rem 0.45rem", borderRadius: "999px", fontSize: "0.73rem", background: "#f0f4ff", border: "1px solid #c5d0f0", color: "#3a5aa8", fontWeight: 600 }}>
                          {c.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Chart grid */}
              <div className="builderCatalogGrid">
                {widgetCatalog.map((item) => (
                  <div
                    key={item.type}
                    className={clsx("builderCatalogItem", draggingType === item.type && "dragging")}
                    style={{ "--catalog-color": item.accent } as React.CSSProperties}
                    draggable
                    onDragStart={(event) => {
                      const type = item.type as DashboardWidgetType;
                      draggingTypeRef.current = type;
                      setDraggingType(type);
                      event.dataTransfer.effectAllowed = "copyMove";
                      event.dataTransfer.setData("application/x-widget-type", type);
                      event.dataTransfer.setData("text/plain", type);
                    }}
                    onDragEnd={() => {
                      window.setTimeout(() => {
                        draggingTypeRef.current = null;
                        setDraggingType(null);
                      }, 0);
                    }}>
                    <div className="builderCatalogPreview">
                      <MiniChartSvg type={item.type as DashboardWidgetType} color={item.accent} />
                    </div>
                    <div className="builderCatalogInfo">
                      <strong>{item.label}</strong>
                      <p>{item.description}</p>
                    </div>
                    <div className="builderCatalogDragHint">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 9l7-7 7 7M5 15l7 7 7-7" /></svg>
                      Drag to canvas
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {leftTab === "config" && (
            selectedWidget ? (
              <WidgetConfigPanel
                key={selectedWidget.id}
                widget={selectedWidget}
                columns={selectedColumns}
                previewRows={selectedPreviewRows}
                datasources={datasources}
                defaultDatasourceId={datasourceId ? Number(datasourceId) : undefined}
                definition={definition}
                onChange={updateWidget}
                onDelete={() => deleteWidget(selectedWidget.id)}
              />
            ) : (
              <div className="builderNoSelection">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.35 }}>
                  <rect x="3" y="3" width="18" height="18" rx="3" /><path d="M9 9h6M9 12h6M9 15h4" />
                </svg>
                <p>Click a widget on the canvas to configure it, or drag a chart from the Catalog tab.</p>
              </div>
            )
          )}
        </div>
      </div>

      <div
        className={clsx("builderPanelResizer", resizingPanels && "active")}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize builder panels"
        onMouseDown={(event) => {
          event.preventDefault();
          setResizingPanels(true);
        }}
      />

      {/* â•â•â• RIGHT PANEL 60% â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <div className="builderPanelRight">
        {/* Canvas toolbar */}
        <div className="builderCanvasToolbar">
          <div className="builderCanvasToolbarLeft">
            <span className="builderCanvasName">{name || "Untitled Dashboard"}</span>
            <span className="builderWidgetCount">
              {definition.widgets.length} widget{definition.widgets.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="builderCanvasToolbarRight">
            {previewLoading && (
              <span style={{ fontSize: "0.78rem", color: "#8aaa98" }}>Loading data...</span>
            )}
            <button type="button" className="builderToolbarBtn"
              onClick={() => {
                if (definition.widgets.length && window.confirm("Clear all widgets?")) {
                  setDefinition((prev) => ({ ...prev, widgets: [] }));
                  setSelectedWidgetId(null);
                }
              }}
              disabled={!definition.widgets.length}>
              Clear Canvas
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="builderCanvasArea" ref={canvasRef}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onCanvasExternalDrop}>
          {definition.widgets.length === 0 && (
            <div className="builderCanvasDropZone">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" style={{ opacity: 0.4 }}>
                <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
              <h3>Drop Charts Here</h3>
              <p>Drag a chart type from the catalog on the left and drop it here to add it to your dashboard.</p>
            </div>
          )}
          <div className="builderRglCanvas">
            <RGL
              layout={rglLayout}
              width={canvasWidth - 24}
              cols={GRID_COLS}
              rowHeight={GRID_ROW_HEIGHT}
              isDraggable={true}
              isResizable={true}
              resizeHandles={["se", "e", "s"]}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              draggableHandle=".widgetDragHandle"
              draggableCancel=".widgetDeleteIconBtn"
              compactType={null}
              preventCollision={false}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onLayoutChange={onLayoutChange as any}
              margin={[GRID_MARGIN, GRID_MARGIN]}
              containerPadding={[GRID_PADDING, GRID_PADDING]}>
              {definition.widgets.map((widget) => {
                const palette = getWidgetPalette(widget, definition);
                const color = palette[0] ?? "#2fb37b";
                const isSelected = widget.id === selectedWidgetId;
                const widgetDatasourceId = widget.config.datasourceId ?? (datasourceId ? Number(datasourceId) : undefined);
                const widgetPreviewRows = widgetDatasourceId ? (previewCache[widgetDatasourceId]?.rows ?? []) : [];
                return (
                  <div
                    key={widget.id}
                    className={clsx("canvasWidget", isSelected && "canvasWidgetSelected")}
                    style={{ "--widget-color": color } as React.CSSProperties}
                    onClick={() => handleWidgetClick(widget.id)}>
                    <div className="widgetDragHandle">
                      <div className="widgetDragLeft">
                        <svg className="widgetGripIcon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="8" cy="6" r="1.5" /><circle cx="16" cy="6" r="1.5" />
                          <circle cx="8" cy="12" r="1.5" /><circle cx="16" cy="12" r="1.5" />
                          <circle cx="8" cy="18" r="1.5" /><circle cx="16" cy="18" r="1.5" />
                        </svg>
                        <span className="widgetDragTitle">
                          {widget.title || widget.type}
                        </span>
                      </div>
                      <div className="widgetDragRight">
                        <MiniChartSvg type={widget.type} color={color} />
                        <button
                          className="widgetDeleteIconBtn"
                          onClick={(e) => { e.stopPropagation(); deleteWidget(widget.id); }}
                          title="Delete widget">
                          x
                        </button>
                      </div>
                    </div>
                    <div className="canvasWidgetBody">
                      {widgetPreviewRows.length > 0 ? (
                        <CanvasChartBody
                          widget={widget}
                          rows={widgetPreviewRows}
                          definition={definition}
                        />
                      ) : (
                        <div className="canvasEmptyBody">
                          <MiniChartSvg type={widget.type} color={color} />
                          <p>{widgetDatasourceId ? "Loading preview data..." : "Select datasource, X and Y to preview"}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </RGL>
          </div>
        </div>
      </div>
    </div>
  );
}

/* â”€â”€â”€ RGL layout item type â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
type LayoutItem = {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
};

/* â”€â”€â”€ Page export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
export default function DashboardBuilderPage() {
  return (
    <Suspense fallback={<div className="builderLoadingState">Loading builder...</div>}>
      <DashboardBuilderContent />
    </Suspense>
  );
}
