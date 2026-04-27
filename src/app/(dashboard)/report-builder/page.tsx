"use client";

import { Suspense, FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import InlineSnackbar from "@/components/InlineSnackbar";
import {
  aggregateFunctions,
  bottomTotalFunctions,
  calculateBottomTotals,
  defaultPdfLayout,
  formatDateTimeFixed,
  getOperatorsByDataType,
  HeaderLayout,
  inferDataType,
  parseHeaderLayout,
  parseBottomTotalsFromParameters,
  parsePdfLayoutFromParameters,
  BottomTotalDefinition,
  toBottomTotalsParameter,
  toPdfLayoutParameter,
  toHeaderLayoutJson,
  transformReportRows,
} from "@/lib/reportUtils";

type DatasourceColumn = {
  columnName: string;
  dataType: string;
  isAllowed: boolean;
};

type Datasource = {
  id: number;
  name: string;
  code: string;
  allowedColumns?: DatasourceColumn[];
};

type BuilderColumn = {
  columnName: string;
  displayName: string;
  displayOrder: number;
  dataType: string;
};

type BuilderFilter = {
  id: string;
  fieldName: string;
  valueType: string;
  operator: string;
  value: string;
};

type BuilderSort = {
  id: string;
  fieldName: string;
  direction: "ASC" | "DESC";
  sortOrder: number;
};

type BuilderGroup = {
  id: string;
  fieldName: string;
  groupOrder: number;
};

type BuilderAggregation = {
  id: string;
  fieldName: string;
  aggregateFunction: string;
};

type BuilderPreviewResult = {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  totalCount: number;
};

type ExistingReportDefinition = {
  id: number;
  name: string;
  code: string;
  description: string;
  datasourceId: number;
  columns: Array<{ columnName: string; displayName: string; displayOrder: number }>;
  filters: Array<{ fieldName: string; operator: string; value: string | null; valueType: string }>;
  sorts: Array<{ fieldName: string; direction: "ASC" | "DESC" | string; sortOrder: number }>;
  groups: Array<{ fieldName: string; groupOrder: number }>;
  aggregations: Array<{ fieldName: string; aggregateFunction: string }>;
  parameters: Array<{ name: string; value: string | null; dataType: string }>;
  branding: {
    logoUrl: string | null;
    title: string;
    subtitle: string | null;
    headerFieldsJson: string | null;
    showLogo: boolean;
    showGeneratedDate: boolean;
    showGeneratedBy: boolean;
    footerText: string | null;
    watermarkText: string | null;
  };
};

type SettingsPayload = {
  branding: {
    companyLogoDataUrl: string | null;
  };
};

type BuilderBottomTotal = BottomTotalDefinition & { id: string };

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error !== "object" || error === null) {
    return fallback;
  }

  const maybeAxiosError = error as {
    response?: {
      data?: {
        errors?: string[];
        message?: string;
        title?: string;
      };
    };
    message?: string;
  };

  const apiError = maybeAxiosError.response?.data;
  const firstError = apiError?.errors?.[0];
  const bestMessage = firstError ?? apiError?.message ?? apiError?.title ?? maybeAxiosError.message;

  if (!bestMessage || bestMessage.trim().length === 0) {
    return fallback;
  }

  if (bestMessage.toLowerCase().includes("report code already exists")) {
    return "Report code already exists. Please use a different code.";
  }

  return bestMessage;
};

const uid = () => `${Date.now()}_${Math.random().toString(16).slice(2)}`;

const emptyHeaderLayout: HeaderLayout = {
  logoPosition: "left",
  headerPosition: "center",
  headerFields: [
    { id: uid(), label: "Company", value: "Contoso" },
    { id: uid(), label: "Prepared For", value: "Management" },
  ],
};

function ReportBuilderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reportIdParam = searchParams.get("reportId");
  const editingReportId = Number(reportIdParam ?? 0);
  const isEditing = Number.isFinite(editingReportId) && editingReportId > 0;

  const [datasources, setDatasources] = useState<Datasource[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [datasourceId, setDatasourceId] = useState<number>(0);

  const [selectedColumns, setSelectedColumns] = useState<BuilderColumn[]>([]);
  const [filters, setFilters] = useState<BuilderFilter[]>([]);
  const [sorts, setSorts] = useState<BuilderSort[]>([]);
  const [groups, setGroups] = useState<BuilderGroup[]>([]);
  const [aggregations, setAggregations] = useState<BuilderAggregation[]>([]);
  const [bottomTotals, setBottomTotals] = useState<BuilderBottomTotal[]>([]);
  const [pdfOrientation, setPdfOrientation] = useState<"portrait" | "landscape">(defaultPdfLayout.orientation);
  const [pdfPageSize, setPdfPageSize] = useState<"a4" | "a3" | "a0">(defaultPdfLayout.pageSize);

  const [previewRows, setPreviewRows] = useState<Array<Record<string, unknown>>>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedReportId, setSavedReportId] = useState<number | null>(null);

  const [brandingTitle, setBrandingTitle] = useState("");
  const [brandingSubtitle, setBrandingSubtitle] = useState("");
  const [brandingFooter, setBrandingFooter] = useState("");
  const [brandingWatermark, setBrandingWatermark] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [showLogo, setShowLogo] = useState(false);
  const [showGeneratedDate, setShowGeneratedDate] = useState(true);
  const [showGeneratedBy, setShowGeneratedBy] = useState(true);
  const [headerLayout, setHeaderLayout] = useState<HeaderLayout>(emptyHeaderLayout);

  const selectedDatasource = useMemo(
    () => datasources.find((item) => item.id === datasourceId),
    [datasources, datasourceId]
  );

  const allowedColumns = useMemo(
    () => (selectedDatasource?.allowedColumns ?? []).filter((column) => column.isAllowed),
    [selectedDatasource]
  );

  const availableColumns = useMemo(() => {
    const selected = new Set(selectedColumns.map((column) => column.columnName));
    return allowedColumns.filter((column) => !selected.has(column.columnName));
  }, [allowedColumns, selectedColumns]);

  const transformedPreview = useMemo(() => {
    return transformReportRows(previewRows, {
      columns: selectedColumns.map((column) => ({
        columnName: column.columnName,
        displayName: column.displayName,
        displayOrder: column.displayOrder,
      })),
      filters: filters.map((filter) => ({
        fieldName: filter.fieldName,
        operator: filter.operator,
        value: filter.value,
        valueType: filter.valueType,
      })),
      sorts: sorts.map((sort) => ({
        fieldName: sort.fieldName,
        direction: sort.direction,
        sortOrder: sort.sortOrder,
      })),
      groups: groups.map((group) => ({
        fieldName: group.fieldName,
        groupOrder: group.groupOrder,
      })),
      aggregations: aggregations.map((aggregation) => ({
        fieldName: aggregation.fieldName,
        aggregateFunction: aggregation.aggregateFunction,
      })),
    });
  }, [previewRows, selectedColumns, filters, sorts, groups, aggregations]);

  const previewBottomTotals = useMemo(() => {
    return calculateBottomTotals(
      transformedPreview.rows,
      bottomTotals.map((item) => ({ fieldName: item.fieldName, functionName: item.functionName })),
      selectedColumns.map((column) => ({ columnName: column.columnName, displayName: column.displayName }))
    );
  }, [bottomTotals, selectedColumns, transformedPreview.rows]);

  const initializeDatasourceState = (datasource: Datasource | undefined) => {
    const initialColumns = (datasource?.allowedColumns ?? [])
      .filter((column) => column.isAllowed)
      .map((column, index) => ({
        columnName: column.columnName,
        displayName: column.columnName,
        displayOrder: index + 1,
        dataType: column.dataType || "string",
      }));

    setSelectedColumns(initialColumns);
    setFilters([]);
    setSorts([]);
    setGroups([]);
    setAggregations([]);
    setBottomTotals([]);
    setPreviewRows([]);
  };

  const mapDefinitionToState = (definition: ExistingReportDefinition, availableDatasources: Datasource[]) => {
    const source = availableDatasources.find((item) => item.id === definition.datasourceId);
    const typeMap = new Map<string, string>();
    for (const column of source?.allowedColumns ?? []) {
      typeMap.set(column.columnName, column.dataType || "string");
    }

    setName(definition.name);
    setCode(definition.code);
    setDescription(definition.description);
    setDatasourceId(definition.datasourceId);

    const orderedColumns = [...definition.columns]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((column, index) => ({
        columnName: column.columnName,
        displayName: column.displayName,
        displayOrder: index + 1,
        dataType: typeMap.get(column.columnName) || "string",
      }));

    setSelectedColumns(orderedColumns);

    setFilters(
      definition.filters.map((filter) => ({
        id: uid(),
        fieldName: filter.fieldName,
        valueType: filter.valueType,
        operator: filter.operator,
        value: filter.value ?? "",
      }))
    );

    setSorts(
      [...definition.sorts]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((sort, index) => ({
          id: uid(),
          fieldName: sort.fieldName,
          direction: sort.direction.toUpperCase() === "DESC" ? "DESC" : "ASC",
          sortOrder: index + 1,
        }))
    );

    setGroups(
      [...definition.groups]
        .sort((a, b) => a.groupOrder - b.groupOrder)
        .map((group, index) => ({
          id: uid(),
          fieldName: group.fieldName,
          groupOrder: index + 1,
        }))
    );

    setAggregations(
      definition.aggregations.map((aggregation) => ({
        id: uid(),
        fieldName: aggregation.fieldName,
        aggregateFunction: aggregation.aggregateFunction,
      }))
    );

    setBottomTotals(
      parseBottomTotalsFromParameters(definition.parameters).map((item) => ({
        id: uid(),
        fieldName: item.fieldName,
        functionName: item.functionName,
      }))
    );

    const pdfLayout = parsePdfLayoutFromParameters(definition.parameters);
    setPdfOrientation(pdfLayout.orientation);
    setPdfPageSize(pdfLayout.pageSize);

    setBrandingTitle(definition.branding.title || definition.name);
    setBrandingSubtitle(definition.branding.subtitle ?? "");
    setBrandingFooter(definition.branding.footerText ?? "");
    setBrandingWatermark(definition.branding.watermarkText ?? "");
    setLogoUrl(definition.branding.logoUrl ?? "");
    setShowLogo(definition.branding.showLogo);
    setShowGeneratedDate(definition.branding.showGeneratedDate);
    setShowGeneratedBy(definition.branding.showGeneratedBy);
    setHeaderLayout(parseHeaderLayout(definition.branding.headerFieldsJson));
    setSavedReportId(definition.id);
  };

  const loadExistingReport = async (availableDatasources: Datasource[]) => {
    if (!isEditing) {
      return;
    }

    const res = await api.get(`/reports/${editingReportId}`);
    const definition = (res.data?.data ?? null) as ExistingReportDefinition | null;
    if (!definition) {
      throw new Error("Report definition not found.");
    }

    mapDefinitionToState(definition, availableDatasources);
  };

  useEffect(() => {
    void (async () => {
      setError("");
      try {
        const [datasourceRes, settingsRes] = await Promise.all([
          api.get("/datasources/allowed?pageNumber=1&pageSize=200"),
          api.get("/settings"),
        ]);

        const list = (datasourceRes.data?.data?.items ?? []) as Datasource[];
        const settings = (settingsRes.data?.data ?? null) as SettingsPayload | null;
        const defaultLogo = settings?.branding.companyLogoDataUrl ?? "";

        setDatasources(list);
        setLogoUrl(defaultLogo);

        if (list.length === 0) {
          return;
        }

        if (isEditing) {
          await loadExistingReport(list);
          return;
        }

        const firstId = list[0].id;
        const initialColumns = (list[0].allowedColumns ?? [])
          .filter((column) => column.isAllowed)
          .map((column, index) => ({
            columnName: column.columnName,
            displayName: column.columnName,
            displayOrder: index + 1,
            dataType: column.dataType || "string",
          }));

        setDatasourceId(firstId);
        setSelectedColumns(initialColumns);
      } catch (requestError: unknown) {
        setError(getErrorMessage(requestError, isEditing ? "Failed to load report for editing." : "Failed to load builder settings and datasources."));
      }
    })();
  }, [editingReportId, isEditing]);

  const onColumnDropToSelected = (columnName: string) => {
    const column = allowedColumns.find((item) => item.columnName === columnName);
    if (!column) {
      return;
    }

    setSelectedColumns((prev) => {
      if (prev.some((item) => item.columnName === columnName)) {
        return prev;
      }

      return [
        ...prev,
        {
          columnName: column.columnName,
          displayName: column.columnName,
          displayOrder: prev.length + 1,
          dataType: column.dataType || "string",
        },
      ];
    });
  };

  const onRemoveSelectedColumn = (columnName: string) => {
    setSelectedColumns((prev) =>
      prev
        .filter((column) => column.columnName !== columnName)
        .map((column, index) => ({ ...column, displayOrder: index + 1 }))
    );
    setBottomTotals((prev) => prev.filter((item) => item.fieldName !== columnName));
  };

  const reorderSelectedColumn = (fromIndex: number, toIndex: number) => {
    setSelectedColumns((prev) => {
      if (toIndex < 0 || toIndex >= prev.length) {
        return prev;
      }

      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next.map((item, index) => ({ ...item, displayOrder: index + 1 }));
    });
  };

  const addFilter = () => {
    const firstColumn = selectedColumns[0];
    if (!firstColumn) {
      setError("Select at least one visible column first.");
      return;
    }

    const operators = getOperatorsByDataType(firstColumn.dataType);
    setFilters((prev) => [
      ...prev,
      {
        id: uid(),
        fieldName: firstColumn.columnName,
        valueType: firstColumn.dataType,
        operator: operators[0],
        value: "",
      },
    ]);
  };

  const addSort = () => {
    const firstColumn = selectedColumns[0];
    if (!firstColumn) {
      setError("Select at least one visible column first.");
      return;
    }

    setSorts((prev) => [
      ...prev,
      {
        id: uid(),
        fieldName: firstColumn.columnName,
        direction: "ASC",
        sortOrder: prev.length + 1,
      },
    ]);
  };

  const addGroup = () => {
    const firstColumn = selectedColumns[0];
    if (!firstColumn) {
      setError("Select at least one visible column first.");
      return;
    }

    setGroups((prev) => [
      ...prev,
      {
        id: uid(),
        fieldName: firstColumn.columnName,
        groupOrder: prev.length + 1,
      },
    ]);
  };

  const addAggregation = () => {
    const firstColumn = selectedColumns.find((column) => column.dataType === "number") ?? selectedColumns[0];
    if (!firstColumn) {
      setError("Select at least one visible column first.");
      return;
    }

    setAggregations((prev) => [
      ...prev,
      {
        id: uid(),
        fieldName: firstColumn.columnName,
        aggregateFunction: "sum",
      },
    ]);
  };

  const addBottomTotal = () => {
    const firstColumn = selectedColumns.find((column) => column.dataType === "number") ?? selectedColumns[0];
    if (!firstColumn) {
      setError("Select at least one visible column first.");
      return;
    }

    setBottomTotals((prev) => [
      ...prev,
      {
        id: uid(),
        fieldName: firstColumn.columnName,
        functionName: "sum",
      },
    ]);
  };

  const addHeaderField = () => {
    setHeaderLayout((prev) => ({
      ...prev,
      headerFields: [...prev.headerFields, { id: uid(), label: "New Header", value: "Value" }],
    }));
  };

  const reorderHeaderField = (fromIndex: number, toIndex: number) => {
    setHeaderLayout((prev) => {
      if (toIndex < 0 || toIndex >= prev.headerFields.length) {
        return prev;
      }

      const next = [...prev.headerFields];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return { ...prev, headerFields: next };
    });
  };

  const onPreview = async () => {
    if (!datasourceId) {
      setError("Select datasource first.");
      return;
    }

    setStatus("");
    setError("");
    setPreviewLoading(true);

    try {
      const res = await api.post("/datasources/run", {
        datasourceId,
        parameters: {},
        pageNumber: 1,
        pageSize: 200,
      });

      const preview = (res.data?.data ?? null) as BuilderPreviewResult | null;
      const rows = preview?.rows ?? [];

      const withTypes = selectedColumns.map((column) => {
        const sample = rows.find((row) => row[column.columnName] !== null && row[column.columnName] !== undefined)?.[column.columnName];
        return { ...column, dataType: sample === undefined ? column.dataType : inferDataType(sample) };
      });

      setSelectedColumns(withTypes);
      setPreviewRows(rows);
      setStatus(rows.length === 0 ? "Preview loaded: no rows returned." : `Preview loaded with ${rows.length} rows.`);
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Failed to load preview."));
    } finally {
      setPreviewLoading(false);
    }
  };

  const buildPayload = () => {
    return {
      name,
      code,
      description,
      datasourceId,
      isPublic: false,
      isPrivate: true,
      columns: selectedColumns.map((column, index) => ({
        columnName: column.columnName,
        displayName: column.displayName,
        displayOrder: index + 1,
      })),
      filters: filters.map((filter) => ({
        fieldName: filter.fieldName,
        operator: filter.operator,
        value: filter.value,
        valueType: filter.valueType,
      })),
      sorts: sorts.map((sort, index) => ({
        fieldName: sort.fieldName,
        direction: sort.direction,
        sortOrder: index + 1,
      })),
      groups: groups.map((group, index) => ({
        fieldName: group.fieldName,
        groupOrder: index + 1,
      })),
      aggregations: aggregations.map((aggregation) => ({
        fieldName: aggregation.fieldName,
        aggregateFunction: aggregation.aggregateFunction,
      })),
      parameters: toBottomTotalsParameter(
        bottomTotals.map((item) => ({
          fieldName: item.fieldName,
          functionName: item.functionName,
        }))
      ).concat([toPdfLayoutParameter({ orientation: pdfOrientation, pageSize: pdfPageSize })]),
      branding: {
        logoUrl: logoUrl || null,
        title: brandingTitle,
        subtitle: brandingSubtitle || null,
        headerFieldsJson: toHeaderLayoutJson(headerLayout),
        headerAlignment: headerLayout.headerPosition,
        showLogo,
        showGeneratedDate,
        showGeneratedBy,
        footerText: brandingFooter || null,
        watermarkText: brandingWatermark || null,
      },
    };
  };

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("");
    setError("");

    if (!datasourceId) {
      setError("Select datasource first.");
      return;
    }

    if (selectedColumns.length === 0) {
      setError("Select visible columns for your report.");
      return;
    }

    setSaving(true);
    try {
      const payload = buildPayload();
      if (isEditing) {
        const res = await api.put(`/reports/${editingReportId}`, payload);
        const updatedId = Number(res.data?.data?.id ?? editingReportId);
        setSavedReportId(updatedId > 0 ? updatedId : editingReportId);
        setStatus("Report updated with customization.");
      } else {
        await api.post("/reports", payload);
        router.push("/reports");
        return;
      }
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, isEditing ? "Failed to update report." : "Failed to save report."));
    } finally {
      setSaving(false);
    }
  };

  const headerSlot = (position: "left" | "center" | "right") => {
    const showLogoHere = headerLayout.logoPosition === position && showLogo;
    const showHeadersHere = headerLayout.headerPosition === position;

    return (
      <div
        className="headerSlot"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          const item = event.dataTransfer.getData("text/plain");
          if (item === "logo") {
            setHeaderLayout((prev) => ({ ...prev, logoPosition: position }));
          }
          if (item === "headers") {
            setHeaderLayout((prev) => ({ ...prev, headerPosition: position }));
          }
        }}
      >
        {showLogoHere ? (
          <div draggable className="dragCard" onDragStart={(event) => event.dataTransfer.setData("text/plain", "logo")}>
            {logoUrl ? <img src={logoUrl} alt="logo" className="reportLogo" /> : <span>Logo</span>}
          </div>
        ) : null}

        {showHeadersHere ? (
          <div draggable className="dragCard" onDragStart={(event) => event.dataTransfer.setData("text/plain", "headers")}>
            {headerLayout.headerFields.map((item) => (
              <p key={item.id}><strong>{item.label}:</strong> {item.value}</p>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="stack">
      <section className="card">
        <h2>{isEditing ? `Advanced Report Builder (Editing #${editingReportId})` : "Advanced Report Builder"}</h2>
        <form className="formGrid" onSubmit={onSave}>
          <label>
            Report Name
            <input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setBrandingTitle(event.target.value);
              }}
              required
            />
          </label>

          <label>
            Report Code
            <input value={code} onChange={(event) => setCode(event.target.value)} required />
          </label>

          <label>
            Description
            <input value={description} onChange={(event) => setDescription(event.target.value)} required />
          </label>

          <label>
            Datasource
            <select
              value={datasourceId}
              onChange={(event) => {
                const nextId = Number(event.target.value);
                setDatasourceId(nextId);
                initializeDatasourceState(datasources.find((item) => item.id === nextId));
              }}
            >
              {datasources.map((datasource) => (
                <option key={datasource.id} value={datasource.id}>
                  {datasource.name} ({datasource.code})
                </option>
              ))}
            </select>
          </label>

          <div className="builderSplit">
            <div className="builderPane">
              <h3>Available Columns</h3>
              {availableColumns.map((column) => (
                <div
                  key={column.columnName}
                  draggable
                  className="dragRow"
                  onDragStart={(event) => event.dataTransfer.setData("text/plain", column.columnName)}
                >
                  <span>{column.columnName}</span>
                  <button type="button" className="ghost smallButton" onClick={() => onColumnDropToSelected(column.columnName)}>
                    Add
                  </button>
                </div>
              ))}
            </div>

            <div
              className="builderPane"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                const columnName = event.dataTransfer.getData("text/plain");
                onColumnDropToSelected(columnName);
              }}
            >
              <h3>Visible Columns (Drag and Drop)</h3>
              {selectedColumns.map((column, index) => (
                <div
                  key={column.columnName}
                  draggable
                  className="dragRow"
                  onDragStart={(event) => event.dataTransfer.setData("text/plain", `selected:${index}`)}
                  onDrop={(event) => {
                    const payload = event.dataTransfer.getData("text/plain");
                    if (!payload.startsWith("selected:")) {
                      return;
                    }
                    const fromIndex = Number(payload.replace("selected:", ""));
                    reorderSelectedColumn(fromIndex, index);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                >
                  <input
                    value={column.displayName}
                    onChange={(event) =>
                      setSelectedColumns((prev) => prev.map((item, idx) => (idx === index ? { ...item, displayName: event.target.value } : item)))
                    }
                  />
                  <span>{column.columnName}</span>
                  <div className="actions">
                    <button type="button" className="ghost smallButton" onClick={() => reorderSelectedColumn(index, index - 1)}>Up</button>
                    <button type="button" className="ghost smallButton" onClick={() => reorderSelectedColumn(index, index + 1)}>Down</button>
                    <button type="button" className="danger smallButton" onClick={() => onRemoveSelectedColumn(column.columnName)}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="builderSection">
            <h3>Filters</h3>
            <button type="button" className="ghost smallButton" onClick={addFilter}>Add Filter</button>
            {filters.map((filter) => {
              const sourceColumn = selectedColumns.find((column) => column.columnName === filter.fieldName);
              const operators = getOperatorsByDataType(filter.valueType || sourceColumn?.dataType || "string");

              return (
                <div key={filter.id} className="builderRowGrid">
                  <select
                    value={filter.fieldName}
                    onChange={(event) => {
                      const selected = selectedColumns.find((column) => column.columnName === event.target.value);
                      const valueType = selected?.dataType || "string";
                      const op = getOperatorsByDataType(valueType)[0];

                      setFilters((prev) =>
                        prev.map((item) =>
                          item.id === filter.id
                            ? { ...item, fieldName: event.target.value, valueType, operator: op }
                            : item
                        )
                      );
                    }}
                  >
                    {selectedColumns.map((column) => (
                      <option key={column.columnName} value={column.columnName}>{column.columnName}</option>
                    ))}
                  </select>
                  <select
                    value={filter.operator}
                    onChange={(event) =>
                      setFilters((prev) => prev.map((item) => (item.id === filter.id ? { ...item, operator: event.target.value } : item)))
                    }
                  >
                    {operators.map((operator) => (
                      <option key={operator} value={operator}>{operator}</option>
                    ))}
                  </select>
                  <input
                    value={filter.value}
                    onChange={(event) =>
                      setFilters((prev) => prev.map((item) => (item.id === filter.id ? { ...item, value: event.target.value } : item)))
                    }
                  />
                  <button type="button" className="danger smallButton" onClick={() => setFilters((prev) => prev.filter((item) => item.id !== filter.id))}>
                    Remove
                  </button>
                </div>
              );
            })}
          </div>

          <div className="builderSection">
            <h3>Sorting</h3>
            <button type="button" className="ghost smallButton" onClick={addSort}>Add Sort</button>
            {sorts.map((sort) => (
              <div key={sort.id} className="builderRowGrid">
                <select value={sort.fieldName} onChange={(event) => setSorts((prev) => prev.map((item) => item.id === sort.id ? { ...item, fieldName: event.target.value } : item))}>
                  {selectedColumns.map((column) => (
                    <option key={column.columnName} value={column.columnName}>{column.columnName}</option>
                  ))}
                </select>
                <select value={sort.direction} onChange={(event) => setSorts((prev) => prev.map((item) => item.id === sort.id ? { ...item, direction: event.target.value as "ASC" | "DESC" } : item))}>
                  <option value="ASC">ASC</option>
                  <option value="DESC">DESC</option>
                </select>
                <button type="button" className="danger smallButton" onClick={() => setSorts((prev) => prev.filter((item) => item.id !== sort.id))}>Remove</button>
              </div>
            ))}
          </div>

          <div className="builderSection">
            <h3>Grouping</h3>
            <button type="button" className="ghost smallButton" onClick={addGroup}>Add Group</button>
            {groups.map((group) => (
              <div key={group.id} className="builderRowGrid">
                <select value={group.fieldName} onChange={(event) => setGroups((prev) => prev.map((item) => item.id === group.id ? { ...item, fieldName: event.target.value } : item))}>
                  {selectedColumns.map((column) => (
                    <option key={column.columnName} value={column.columnName}>{column.columnName}</option>
                  ))}
                </select>
                <button type="button" className="danger smallButton" onClick={() => setGroups((prev) => prev.filter((item) => item.id !== group.id))}>Remove</button>
              </div>
            ))}
          </div>

          <div className="builderSection">
            <h3>Aggregations</h3>
            <button type="button" className="ghost smallButton" onClick={addAggregation}>Add Aggregation</button>
            {aggregations.map((aggregation) => (
              <div key={aggregation.id} className="builderRowGrid">
                <select value={aggregation.fieldName} onChange={(event) => setAggregations((prev) => prev.map((item) => item.id === aggregation.id ? { ...item, fieldName: event.target.value } : item))}>
                  {selectedColumns.map((column) => (
                    <option key={column.columnName} value={column.columnName}>{column.columnName}</option>
                  ))}
                </select>
                <select value={aggregation.aggregateFunction} onChange={(event) => setAggregations((prev) => prev.map((item) => item.id === aggregation.id ? { ...item, aggregateFunction: event.target.value } : item))}>
                  {aggregateFunctions.map((functionName) => (
                    <option key={functionName} value={functionName}>{functionName.toUpperCase()}</option>
                  ))}
                </select>
                <button type="button" className="danger smallButton" onClick={() => setAggregations((prev) => prev.filter((item) => item.id !== aggregation.id))}>Remove</button>
              </div>
            ))}
          </div>

          <div className="builderSection">
            <h3>Bottom Totals (Footer)</h3>
            <button type="button" className="ghost smallButton" onClick={addBottomTotal}>Add Bottom Total</button>
            {bottomTotals.map((total) => (
              <div key={total.id} className="builderRowGrid">
                <select
                  value={total.fieldName}
                  onChange={(event) =>
                    setBottomTotals((prev) => prev.map((item) => item.id === total.id ? { ...item, fieldName: event.target.value } : item))
                  }
                >
                  {selectedColumns.map((column) => (
                    <option key={column.columnName} value={column.columnName}>{column.columnName}</option>
                  ))}
                </select>
                <select
                  value={total.functionName}
                  onChange={(event) =>
                    setBottomTotals((prev) => prev.map((item) =>
                      item.id === total.id
                        ? { ...item, functionName: event.target.value as BottomTotalDefinition["functionName"] }
                        : item
                    ))
                  }
                >
                  {bottomTotalFunctions.map((functionName) => (
                    <option key={functionName} value={functionName}>{functionName.toUpperCase()}</option>
                  ))}
                </select>
                <span />
                <button type="button" className="danger smallButton" onClick={() => setBottomTotals((prev) => prev.filter((item) => item.id !== total.id))}>Remove</button>
              </div>
            ))}
          </div>

          <div className="builderSection">
            <h3>PDF Layout</h3>
            <div className="builderRowGrid">
              <label>
                Orientation
                <select value={pdfOrientation} onChange={(event) => setPdfOrientation(event.target.value as "portrait" | "landscape")}>
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </label>
              <label>
                Page Size
                <select value={pdfPageSize} onChange={(event) => setPdfPageSize(event.target.value as "a4" | "a3" | "a0")}>
                  <option value="a4">A4</option>
                  <option value="a3">A3</option>
                  <option value="a0">A0</option>
                </select>
              </label>
            </div>
          </div>

          <div className="builderSection">
            <h3>Branding & Header Layout</h3>
            <label>
              Title
              <input value={brandingTitle} onChange={(event) => setBrandingTitle(event.target.value)} />
            </label>
            <label>
              Subtitle
              <input value={brandingSubtitle} onChange={(event) => setBrandingSubtitle(event.target.value)} />
            </label>
            <p>Company logo is managed from Settings / Branding and applied automatically.</p>
            <label>
              Footer
              <input value={brandingFooter} onChange={(event) => setBrandingFooter(event.target.value)} />
            </label>
            <label>
              Watermark
              <input value={brandingWatermark} onChange={(event) => setBrandingWatermark(event.target.value)} />
            </label>

            <div className="checkboxGrid">
              <label className="checkItem">
                <input type="checkbox" checked={showLogo} onChange={(event) => setShowLogo(event.target.checked)} />
                Show Logo
              </label>
              <label className="checkItem">
                <input type="checkbox" checked={showGeneratedDate} onChange={(event) => setShowGeneratedDate(event.target.checked)} />
                Show Generated Date
              </label>
              <label className="checkItem">
                <input type="checkbox" checked={showGeneratedBy} onChange={(event) => setShowGeneratedBy(event.target.checked)} />
                Show Generated By
              </label>
            </div>

            <button type="button" className="ghost smallButton" onClick={addHeaderField}>Add Header Field</button>
            {headerLayout.headerFields.map((item, index) => (
              <div key={item.id} className="builderRowGrid">
                <input
                  value={item.label}
                  onChange={(event) =>
                    setHeaderLayout((prev) => ({
                      ...prev,
                      headerFields: prev.headerFields.map((field) =>
                        field.id === item.id ? { ...field, label: event.target.value } : field
                      ),
                    }))
                  }
                />
                <input
                  value={item.value}
                  onChange={(event) =>
                    setHeaderLayout((prev) => ({
                      ...prev,
                      headerFields: prev.headerFields.map((field) =>
                        field.id === item.id ? { ...field, value: event.target.value } : field
                      ),
                    }))
                  }
                />
                <div className="actions">
                  <button type="button" className="ghost smallButton" onClick={() => reorderHeaderField(index, index - 1)}>Up</button>
                  <button type="button" className="ghost smallButton" onClick={() => reorderHeaderField(index, index + 1)}>Down</button>
                  <button type="button" className="danger smallButton" onClick={() => setHeaderLayout((prev) => ({ ...prev, headerFields: prev.headerFields.filter((field) => field.id !== item.id) }))}>Remove</button>
                </div>
              </div>
            ))}

            <p>Drag logo/header block between positions:</p>
            <div className="headerLayoutGrid">
              {headerSlot("left")}
              {headerSlot("center")}
              {headerSlot("right")}
            </div>
          </div>

          <div className="actions">
            <button type="button" className="ghost" onClick={() => void onPreview()} disabled={previewLoading}>
              {previewLoading ? "Loading Preview..." : "Load Preview"}
            </button>
            <button type="submit" disabled={saving}>{saving ? "Saving..." : isEditing ? "Save Changes" : "Save Report"}</button>
            {savedReportId ? (
              <button type="button" className="ghost" onClick={() => router.push(`/reports/${savedReportId}`)}>
                Open Report Viewer
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="card">
        <h2>Preview (Report View)</h2>
        <div className="reportPreviewWrap">
          <div className="reportHeaderGrid">
            {headerSlot("left")}
            {headerSlot("center")}
            {headerSlot("right")}
          </div>
          <h3>{brandingTitle}</h3>
          {brandingSubtitle ? <p>{brandingSubtitle}</p> : null}
          {showGeneratedDate ? <p>Generated: {formatDateTimeFixed(new Date())}</p> : null}
          {transformedPreview.columns.length > 0 ? (
            <div className="builderPreviewTableScroll">
            <table className="table">
              <thead>
                <tr>
                  {transformedPreview.columns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transformedPreview.rows.map((row, index) => (
                  <tr key={index}>
                    {transformedPreview.columns.map((column) => (
                      <td key={column}>{String(row[column] ?? "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {Object.keys(previewBottomTotals).length > 0 ? (
                <tfoot>
                  <tr className="totalsRow">
                    {transformedPreview.columns.map((column) => (
                      <td key={column}>
                        {previewBottomTotals[column] ? previewBottomTotals[column] : ""}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              ) : null}
            </table>
            </div>
          ) : (
            <p>Preview empty. Click Load Preview.</p>
          )}
          {brandingFooter ? <p>{brandingFooter}</p> : null}
          {brandingWatermark ? <p className="watermarkText">{brandingWatermark}</p> : null}
        </div>
      </section>

      <InlineSnackbar message={status} type="success" onClose={() => setStatus("")} />
      <InlineSnackbar message={error} type="error" onClose={() => setError("")} />
    </div>
  );
}

export default function ReportBuilderPage() {
  return (
    <Suspense fallback={<div className="card burst"><p className="dashboardSub">Loading report builder...</p></div>}>
      <ReportBuilderContent />
    </Suspense>
  );
}
