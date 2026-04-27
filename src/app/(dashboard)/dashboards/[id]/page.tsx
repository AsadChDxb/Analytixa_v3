"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import InlineSnackbar from "@/components/InlineSnackbar";
import DashboardSurface from "@/components/dashboard/DashboardSurface";
import { DashboardDefinition, normalizeDashboardDefinition } from "@/lib/dashboardBuilder";

type DashboardResponse = {
  id: number;
  name: string;
  code: string;
  description: string;
  datasourceId: number;
  definition: unknown;
};

type PreviewResponse = {
  rows: Array<Record<string, unknown>>;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error !== "object" || error === null) {
    return fallback;
  }

  const maybeAxiosError = error as {
    response?: {
      data?: {
        errors?: string[];
        message?: string;
      };
    };
  };

  return maybeAxiosError.response?.data?.errors?.[0] ?? maybeAxiosError.response?.data?.message ?? fallback;
};

export default function DashboardDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const dashboardId = Number(params.id);
  const invalidDashboardId = !Number.isFinite(dashboardId) || dashboardId <= 0;
  const [dashboardName, setDashboardName] = useState("");
  const [dashboardDescription, setDashboardDescription] = useState("");
  const [datasourceId, setDatasourceId] = useState<number>(0);
  const [definition, setDefinition] = useState<DashboardDefinition>({ filters: [], widgets: [], theme: { palette: [] } });
  const [rowsByDatasource, setRowsByDatasource] = useState<Record<number, Array<Record<string, unknown>>>>({});
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    const dashboardRes = await api.get(`/dashboards/${dashboardId}`);
    const dashboard = (dashboardRes.data?.data ?? null) as DashboardResponse | null;
    if (!dashboard) {
      throw new Error("Dashboard not found.");
    }

    const normalizedDefinition = normalizeDashboardDefinition(dashboard.definition);
    const datasourceIds = new Set<number>([dashboard.datasourceId]);
    normalizedDefinition.widgets.forEach((widget) => {
      const id = widget.config.datasourceId ?? dashboard.datasourceId;
      if (id && Number.isFinite(id)) {
        datasourceIds.add(id);
      }
    });

    const previews = await Promise.all(
      Array.from(datasourceIds).map(async (id) => {
        try {
          const previewRes = await api.post("/datasources/run", {
            datasourceId: id,
            parameters: {},
            pageNumber: 1,
            pageSize: 300,
          });
          const preview = (previewRes.data?.data ?? null) as PreviewResponse | null;
          return [id, preview?.rows ?? []] as const;
        } catch {
          return [id, []] as const;
        }
      })
    );

    const rowsMap = Object.fromEntries(previews) as Record<number, Array<Record<string, unknown>>>;
    return {
      dashboard,
      normalizedDefinition,
      rowsByDatasource: rowsMap,
    };
  };

  const applyDashboardData = (
    dashboard: DashboardResponse,
    normalizedDefinition: DashboardDefinition,
    previewRowsByDatasource: Record<number, Array<Record<string, unknown>>>
  ) => {
    setDashboardName(dashboard.name);
    setDashboardDescription(dashboard.description);
    setDatasourceId(dashboard.datasourceId);
    setDefinition(normalizedDefinition);
    setRowsByDatasource(previewRowsByDatasource);
    const totalRows = Object.values(previewRowsByDatasource).reduce((acc, rows) => acc + rows.length, 0);
    setStatus(totalRows === 0 ? "Dashboard loaded with no datasource rows." : `Dashboard refreshed with ${totalRows} rows.`);
  };

  const refreshDashboard = async () => {
    setLoading(true);
    setError("");

    try {
      const { dashboard, normalizedDefinition, rowsByDatasource: previewRowsByDatasource } = await fetchDashboardData();
      applyDashboardData(dashboard, normalizedDefinition, previewRowsByDatasource);
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Failed to load dashboard."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (invalidDashboardId) {
      return;
    }

    let isActive = true;
    setError("");

    void fetchDashboardData()
      .then(({ dashboard, normalizedDefinition, rowsByDatasource: previewRowsByDatasource }) => {
        if (!isActive) {
          return;
        }

        applyDashboardData(dashboard, normalizedDefinition, previewRowsByDatasource);
      })
      .catch((requestError: unknown) => {
        if (!isActive) {
          return;
        }

        setError(getErrorMessage(requestError, "Failed to load dashboard."));
      })
      .finally(() => {
        if (isActive) {
          setLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [dashboardId, invalidDashboardId]);

  return (
    <div className="stack dashboardViewPage">
      <section className="card dashboardListHero burst">
        <div className="actionBarWrap">
          <div>
            <p className="dashboardKicker">Dashboard View</p>
            <h2>{dashboardName || "Dashboard"}</h2>
            <p className="dashboardSub">Datasource #{datasourceId || 0} connected for live dashboard rendering.</p>
          </div>
          <div className="actionBarRight dashboardBuilderActions">
            <button type="button" className="ghost" onClick={() => router.push("/dashboards")}>Back to My Dashboards</button>
            <button type="button" className="ghost" onClick={() => router.push(`/dashboard-builder?id=${dashboardId}`)}>Edit Dashboard</button>
            <button type="button" onClick={() => void refreshDashboard()} disabled={loading}>{loading ? "Refreshing..." : "Refresh"}</button>
          </div>
        </div>
      </section>

      <DashboardSurface
        dashboardName={dashboardName}
        dashboardDescription={dashboardDescription}
        definition={definition}
        rowsByDatasource={rowsByDatasource}
        defaultDatasourceId={datasourceId}
        emptyMessage={loading ? "Loading dashboard data..." : "No datasource rows available for this widget."}
        showHeader={false}
      />

      <InlineSnackbar message={status} type="success" onClose={() => setStatus("")} />
      <InlineSnackbar message={invalidDashboardId ? "Invalid dashboard id." : error} type="error" onClose={() => setError("")} />
    </div>
  );
}