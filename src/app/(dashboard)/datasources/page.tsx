"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import InlineSnackbar from "@/components/InlineSnackbar";

type Datasource = {
  id: number;
  name: string;
  code: string;
  description: string;
  datasourceType: number;
  sqlDefinitionOrObjectName: string;
  parameters?: Array<{
    name: string;
    label: string;
    dataType: string;
    isRequired: boolean;
    defaultValue?: string | null;
  }>;
  allowedColumns?: Array<{
    columnName: string;
    dataType: string;
    isAllowed: boolean;
  }>;
};

type Role = {
  id: number;
  name: string;
  code: string;
};

type UserLite = {
  id: number;
  username: string;
  fullName: string;
};

type PreviewResult = {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  totalCount: number;
};

type ExtractedColumn = {
  columnName: string;
  dataType: string;
  isAllowed: boolean;
};

const datasourceTypeLabels: Record<number, string> = {
  1: "SQL Query",
  2: "SQL View",
  3: "Stored Procedure",
};

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

export default function DatasourcesPage() {
  const [rows, setRows] = useState<Datasource[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [previewDatasourceId, setPreviewDatasourceId] = useState<number>(0);
  const [previewParameters, setPreviewParameters] = useState<Record<string, string>>({});
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [definitionTestLoading, setDefinitionTestLoading] = useState(false);
  const [definitionPreview, setDefinitionPreview] = useState<PreviewResult | null>(null);
  const [extractedColumns, setExtractedColumns] = useState<ExtractedColumn[]>([]);

  const [createForm, setCreateForm] = useState({
    name: "",
    code: "",
    description: "",
    datasourceType: 1,
    sqlDefinitionOrObjectName: "",
  });

  const [assignment, setAssignment] = useState({
    datasourceId: 0,
    roleId: 0,
    userId: 0,
    canView: true,
    canUse: true,
    canManage: false,
  });

  const [editTarget, setEditTarget] = useState<Datasource | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    datasourceType: 1,
    sqlDefinitionOrObjectName: "",
  });
  const [editExtractedColumns, setEditExtractedColumns] = useState<ExtractedColumn[]>([]);
  const [editDefinitionTestLoading, setEditDefinitionTestLoading] = useState(false);
  const [editDefinitionPreview, setEditDefinitionPreview] = useState<PreviewResult | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const openEdit = (datasource: Datasource) => {
    setEditTarget(datasource);
    setEditForm({
      name: datasource.name,
      description: datasource.description,
      datasourceType: datasource.datasourceType,
      sqlDefinitionOrObjectName: datasource.sqlDefinitionOrObjectName,
    });
    // Pre-fill columns from existing datasource so user can save without re-testing
    setEditExtractedColumns(
      (datasource.allowedColumns ?? []).map((c) => ({
        columnName: c.columnName,
        dataType: c.dataType,
        isAllowed: c.isAllowed,
      }))
    );
    setEditDefinitionPreview(null);
    setStatus("");
    setError("");
  };

  const closeEdit = () => {
    setEditTarget(null);
    setEditForm({ name: "", description: "", datasourceType: 1, sqlDefinitionOrObjectName: "" });
    setEditExtractedColumns([]);
    setEditDefinitionPreview(null);
  };

  const onEditTestDefinition = async () => {
    setStatus("");
    setError("");
    setEditDefinitionPreview(null);
    setEditExtractedColumns([]);

    if (!editForm.sqlDefinitionOrObjectName.trim()) {
      setError("Enter SQL definition or object name first.");
      return;
    }

    setEditDefinitionTestLoading(true);
    try {
      const res = await api.post("/datasources/test-definition", {
        datasourceType: editForm.datasourceType,
        sqlDefinitionOrObjectName: editForm.sqlDefinitionOrObjectName,
        pageSize: 10,
      });

      const preview = (res.data?.data ?? null) as PreviewResult | null;
      setEditDefinitionPreview(preview);

      const columns = (preview?.columns ?? []).map((columnName) => ({
        columnName,
        dataType: "string",
        isAllowed: true,
      }));

      setEditExtractedColumns(columns);
      setStatus(columns.length > 0 ? "Query executed and columns extracted." : "Query executed, but no columns were returned.");
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Failed to execute datasource test query."));
    } finally {
      setEditDefinitionTestLoading(false);
    }
  };

  const onEditSave = async () => {
    if (!editTarget) return;
    setStatus("");
    setError("");

    if ((editForm.datasourceType === 1 || editForm.datasourceType === 2) && editExtractedColumns.length === 0) {
      setError("Run test query first so system can extract columns.");
      return;
    }

    try {
      await api.put(`/datasources/${editTarget.id}`, {
        name: editForm.name,
        description: editForm.description,
        datasourceType: editForm.datasourceType,
        sqlDefinitionOrObjectName: editForm.sqlDefinitionOrObjectName,
        parameters: editTarget.parameters ?? [],
        allowedColumns: editExtractedColumns,
      });

      setStatus("Datasource updated successfully.");
      closeEdit();
      await loadData();
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Failed to update datasource."));
    }
  };

  const onDelete = async (id: number) => {
    setDeleteLoading(true);
    setStatus("");
    setError("");
    try {
      await api.delete(`/datasources/${id}`);
      setStatus("Datasource deleted.");
      setDeleteTargetId(null);
      await loadData();
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Failed to delete datasource."));
    } finally {
      setDeleteLoading(false);
    }
  };

  const sortedRoles = useMemo(() => [...roles].sort((a, b) => a.name.localeCompare(b.name)), [roles]);
  const sortedUsers = useMemo(() => [...users].sort((a, b) => a.fullName.localeCompare(b.fullName)), [users]);
  const previewDatasource = useMemo(
    () => rows.find((row) => row.id === previewDatasourceId) ?? null,
    [rows, previewDatasourceId]
  );

  const getParameterDefaultValue = (parameter: NonNullable<Datasource["parameters"]>[number]) => {
    if (parameter.defaultValue && parameter.defaultValue.trim().length > 0) {
      return parameter.defaultValue;
    }

    const normalizedType = (parameter.dataType ?? "").toLowerCase();
    const today = new Date();
    const formatDate = (date: Date) => date.toISOString().split("T")[0];

    if (normalizedType === "date" || normalizedType === "datetime") {
      if (parameter.name.toLowerCase().includes("start")) {
        const start = new Date(today);
        start.setDate(today.getDate() - 30);
        return formatDate(start);
      }

      return formatDate(today);
    }

    return "";
  };

  const buildPreviewParams = (datasource: Datasource | null) => {
    if (!datasource?.parameters?.length) {
      return {};
    }

    return datasource.parameters.reduce<Record<string, string>>((acc, parameter) => {
      acc[parameter.name] = getParameterDefaultValue(parameter);
      return acc;
    }, {});
  };

  const loadData = async () => {
    setError("");
    try {
      const [datasourceRes, rolesRes, usersRes] = await Promise.all([
        api.get("/datasources/allowed?pageNumber=1&pageSize=200"),
        api.get("/admin/roles"),
        api.get("/admin/users-lite"),
      ]);

      const loadedRows = (datasourceRes.data?.data?.items ?? []) as Datasource[];
      const loadedRoles = (rolesRes.data?.data ?? []) as Role[];
      const loadedUsers = (usersRes.data?.data ?? []) as UserLite[];

      setRows(loadedRows);
      setRoles(loadedRoles);
      setUsers(loadedUsers);

      setAssignment((prev) => ({
        ...prev,
        datasourceId: prev.datasourceId || loadedRows[0]?.id || 0,
        roleId: prev.roleId || loadedRoles[0]?.id || 0,
        userId: prev.userId || loadedUsers[0]?.id || 0,
      }));

      if (!previewDatasourceId && loadedRows[0]?.id) {
        setPreviewDatasourceId(loadedRows[0].id);
        setPreviewParameters(buildPreviewParams(loadedRows[0]));
      }
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Failed to load datasource data."));
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!previewDatasourceId) {
      return;
    }

    const selected = rows.find((row) => row.id === previewDatasourceId) ?? null;
    setPreviewParameters((prev) => {
      const hasValues = Object.keys(prev).length > 0;
      return hasValues ? prev : buildPreviewParams(selected);
    });
  }, [previewDatasourceId, rows]);

  const loadPreview = async (datasourceId: number) => {
    setPreviewLoading(true);
    setError("");

    try {
      const res = await api.post("/datasources/run", {
        datasourceId,
        parameters: previewParameters,
        pageNumber: 1,
        pageSize: 10,
      });

      setPreviewData((res.data?.data ?? null) as PreviewResult | null);
      setPreviewDatasourceId(datasourceId);
    } catch (requestError: unknown) {
      setPreviewData(null);
      setError(getErrorMessage(requestError, "Failed to load datasource preview."));
    } finally {
      setPreviewLoading(false);
    }
  };

  const onTestDefinition = async () => {
    setStatus("");
    setError("");
    setDefinitionPreview(null);
    setExtractedColumns([]);

    if (!createForm.sqlDefinitionOrObjectName.trim()) {
      setError("Enter SQL definition or object name first.");
      return;
    }

    setDefinitionTestLoading(true);
    try {
      const res = await api.post("/datasources/test-definition", {
        datasourceType: createForm.datasourceType,
        sqlDefinitionOrObjectName: createForm.sqlDefinitionOrObjectName,
        pageSize: 10,
      });

      const preview = (res.data?.data ?? null) as PreviewResult | null;
      setDefinitionPreview(preview);

      const columns = (preview?.columns ?? []).map((columnName) => ({
        columnName,
        dataType: "string",
        isAllowed: true,
      }));

      setExtractedColumns(columns);
      setStatus(columns.length > 0 ? "Query executed and columns extracted." : "Query executed, but no columns were returned.");
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Failed to execute datasource test query."));
    } finally {
      setDefinitionTestLoading(false);
    }
  };

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("");
    setError("");

    if ((createForm.datasourceType === 1 || createForm.datasourceType === 2) && extractedColumns.length === 0) {
      setError("Run test query first so system can extract columns for reports.");
      return;
    }

    try {
      await api.post("/datasources", {
        name: createForm.name,
        code: createForm.code,
        description: createForm.description,
        datasourceType: createForm.datasourceType,
        sqlDefinitionOrObjectName: createForm.sqlDefinitionOrObjectName,
        connectionName: "DefaultConnection",
        parameters: [],
        allowedColumns: extractedColumns,
      });

      setStatus("Datasource created successfully.");
      setCreateForm({
        name: "",
        code: "",
        description: "",
        datasourceType: 1,
        sqlDefinitionOrObjectName: "",
      });
      setDefinitionPreview(null);
      setExtractedColumns([]);
      await loadData();
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Failed to create datasource."));
    }
  };

  const onAssignRole = async () => {
    setStatus("");
    setError("");

    try {
      await api.post("/datasources/assign-role", {
        datasourceId: assignment.datasourceId,
        roleId: assignment.roleId,
        canView: assignment.canView,
        canUse: assignment.canUse,
        canManage: assignment.canManage,
      });
      setStatus("Datasource role access updated.");
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Failed to assign datasource role access."));
    }
  };

  const onAssignUser = async () => {
    setStatus("");
    setError("");

    try {
      await api.post("/datasources/assign-user", {
        datasourceId: assignment.datasourceId,
        userId: assignment.userId,
        canView: assignment.canView,
        canUse: assignment.canUse,
        canManage: assignment.canManage,
      });
      setStatus("Datasource user access updated.");
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Failed to assign datasource user access."));
    }
  };

  return (
    <div className="stack datasourcePage">
      <section className="card">
        <h2>Create Datasource</h2>
        <form className="formGrid" onSubmit={onCreate}>
          <label>
            Name
            <input
              required
              value={createForm.name}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
            />
          </label>
          <label>
            Code
            <input
              required
              value={createForm.code}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, code: event.target.value }))}
            />
          </label>
          <label>
            Description
            <input
              required
              value={createForm.description}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, description: event.target.value }))}
            />
          </label>
          <label>
            Datasource Type
            <select
              value={createForm.datasourceType}
              onChange={(event) => {
                setCreateForm((prev) => ({ ...prev, datasourceType: Number(event.target.value) }));
                setDefinitionPreview(null);
                setExtractedColumns([]);
              }}
            >
              <option value={1}>SQL Query</option>
              <option value={2}>SQL View</option>
              <option value={3}>Stored Procedure</option>
            </select>
          </label>
          <label>
            SQL Definition / Object Name
            <textarea
              required
              rows={createForm.datasourceType === 1 ? 8 : 2}
              value={createForm.sqlDefinitionOrObjectName}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, sqlDefinitionOrObjectName: event.target.value }))}
            />
          </label>

          <button type="button" className="ghost" onClick={() => void onTestDefinition()} disabled={definitionTestLoading}>
            {definitionTestLoading ? "Executing..." : "Execute & Test Query"}
          </button>

          {definitionPreview ? (
            <div className="definitionPreviewBlock">
              <p>Test result: {definitionPreview.rows.length} rows previewed, {extractedColumns.length} columns extracted.</p>
              {extractedColumns.length > 0 ? <p>Extracted Columns: {extractedColumns.map((column) => column.columnName).join(", ")}</p> : null}
              {definitionPreview.columns.length > 0 ? (
                <div className="tablePanel fixedTablePanel definitionPreviewTablePanel">
                  <table className="table">
                    <thead>
                      <tr>
                        {definitionPreview.columns.map((column) => (
                          <th key={column}>{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {definitionPreview.rows.map((row, index) => (
                        <tr key={index}>
                          {definitionPreview.columns.map((column) => (
                            <td key={column}>{String(row[column] ?? "")}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}

          <button type="submit">Create Datasource</button>
        </form>
      </section>

      <section className="card">
        <h2>Datasource Access Assignment</h2>
        <div className="formGrid">
          <label>
            Datasource
            <select
              value={assignment.datasourceId}
              onChange={(event) => setAssignment((prev) => ({ ...prev, datasourceId: Number(event.target.value) }))}
            >
              {rows.map((datasource) => (
                <option key={datasource.id} value={datasource.id}>
                  {datasource.name} ({datasource.code})
                </option>
              ))}
            </select>
          </label>

          <div className="checkboxGrid">
            <label className="checkItem">
              <input
                type="checkbox"
                checked={assignment.canView}
                onChange={(event) => setAssignment((prev) => ({ ...prev, canView: event.target.checked }))}
              />
              Can View
            </label>
            <label className="checkItem">
              <input
                type="checkbox"
                checked={assignment.canUse}
                onChange={(event) => setAssignment((prev) => ({ ...prev, canUse: event.target.checked }))}
              />
              Can Use
            </label>
            <label className="checkItem">
              <input
                type="checkbox"
                checked={assignment.canManage}
                onChange={(event) => setAssignment((prev) => ({ ...prev, canManage: event.target.checked }))}
              />
              Can Manage
            </label>
          </div>

          <label>
            Role
            <select
              value={assignment.roleId}
              onChange={(event) => setAssignment((prev) => ({ ...prev, roleId: Number(event.target.value) }))}
            >
              {sortedRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name} ({role.code})
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => void onAssignRole()}>Assign Role Access</button>

          <label>
            User
            <select
              value={assignment.userId}
              onChange={(event) => setAssignment((prev) => ({ ...prev, userId: Number(event.target.value) }))}
            >
              {sortedUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.fullName} ({user.username})
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="ghost" onClick={() => void onAssignUser()}>Assign User Access</button>
        </div>
      </section>

      <section className="card">
        <h2>Allowed Datasources</h2>
        <div className="tablePanel">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Type</th>
                <th>Description</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.code}</td>
                  <td>{datasourceTypeLabels[r.datasourceType] ?? r.datasourceType}</td>
                  <td>{r.description}</td>
                  <td className="actionCell">
                    <button type="button" className="ghost smallButton" onClick={() => void loadPreview(r.id)}>
                      Preview
                    </button>
                    <button type="button" className="ghost smallButton" onClick={() => openEdit(r)}>
                      Edit
                    </button>
                    <button type="button" className="ghost smallButton danger" onClick={() => setDeleteTargetId(r.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Seed Data Preview</h2>
        <div className="formGrid">
          <label>
            Preview Datasource
            <select
              value={previewDatasourceId}
              onChange={(event) => {
                const id = Number(event.target.value);
                const selected = rows.find((row) => row.id === id) ?? null;
                setPreviewDatasourceId(id);
                setPreviewParameters(buildPreviewParams(selected));
              }}
            >
              {rows.map((datasource) => (
                <option key={datasource.id} value={datasource.id}>
                  {datasource.name} ({datasource.code})
                </option>
              ))}
            </select>
          </label>

          {previewDatasource?.parameters?.map((parameter) => (
            <label key={parameter.name}>
              {parameter.label || parameter.name}
              <input
                type={(parameter.dataType ?? "").toLowerCase().includes("date") ? "date" : "text"}
                required={parameter.isRequired}
                value={previewParameters[parameter.name] ?? ""}
                onChange={(event) =>
                  setPreviewParameters((prev) => ({
                    ...prev,
                    [parameter.name]: event.target.value,
                  }))
                }
              />
            </label>
          ))}

          <button type="button" onClick={() => void loadPreview(previewDatasourceId)}>
            Run Preview
          </button>
        </div>

        {previewLoading ? <p>Loading preview...</p> : null}
        {!previewLoading && previewData ? (
          <>
            <p>Showing {previewData.rows.length} rows from datasource preview. Total returned: {previewData.totalCount}</p>
            <div className="tablePanel fixedTablePanel seedPreviewTablePanel">
              <table className="table">
                <thead>
                  <tr>
                    {previewData.columns.map((column) => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.rows.map((row, index) => (
                    <tr key={index}>
                      {previewData.columns.map((column) => (
                        <td key={column}>{String(row[column] ?? "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
        {!previewLoading && !previewData && !error ? <p>Select a datasource preview to view seeded rows.</p> : null}
      </section>

      <InlineSnackbar message={status} type="success" onClose={() => setStatus("")} />
      <InlineSnackbar message={error} type="error" onClose={() => setError("")} />

      {/* Edit Modal */}
      {editTarget ? (
        <div className="modalOverlay" onClick={closeEdit}>
          <div className="modalPanel" onClick={(e) => e.stopPropagation()}>
            <h2>Edit Datasource — {editTarget.name}</h2>
            <div className="formGrid">
              <label>
                Name
                <input
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                />
              </label>
              <label>
                Description
                <input
                  required
                  value={editForm.description}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                />
              </label>
              <label>
                Datasource Type
                <select
                  value={editForm.datasourceType}
                  onChange={(e) => {
                    setEditForm((prev) => ({ ...prev, datasourceType: Number(e.target.value) }));
                    setEditDefinitionPreview(null);
                    setEditExtractedColumns([]);
                  }}
                >
                  <option value={1}>SQL Query</option>
                  <option value={2}>SQL View</option>
                  <option value={3}>Stored Procedure</option>
                </select>
              </label>
              <label>
                SQL Definition / Object Name
                <textarea
                  required
                  rows={editForm.datasourceType === 1 ? 8 : 2}
                  value={editForm.sqlDefinitionOrObjectName}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, sqlDefinitionOrObjectName: e.target.value }))}
                />
              </label>

              <button type="button" className="ghost" onClick={() => void onEditTestDefinition()} disabled={editDefinitionTestLoading}>
                {editDefinitionTestLoading ? "Executing..." : "Execute & Test Query"}
              </button>

              {editDefinitionPreview ? (
                <div className="definitionPreviewBlock">
                  <p>Test result: {editDefinitionPreview.rows.length} rows previewed, {editExtractedColumns.length} columns extracted.</p>
                  {editExtractedColumns.length > 0 ? <p>Columns: {editExtractedColumns.map((c) => c.columnName).join(", ")}</p> : null}
                </div>
              ) : null}

              <div className="modalActions">
                <button type="button" onClick={() => void onEditSave()}>Save Changes</button>
                <button type="button" className="ghost" onClick={closeEdit}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Delete Confirmation Modal */}
      {deleteTargetId !== null ? (
        <div className="modalOverlay" onClick={() => setDeleteTargetId(null)}>
          <div className="modalPanel confirmPanel" onClick={(e) => e.stopPropagation()}>
            <h2>Delete Datasource</h2>
            <p>Are you sure you want to delete this datasource? This action cannot be undone.</p>
            <div className="modalActions">
              <button type="button" className="danger" disabled={deleteLoading} onClick={() => void onDelete(deleteTargetId)}>
                {deleteLoading ? "Deleting..." : "Yes, Delete"}
              </button>
              <button type="button" className="ghost" onClick={() => setDeleteTargetId(null)}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
