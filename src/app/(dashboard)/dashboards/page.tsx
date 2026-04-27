"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import InlineSnackbar from "@/components/InlineSnackbar";

type DashboardListItem = {
  id: number;
  name: string;
  code: string;
  description: string;
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

export default function DashboardsPage() {
  const router = useRouter();
  const [dashboards, setDashboards] = useState<DashboardListItem[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [deleteLoadingDashboardId, setDeleteLoadingDashboardId] = useState<number | null>(null);

  const loadDashboards = async () => {
    const res = await api.get("/dashboards/my?pageNumber=1&pageSize=50000");
    setDashboards(res.data?.data?.items ?? []);
  };

  useEffect(() => {
    void (async () => {
      setError("");
      try {
        await loadDashboards();
      } catch (requestError: unknown) {
        setError(getErrorMessage(requestError, "Failed to load dashboards."));
      }
    })();
  }, []);

  const onDeleteDashboard = async (dashboard: DashboardListItem) => {
    setDeleteLoadingDashboardId(dashboard.id);
    setStatus("");
    setError("");

    try {
      await api.delete(`/dashboards/${dashboard.id}`);
      setStatus("Dashboard deleted.");
      await loadDashboards();
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Failed to delete dashboard."));
    } finally {
      setDeleteLoadingDashboardId(null);
    }
  };

  return (
    <div className="stack">
      <section className="card dashboardListHero burst">
        <div className="actionBarWrap">
          <div>
            <p className="dashboardKicker">Saved Dashboards</p>
            <h2>My Dashboards</h2>
            <p className="dashboardSub">Open, review, or edit your saved KPI boards and chart collections.</p>
          </div>
          <div className="actionBarRight">
            <button type="button" onClick={() => router.push("/dashboard-builder")}>Create Dashboard</button>
          </div>
        </div>
      </section>

      <section className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Code</th>
              <th>Description</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {dashboards.map((dashboard) => (
              <tr key={dashboard.id}>
                <td>{dashboard.name}</td>
                <td>{dashboard.code}</td>
                <td>{dashboard.description}</td>
                <td className="actions">
                  <button type="button" className="ghost" onClick={() => router.push(`/dashboards/${dashboard.id}`)}>View</button>
                  <button type="button" className="ghost" onClick={() => router.push(`/dashboard-builder?id=${dashboard.id}`)}>Edit</button>
                  <button
                    type="button"
                    className="danger"
                    disabled={deleteLoadingDashboardId === dashboard.id}
                    onClick={() => void onDeleteDashboard(dashboard)}
                  >
                    {deleteLoadingDashboardId === dashboard.id ? "Deleting..." : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <InlineSnackbar message={status} type="success" onClose={() => setStatus("")} />
      <InlineSnackbar message={error} type="error" onClose={() => setError("")} />
    </div>
  );
}