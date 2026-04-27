export type ReportColumn = {
  columnName: string;
  displayName: string;
  displayOrder: number;
};

export type ReportFilter = {
  fieldName: string;
  operator: string;
  value: string | null;
  valueType: string;
};

export type ReportSort = {
  fieldName: string;
  direction: string;
  sortOrder: number;
};

export type ReportGroup = {
  fieldName: string;
  groupOrder: number;
};

export type ReportAggregation = {
  fieldName: string;
  aggregateFunction: string;
};

export type BottomTotalFunction = "sum" | "avg" | "count";

export type BottomTotalDefinition = {
  fieldName: string;
  functionName: BottomTotalFunction;
};

export type PdfOrientation = "portrait" | "landscape";
export type PdfPageSize = "a4" | "a3" | "a0";

export type PdfLayoutSetting = {
  orientation: PdfOrientation;
  pageSize: PdfPageSize;
};

export type ReportBranding = {
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

export type ReportDefinition = {
  id: number;
  name: string;
  code: string;
  description: string;
  datasourceId: number;
  ownerUserId: number;
  isPublic: boolean;
  isPrivate: boolean;
  columns: ReportColumn[];
  filters: ReportFilter[];
  sorts: ReportSort[];
  groups: ReportGroup[];
  aggregations: ReportAggregation[];
  parameters: Array<{ name: string; value: string | null; dataType: string }>;
  branding: ReportBranding;
};

export type HeaderLayout = {
  logoPosition: "left" | "center" | "right";
  headerPosition: "left" | "center" | "right";
  headerFields: Array<{ id: string; label: string; value: string }>;
};

export const aggregateFunctions = ["sum", "avg", "count", "min", "max"];
export const bottomTotalFunctions: BottomTotalFunction[] = ["sum", "avg", "count"];
export const BOTTOM_TOTALS_PARAM_NAME = "__bottomTotals";
export const PDF_LAYOUT_PARAM_NAME = "__pdfLayout";

export const defaultPdfLayout: PdfLayoutSetting = {
  orientation: "portrait",
  pageSize: "a4",
};

export const inferDataType = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "string";
  }

  if (typeof value === "number") {
    return "number";
  }

  if (typeof value === "boolean") {
    return "boolean";
  }

  const text = String(value).trim();
  if (text.length === 0) {
    return "string";
  }

  if (!Number.isNaN(Number(text))) {
    return "number";
  }

  if (text.toLowerCase() === "true" || text.toLowerCase() === "false") {
    return "boolean";
  }

  const asDate = Date.parse(text);
  if (!Number.isNaN(asDate)) {
    return "date";
  }

  return "string";
};

export const getOperatorsByDataType = (dataType: string): string[] => {
  const normalized = dataType.toLowerCase();

  if (normalized === "number" || normalized === "date") {
    return ["=", "!=", ">", ">=", "<", "<="];
  }

  if (normalized === "boolean") {
    return ["=", "!="];
  }

  return ["contains", "startsWith", "endsWith", "=", "!="];
};

const compareValues = (left: unknown, right: unknown, dataType: string): number => {
  const normalized = dataType.toLowerCase();

  if (normalized === "number") {
    return Number(left ?? 0) - Number(right ?? 0);
  }

  if (normalized === "date") {
    return new Date(String(left ?? "")).getTime() - new Date(String(right ?? "")).getTime();
  }

  if (normalized === "boolean") {
    return Number(Boolean(left)) - Number(Boolean(right));
  }

  return String(left ?? "").localeCompare(String(right ?? ""));
};

const matchFilter = (rowValue: unknown, filter: ReportFilter): boolean => {
  const value = filter.value ?? "";
  const left = rowValue;

  switch (filter.operator) {
    case "contains":
      return String(left ?? "").toLowerCase().includes(value.toLowerCase());
    case "startsWith":
      return String(left ?? "").toLowerCase().startsWith(value.toLowerCase());
    case "endsWith":
      return String(left ?? "").toLowerCase().endsWith(value.toLowerCase());
    case "=":
      return compareValues(left, value, filter.valueType) === 0;
    case "!=":
      return compareValues(left, value, filter.valueType) !== 0;
    case ">":
      return compareValues(left, value, filter.valueType) > 0;
    case ">=":
      return compareValues(left, value, filter.valueType) >= 0;
    case "<":
      return compareValues(left, value, filter.valueType) < 0;
    case "<=":
      return compareValues(left, value, filter.valueType) <= 0;
    default:
      return true;
  }
};

const toNumeric = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const aggregateForGroup = (
  rows: Array<Record<string, unknown>>,
  groups: ReportGroup[],
  aggregations: ReportAggregation[]
): Record<string, unknown> => {
  const groupedRow: Record<string, unknown> = {};

  for (const group of groups) {
    groupedRow[group.fieldName] = rows[0]?.[group.fieldName] ?? "";
  }

  for (const aggregation of aggregations) {
    const values = rows.map((row) => row[aggregation.fieldName]);
    const fn = aggregation.aggregateFunction.toLowerCase();
    const outputKey = `${fn}_${aggregation.fieldName}`;

    if (fn === "count") {
      groupedRow[outputKey] = values.length;
      continue;
    }

    if (fn === "min") {
      groupedRow[outputKey] = values.reduce((min, current) => (compareValues(current, min, inferDataType(current)) < 0 ? current : min), values[0]);
      continue;
    }

    if (fn === "max") {
      groupedRow[outputKey] = values.reduce((max, current) => (compareValues(current, max, inferDataType(current)) > 0 ? current : max), values[0]);
      continue;
    }

    const numericValues = values.map(toNumeric);
    const sum = numericValues.reduce((acc, item) => acc + item, 0);

    if (fn === "avg") {
      groupedRow[outputKey] = numericValues.length === 0 ? 0 : sum / numericValues.length;
      continue;
    }

    groupedRow[outputKey] = sum;
  }

  return groupedRow;
};

export const parseHeaderLayout = (json: string | null | undefined): HeaderLayout => {
  if (!json) {
    return {
      logoPosition: "left",
      headerPosition: "center",
      headerFields: [],
    };
  }

  try {
    const parsed = JSON.parse(json) as Partial<HeaderLayout>;
    return {
      logoPosition: (parsed.logoPosition ?? "left") as "left" | "center" | "right",
      headerPosition: (parsed.headerPosition ?? "center") as "left" | "center" | "right",
      headerFields: parsed.headerFields ?? [],
    };
  } catch {
    return {
      logoPosition: "left",
      headerPosition: "center",
      headerFields: [],
    };
  }
};

export const toHeaderLayoutJson = (layout: HeaderLayout): string => JSON.stringify(layout);

export const formatDateTimeFixed = (value: Date | string): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = String(date.getDate()).padStart(2, "0");
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hour24 = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const meridiem = date.getHours() >= 12 ? "PM" : "AM";

  return `${day}-${month}-${year} ${hour24}:${minute} ${meridiem}`;
};

export const formatCurrency = (value: unknown): string => {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return String(value ?? "");
  }
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parsed);
};

export const parseBottomTotalsFromParameters = (
  parameters: Array<{ name: string; value: string | null; dataType: string }> | undefined
): BottomTotalDefinition[] => {
  const raw = parameters?.find((item) => item.name === BOTTOM_TOTALS_PARAM_NAME)?.value;
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as BottomTotalDefinition[];
    return parsed.filter((item) =>
      typeof item?.fieldName === "string"
      && (item.functionName === "sum" || item.functionName === "avg" || item.functionName === "count")
    );
  } catch {
    return [];
  }
};

export const toBottomTotalsParameter = (
  definitions: BottomTotalDefinition[]
): Array<{ name: string; value: string | null; dataType: string }> => {
  if (definitions.length === 0) {
    return [];
  }

  return [{
    name: BOTTOM_TOTALS_PARAM_NAME,
    value: JSON.stringify(definitions),
    dataType: "json",
  }];
};

export const parsePdfLayoutFromParameters = (
  parameters: Array<{ name: string; value: string | null; dataType: string }> | undefined
): PdfLayoutSetting => {
  const raw = parameters?.find((item) => item.name === PDF_LAYOUT_PARAM_NAME)?.value;
  if (!raw) {
    return defaultPdfLayout;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PdfLayoutSetting>;
    const orientation = parsed.orientation === "landscape" ? "landscape" : "portrait";
    const pageSize = parsed.pageSize === "a3" || parsed.pageSize === "a0" ? parsed.pageSize : "a4";
    return { orientation, pageSize };
  } catch {
    return defaultPdfLayout;
  }
};

export const toPdfLayoutParameter = (
  layout: PdfLayoutSetting
): { name: string; value: string | null; dataType: string } => ({
  name: PDF_LAYOUT_PARAM_NAME,
  value: JSON.stringify(layout),
  dataType: "json",
});

export const calculateBottomTotals = (
  rows: Array<Record<string, unknown>>,
  definitions: BottomTotalDefinition[],
  columns: Array<{ columnName: string; displayName: string }>
): Record<string, string> => {
  const output: Record<string, string> = {};

  for (const definition of definitions) {
    const column = columns.find((item) => item.columnName === definition.fieldName);
    if (!column) {
      continue;
    }

    const key = column.displayName;
    const values = rows.map((row) => row[key]);
    let result = "";

    if (definition.functionName === "count") {
      result = `${values.length}`;
    } else {
      const numericValues = values
        .map((value) => Number(value))
        .filter((value) => !Number.isNaN(value));

      const sum = numericValues.reduce((acc, item) => acc + item, 0);
      if (definition.functionName === "sum") {
        result = `${sum}`;
      } else {
        const avg = numericValues.length === 0 ? 0 : sum / numericValues.length;
        result = `${Number.isInteger(avg) ? avg : avg.toFixed(2)}`;
      }
    }

    output[key] = output[key] ? `${output[key]} | ${result}` : result;
  }

  return output;
};

export const transformReportRows = (
  inputRows: Array<Record<string, unknown>>,
  definition: Pick<ReportDefinition, "filters" | "sorts" | "groups" | "aggregations" | "columns">
): { columns: string[]; rows: Array<Record<string, unknown>> } => {
  let rows = [...inputRows];

  const filters = definition.filters ?? [];
  if (filters.length > 0) {
    rows = rows.filter((row) => filters.every((filter) => matchFilter(row[filter.fieldName], filter)));
  }

  const sorts = [...(definition.sorts ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  if (sorts.length > 0) {
    rows = [...rows].sort((a, b) => {
      for (const sort of sorts) {
        const compare = compareValues(a[sort.fieldName], b[sort.fieldName], inferDataType(a[sort.fieldName]));
        if (compare !== 0) {
          return sort.direction.toUpperCase() === "DESC" ? -compare : compare;
        }
      }
      return 0;
    });
  }

  const groups = [...(definition.groups ?? [])].sort((a, b) => a.groupOrder - b.groupOrder);
  const aggregations = definition.aggregations ?? [];

  if (groups.length > 0 || aggregations.length > 0) {
    const map = new Map<string, Array<Record<string, unknown>>>();

    for (const row of rows) {
      const groupKey = groups.length === 0
        ? "__all__"
        : groups.map((group) => String(row[group.fieldName] ?? "")).join("||");

      const bucket = map.get(groupKey) ?? [];
      bucket.push(row);
      map.set(groupKey, bucket);
    }

    rows = Array.from(map.values()).map((bucket) => aggregateForGroup(bucket, groups, aggregations));
  }

  const columns = [...(definition.columns ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);
  if (columns.length === 0) {
    const fallbackColumns = rows.length === 0 ? [] : Object.keys(rows[0]);
    return { columns: fallbackColumns, rows };
  }

  const outputRows = rows.map((row) => {
    const mapped: Record<string, unknown> = {};
    for (const column of columns) {
      const rawValue = row[column.columnName]
        ?? row[`${"sum"}_${column.columnName}`]
        ?? row[`${"avg"}_${column.columnName}`]
        ?? row[`${"count"}_${column.columnName}`]
        ?? row[`${"min"}_${column.columnName}`]
        ?? row[`${"max"}_${column.columnName}`]
        ?? "";

      mapped[column.displayName] = inferDataType(rawValue) === "date"
        ? formatDateTimeFixed(String(rawValue))
        : rawValue;
    }
    return mapped;
  });

  return {
    columns: columns.map((column) => column.displayName),
    rows: outputRows,
  };
};
