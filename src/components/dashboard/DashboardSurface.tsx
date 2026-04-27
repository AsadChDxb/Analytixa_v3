"use client";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import ReactGridLayout from "react-grid-layout";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  buildGroupedChartData,
  buildMetricValue,
  DashboardDefinition,
  DashboardRecord,
  DashboardWidget,
  formatChartAxisLabel,
  formatMetricValue,
  getTableColumns,
  getWidgetPalette,
} from "@/lib/dashboardBuilder";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RGL = ReactGridLayout as any;

type DashboardSurfaceProps = {
  dashboardName: string;
  dashboardDescription: string;
  definition: DashboardDefinition;
  rowsByDatasource: Record<number, DashboardRecord[]>;
  defaultDatasourceId?: number;
  emptyMessage?: string;
  showHeader?: boolean;
};

function DashboardWidgetCard({ widget, definition, rows, emptyMessage }: { widget: DashboardWidget; definition: DashboardDefinition; rows: DashboardRecord[]; emptyMessage: string }) {
  const palette = useMemo(() => getWidgetPalette(widget, definition), [definition, widget]);
  const chartData = useMemo(() => buildGroupedChartData(rows, widget), [rows, widget]);
  const metricValue = useMemo(() => buildMetricValue(rows, widget), [rows, widget]);
  const tableColumns = useMemo(() => getTableColumns(rows, widget), [rows, widget]);
  const accentColor = palette[0] ?? "#2fb37b";

  const style = {
    height: "100%",
    "--widget-color": accentColor,
  } as React.CSSProperties;

  const toNumber = (value: unknown): number | null => {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "string") {
      const parsed = Number(value.trim());
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  const aggregateNumbers = (values: number[], mode: DashboardWidget["config"]["aggregate"] = "sum") => {
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
  };

  const chartBody = () => {
    if (widget.type === "table") {
      if (rows.length === 0 || tableColumns.length === 0) {
        return <div className="dashboardEmptyState"><p>{emptyMessage}</p></div>;
      }

      return (
        <div className="dashboardTableMini">
          <table className="table">
            <thead>
              <tr>
                {tableColumns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, Math.max(4, widget.config.limit ?? 8)).map((row, index) => (
                <tr key={`${widget.id}_${index}`}>
                  {tableColumns.map((column) => (
                    <td key={`${widget.id}_${index}_${column}`}>{String(row[column] ?? "-")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (widget.type === "kpi" || widget.type === "tile") {
      return (
        <div className={widget.type === "tile" ? "dashboardMetricTile" : "dashboardMetricBlock"}>
          <strong>{formatMetricValue(metricValue, widget.config.format, widget.config.currencySymbol)}</strong>
        </div>
      );
    }

    if (chartData.length === 0) {
      return <div className="dashboardEmptyState"><p>{emptyMessage}</p></div>;
    }

    const showLegend = widget.config.showLegend !== false;

    if (widget.type === "bar") {
      const barFields = (widget.config.yFields?.length ? widget.config.yFields : widget.config.yField ? [widget.config.yField] : []).filter(Boolean);
      if (!widget.config.xField || barFields.length === 0) {
        return <div className="dashboardEmptyState"><p>{emptyMessage}</p></div>;
      }

      const aggregateMode = widget.config.aggregate ?? "sum";
      const grouped = new Map<string, Record<string, unknown>>();
      for (const row of rows) {
        const rawKey = row[widget.config.xField];
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
        .slice(0, widget.config.limit ?? 100);

      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={multiSeriesData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef3f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} tickFormatter={formatChartAxisLabel} />
            <YAxis tick={{ fontSize: 11 }} width={72} />
            <Tooltip labelFormatter={formatChartAxisLabel} />
            {showLegend ? <Legend /> : null}
            {barFields.map((field, index) => (
              <Bar
                key={field}
                dataKey={field}
                name={widget.config.legendLabels?.[index]?.trim() || field}
                fill={palette[index % palette.length]}
                radius={[12, 12, 4, 4]}
                animationDuration={900}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (widget.type === "line") {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef3f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} tickFormatter={formatChartAxisLabel} />
            <YAxis tick={{ fontSize: 11 }} width={72} />
            <Tooltip labelFormatter={formatChartAxisLabel} />
            {showLegend ? <Legend /> : null}
            <Line
              type="monotone"
              dataKey="value"
              name={widget.config.legendLabel || widget.config.yField || "Value"}
              stroke={palette[0]}
              dot={false}
              strokeWidth={2}
              animationDuration={900}
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
            <XAxis dataKey="name" tick={{ fontSize: 11 }} tickFormatter={formatChartAxisLabel} />
            <YAxis tick={{ fontSize: 11 }} width={72} />
            <Tooltip labelFormatter={formatChartAxisLabel} />
            {showLegend ? <Legend /> : null}
            <Area
              type="monotone"
              dataKey="value"
              name={widget.config.legendLabel || widget.config.yField || "Value"}
              stroke={palette[0]}
              fill={`${palette[0]}33`}
              strokeWidth={2}
              animationDuration={900}
            />
          </AreaChart>
        </ResponsiveContainer>
      );
    }

    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip />
          {showLegend ? <Legend /> : null}
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={widget.type === "donut" ? "40%" : 0}
            outerRadius="70%"
            animationDuration={900}
          >
            {chartData.map((entry, index) => (
              <Cell key={`${entry.name}_${index}`} fill={palette[index % palette.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    );
  };

  return (
    <article className={`dashboardWidgetCard dashboardWidget-${widget.type}`} style={style}>
      <div className="dashboardWidgetHeader">
        <div>
          <h3>{widget.title}</h3>
          <p>{widget.subtitle}</p>
        </div>
      </div>
      <div className="dashboardWidgetBody">{chartBody()}</div>
    </article>
  );
}

export default function DashboardSurface({ dashboardName, dashboardDescription, definition, rowsByDatasource, defaultDatasourceId, emptyMessage = "Load preview to see this widget.", showHeader = true }: DashboardSurfaceProps) {
  const [canvasWidth, setCanvasWidth] = useState(800);
  const canvasRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = canvasRef.current;
    if (!el) {
      return;
    }
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setCanvasWidth(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rglLayout = useMemo(
    () =>
      definition.widgets.map((widget, index) => ({
        i: widget.id,
        x: Math.max(
          0,
          typeof widget.layout.gx === "number" ? widget.layout.gx : (Math.max(1, widget.layout.columnStart) - 1)
        ),
        y: Math.max(0, typeof widget.layout.gy === "number" ? widget.layout.gy : Math.floor(index / 3) * 4),
        w: Math.max(1, typeof widget.layout.gw === "number" ? widget.layout.gw : (widget.layout.columnSpan || 1)),
        h: Math.max(1, typeof widget.layout.gh === "number" ? widget.layout.gh : ((widget.layout.rowSpan || 1) * 2)),
        static: true,
      })),
    [definition.widgets]
  );

  const totalRows = useMemo(() => Object.values(rowsByDatasource).reduce((acc, item) => acc + item.length, 0), [rowsByDatasource]);

  return (
    <section className="dashboardCanvasSurface">
      {showHeader ? (
        <div className="dashboardCanvasHeader">
          <div>
            <p className="dashboardCanvasEyebrow">Custom Dashboard</p>
            <h2>{dashboardName || "Untitled Dashboard"}</h2>
            <p>{dashboardDescription || "Compose KPI cards, animated charts, and responsive tiles from your datasource."}</p>
          </div>
          <div className="dashboardCanvasMeta">
            <span>{definition.widgets.length} widgets</span>
            <span>{totalRows} live rows</span>
          </div>
        </div>
      ) : null}

      <div className="dashboardCanvasGrid" ref={canvasRef}>
        {definition.widgets.length === 0 ? (
          <div className="dashboardEmptyState dashboardEmptySurface">
            <p>Add widgets from the catalog to start designing the dashboard.</p>
          </div>
        ) : (
          <RGL
            width={Math.max(1, canvasWidth - 24)}
            layout={rglLayout}
            cols={12}
            rowHeight={60}
            margin={[12, 12]}
            containerPadding={[12, 12]}
            compactType={null}
            isDraggable={false}
            isResizable={false}
            preventCollision={false}
          >
            {definition.widgets.map((widget) => {
              const widgetDatasourceId = widget.config.datasourceId ?? defaultDatasourceId;
              const widgetRows = widgetDatasourceId ? (rowsByDatasource[widgetDatasourceId] ?? []) : [];
              return (
                <div key={widget.id} className="dashboardRglItem">
                  <DashboardWidgetCard widget={widget} definition={definition} rows={widgetRows} emptyMessage={emptyMessage} />
                </div>
              );
            })}
          </RGL>
        )}
      </div>
    </section>
  );
}