export type DashboardWidgetType = "kpi" | "tile" | "bar" | "line" | "area" | "pie" | "donut" | "table";

export type DashboardWidgetLayout = {
  columnStart: number;
  columnSpan: number;
  rowSpan: number;
  minHeight: number;
  // Builder canvas grid position (react-grid-layout)
  gx: number;
  gy: number;
  gw: number;
  gh: number;
};

export type DashboardMetricFormat = "number" | "currency" | "percent";
export type DashboardAggregate = "count" | "sum" | "avg" | "min" | "max";

export type DashboardWidgetConfig = {
  datasourceId?: number;
  xField?: string;
  yField?: string;
  yFields?: string[];
  legendLabel?: string;
  legendLabels?: string[];
  labelField?: string;
  valueField?: string;
  aggregate?: DashboardAggregate;
  metric?: DashboardAggregate;
  xLabel?: string;
  yLabel?: string;
  label?: string;
  limit?: number;
  showLegend?: boolean;
  accent?: string;
  paletteId?: string;
  format?: DashboardMetricFormat;
  currencySymbol?: string;
};

export type DashboardWidget = {
  id: string;
  type: DashboardWidgetType;
  title: string;
  subtitle: string;
  layout: DashboardWidgetLayout;
  config: DashboardWidgetConfig;
};

export type DashboardDefinition = {
  filters: Array<Record<string, unknown>>;
  widgets: DashboardWidget[];
  theme: {
    palette: string[];
  };
};

export type DatasourceColumn = {
  columnName: string;
  dataType: string;
  isAllowed: boolean;
};

export type Datasource = {
  id: number;
  name: string;
  code: string;
  allowedColumns?: DatasourceColumn[];
};

export type DashboardRecord = Record<string, unknown>;

export type WidgetCatalogItem = {
  type: DashboardWidgetType;
  label: string;
  description: string;
  accent: string;
};

export type PalettePreset = {
  id: string;
  name: string;
  colors: string[];
};

const compactDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
});

const paletteFallback = ["#2fb37b", "#ff7a59", "#4c7fff", "#f7b731", "#9b5de5", "#00bcd4"];

export const palettePresets: PalettePreset[] = [
  {
    id: "aurora",
    name: "Aurora Flow",
    colors: ["#2fb37b", "#ff7a59", "#4c7fff", "#f7b731", "#9b5de5", "#00bcd4"],
  },
  {
    id: "sunset",
    name: "Sunset Pulse",
    colors: ["#ff5f6d", "#ffc371", "#6a5af9", "#00c2a8", "#ff9671", "#0081cf"],
  },
  {
    id: "mint",
    name: "Mint Metro",
    colors: ["#2dd4bf", "#14b8a6", "#0ea5e9", "#8b5cf6", "#f97316", "#84cc16"],
  },
];

export const widgetCatalog: WidgetCatalogItem[] = [
  { type: "kpi", label: "KPI Pulse", description: "Animated value cards for totals, averages, and high-level signals.", accent: "#2fb37b" },
  { type: "tile", label: "Lite Tile", description: "Compact highlight tiles for spotlight numbers and short summaries.", accent: "#ff7a59" },
  { type: "bar", label: "Bar Chart", description: "Compare categories with bold bars and strong color separation.", accent: "#4c7fff" },
  { type: "line", label: "Line Chart", description: "Track trends across sequences with animated paths and markers.", accent: "#00bcd4" },
  { type: "area", label: "Area Chart", description: "Show growth and volume with soft gradients and motion.", accent: "#9b5de5" },
  { type: "pie", label: "Pie Chart", description: "Break down share across categories with bright arcs.", accent: "#f7b731" },
  { type: "donut", label: "Donut Chart", description: "Modern ring-style distribution chart for executive dashboards.", accent: "#ff5f6d" },
  { type: "table", label: "Data Table", description: "Add a responsive detail table beside charts and KPI blocks.", accent: "#14b8a6" },
];

const emptyWidgetLayout = (index: number): DashboardWidgetLayout => ({
  columnStart: (index % 2) * 6 + 1,
  columnSpan: index < 2 ? 6 : 6,
  rowSpan: index < 2 ? 1 : 2,
  minHeight: index < 2 ? 220 : 340,
  gx: (index % 3) * 4,
  gy: Math.floor(index / 3) * 4,
  gw: 4,
  gh: 3,
});

export const emptyDashboardDefinition: DashboardDefinition = {
  filters: [],
  widgets: [],
  theme: {
    palette: paletteFallback,
  },
};

export const isNumericDataType = (dataType: string) => {
  const normalized = dataType.toLowerCase();
  return normalized.includes("int") || normalized.includes("dec") || normalized.includes("num") || normalized.includes("float") || normalized.includes("double") || normalized.includes("money") || normalized === "number";
};

export const getAllowedColumns = (datasource?: Datasource) => (datasource?.allowedColumns ?? []).filter((column) => column.isAllowed);

const makeId = () => `${Date.now()}_${Math.random().toString(16).slice(2)}`;

export const createDashboardWidget = (type: DashboardWidgetType, index: number, columns: DatasourceColumn[]): DashboardWidget => {
  const dimensionColumn = columns.find((column) => !isNumericDataType(column.dataType))?.columnName ?? columns[0]?.columnName ?? "";
  const measureColumn = columns.find((column) => isNumericDataType(column.dataType))?.columnName ?? columns[0]?.columnName ?? "";
  const catalog = widgetCatalog.find((item) => item.type === type);

  const base: DashboardWidget = {
    id: makeId(),
    type,
    title: catalog?.label ?? "Dashboard Widget",
    subtitle: catalog?.description ?? "",
    layout: emptyWidgetLayout(index),
    config: {
      datasourceId: undefined,
      xField: dimensionColumn,
      yField: measureColumn,
      yFields: measureColumn ? [measureColumn] : undefined,
      legendLabel: undefined,
      legendLabels: undefined,
      labelField: dimensionColumn,
      valueField: measureColumn,
      aggregate: "sum",
      metric: "count",
      xLabel: dimensionColumn,
      yLabel: measureColumn,
      label: type === "tile" ? "Highlights" : "KPI",
      limit: type === "table" ? 8 : 6,
      showLegend: type === "pie" || type === "donut",
      accent: catalog?.accent ?? paletteFallback[index % paletteFallback.length],
      paletteId: undefined,
      format: "number",
      currencySymbol: "$",
    },
  };

  if (type === "kpi" || type === "tile") {
    return {
      ...base,
      layout: { ...base.layout, columnSpan: 3, rowSpan: 1, minHeight: 150, gw: 2, gh: 2 },
      config: {
        ...base.config,
        aggregate: type === "kpi" ? "count" : "sum",
        metric: type === "kpi" ? "count" : "sum",
        label: type === "kpi" ? "Total records" : "Primary metric",
      },
    };
  }

  if (type === "pie" || type === "donut") {
    return {
      ...base,
      layout: { ...base.layout, columnSpan: 5, rowSpan: 2, minHeight: 360, gw: 5, gh: 4 },
      config: {
        ...base.config,
        aggregate: "count",
      },
    };
  }

  if (type === "table") {
    return {
      ...base,
      layout: { ...base.layout, columnSpan: 12, rowSpan: 2, minHeight: 320, gw: 12, gh: 4 },
    };
  }

  return { ...base, layout: { ...base.layout, gw: 6, gh: 4 } };
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const toFiniteNumberOr = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeLayout = (value: unknown, index: number): DashboardWidgetLayout => {
  if (!isRecord(value)) {
    return emptyWidgetLayout(index);
  }

  const base = emptyWidgetLayout(index);
  const gx = toFiniteNumberOr(value.gx, (index % 3) * 4);
  const gy = toFiniteNumberOr(value.gy, Math.floor(index / 3) * 4);
  const gw = toFiniteNumberOr(value.gw, base.gw);
  const gh = toFiniteNumberOr(value.gh, base.gh);

  const columnStart = toFiniteNumberOr(value.columnStart, gx + 1);
  const columnSpan = toFiniteNumberOr(value.columnSpan, gw);
  const rowSpan = toFiniteNumberOr(value.rowSpan, Math.max(1, Math.round(gh / 2)));
  const minHeight = toFiniteNumberOr(value.minHeight, Math.max(180, gh * 60 + Math.max(0, gh - 1) * 12));

  return {
    columnStart,
    columnSpan,
    rowSpan,
    minHeight,
    gx,
    gy,
    gw,
    gh,
  };
};

const normalizeConfig = (value: unknown): DashboardWidgetConfig => {
  if (!isRecord(value)) {
    return {};
  }

  return {
    datasourceId: typeof value.datasourceId === "number" ? value.datasourceId : undefined,
    xField: typeof value.xField === "string" ? value.xField : undefined,
    yField: typeof value.yField === "string" ? value.yField : undefined,
    yFields: Array.isArray(value.yFields)
      ? value.yFields.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : undefined,
    legendLabel: typeof value.legendLabel === "string" ? value.legendLabel : undefined,
    legendLabels: Array.isArray(value.legendLabels)
      ? value.legendLabels.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : undefined,
    labelField: typeof value.labelField === "string" ? value.labelField : undefined,
    valueField: typeof value.valueField === "string" ? value.valueField : undefined,
    aggregate: isAggregate(value.aggregate) ? value.aggregate : undefined,
    metric: isAggregate(value.metric) ? value.metric : undefined,
    xLabel: typeof value.xLabel === "string" ? value.xLabel : undefined,
    yLabel: typeof value.yLabel === "string" ? value.yLabel : undefined,
    label: typeof value.label === "string" ? value.label : undefined,
    limit: typeof value.limit === "number" ? value.limit : undefined,
    showLegend: typeof value.showLegend === "boolean" ? value.showLegend : undefined,
    accent: typeof value.accent === "string" ? value.accent : undefined,
    paletteId: typeof value.paletteId === "string" ? value.paletteId : undefined,
    format: isFormat(value.format) ? value.format : undefined,
    currencySymbol: typeof value.currencySymbol === "string" ? value.currencySymbol : undefined,
  };
};

const isWidgetType = (value: unknown): value is DashboardWidgetType => typeof value === "string" && widgetCatalog.some((item) => item.type === value);

const isAggregate = (value: unknown): value is DashboardAggregate => value === "count" || value === "sum" || value === "avg" || value === "min" || value === "max";

const isFormat = (value: unknown): value is DashboardMetricFormat => value === "number" || value === "currency" || value === "percent";

export const normalizeDashboardDefinition = (input: unknown): DashboardDefinition => {
  if (!isRecord(input)) {
    return emptyDashboardDefinition;
  }

  const widgetsInput = Array.isArray(input.widgets) ? input.widgets : [];
  const theme = isRecord(input.theme) && Array.isArray(input.theme.palette)
    ? input.theme.palette.filter((item): item is string => typeof item === "string" && item.length > 0)
    : paletteFallback;

  return {
    filters: [],
    widgets: widgetsInput.map((item, index) => {
      const widget = isRecord(item) ? item : {};
      const type = isWidgetType(widget.type) ? widget.type : "kpi";
      const fallback = createDashboardWidget(type, index, []);

      return {
        id: typeof widget.id === "string" ? widget.id : makeId(),
        type,
        title: typeof widget.title === "string" ? widget.title : fallback.title,
        subtitle: typeof widget.subtitle === "string" ? widget.subtitle : fallback.subtitle,
        layout: normalizeLayout(widget.layout, index),
        config: {
          ...fallback.config,
          ...normalizeConfig(widget.config),
        },
      };
    }),
    theme: {
      palette: theme.length > 0 ? theme : paletteFallback,
    },
  };
};

const toFiniteNumber = (value: unknown) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const normalized = value
      .trim()
      .replace(/[,\s]/g, "")
      .replace(/[$%]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const tryParseDateAxisValue = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    const abs = Math.abs(value);
    const asMilliseconds = abs >= 1_000_000_000_000 ? value : abs >= 1_000_000_000 ? value * 1000 : null;
    if (asMilliseconds === null) {
      return null;
    }

    const date = new Date(asMilliseconds);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();
  if (!text || /^[-+]?\d+(\.\d+)?$/.test(text) || !/[\-/:T]/.test(text)) {
    return null;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatChartAxisLabel = (value: unknown) => {
  const parsedDate = tryParseDateAxisValue(value);
  if (parsedDate) {
    return compactDateFormatter.format(parsedDate);
  }

  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
};

const aggregateValues = (values: number[], aggregate: DashboardAggregate) => {
  if (aggregate === "count") {
    return values.length;
  }

  if (values.length === 0) {
    return 0;
  }

  if (aggregate === "sum") {
    return values.reduce((total, current) => total + current, 0);
  }

  if (aggregate === "avg") {
    return values.reduce((total, current) => total + current, 0) / values.length;
  }

  if (aggregate === "min") {
    return Math.min(...values);
  }

  return Math.max(...values);
};

export const buildGroupedChartData = (rows: DashboardRecord[], widget: DashboardWidget) => {
  const groupField = widget.config.xField || widget.config.labelField;
  const valueField = widget.config.yField || widget.config.valueField;
  const aggregate = widget.config.aggregate ?? "count";
  const limit = Math.max(1, widget.config.limit ?? 6);

  if (!groupField) {
    return [] as Array<{ name: string; value: number }>;
  }

  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const rawKey = row[groupField];
    const key = typeof rawKey === "string" && rawKey.trim().length > 0 ? rawKey : String(rawKey ?? "Unspecified");
    const bucket = groups.get(key) ?? [];

    if (aggregate === "count") {
      bucket.push(1);
    } else {
      const numericValue = toFiniteNumber(row[valueField ?? ""]);
      if (numericValue !== null) {
        bucket.push(numericValue);
      }
    }

    groups.set(key, bucket);
  }

  return [...groups.entries()]
    .map(([name, values]) => ({ name, value: Number(aggregateValues(values, aggregate).toFixed(2)) }))
    .filter((item) => Number.isFinite(item.value))
    .slice(0, limit);
};

export const buildMetricValue = (rows: DashboardRecord[], widget: DashboardWidget) => {
  const metric = widget.config.aggregate ?? widget.config.metric ?? "count";
  const valueField = widget.config.valueField || widget.config.yField;

  if (metric === "count") {
    if (!valueField) {
      return rows.length;
    }

    return rows.filter((row) => row[valueField] !== null && row[valueField] !== undefined && String(row[valueField]).trim() !== "").length;
  }

  const values = rows.map((row) => toFiniteNumber(row[valueField ?? ""])).filter((value): value is number => value !== null);
  return Number(aggregateValues(values, metric).toFixed(2));
};

export const formatMetricValue = (value: number, format: DashboardMetricFormat = "number", currencySymbol?: string) => {
  if (!Number.isFinite(value)) {
    return "0";
  }

  if (format === "currency") {
    const symbol = (currencySymbol ?? "$" ).trim() || "$";
    return `${symbol}${new Intl.NumberFormat("en-US", { maximumFractionDigits: value % 1 === 0 ? 0 : 2 }).format(value)}`;
  }

  if (format === "percent") {
    return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 }).format(value / 100);
  }

  return new Intl.NumberFormat("en-US", { maximumFractionDigits: value % 1 === 0 ? 0 : 2 }).format(value);
};

export const getWidgetPalette = (widget: DashboardWidget, definition: DashboardDefinition) => {
  if (widget.config.paletteId) {
    const preset = palettePresets.find((item) => item.id === widget.config.paletteId);
    if (preset) {
      return preset.colors;
    }
  }

  const accent = widget.config.accent;
  if (accent) {
    return [accent, ...definition.theme.palette.filter((item) => item !== accent)];
  }

  return definition.theme.palette.length > 0 ? definition.theme.palette : paletteFallback;
};

export const getTableColumns = (rows: DashboardRecord[], widget: DashboardWidget) => {
  const firstRow = rows[0];
  if (!firstRow) {
    return [] as string[];
  }

  const keys = Object.keys(firstRow);
  const limit = Math.max(3, widget.config.limit ?? 6);
  return keys.slice(0, limit);
};