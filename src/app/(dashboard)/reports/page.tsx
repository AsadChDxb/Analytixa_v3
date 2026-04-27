"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import InlineSnackbar from "@/components/InlineSnackbar";

type Report = {
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

export default function ReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [runLoadingReportId, setRunLoadingReportId] = useState<number | null>(null);
  const [deleteLoadingReportId, setDeleteLoadingReportId] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const loadReports = async () => {
    setError("");
    const res = await api.get("/reports/my?pageNumber=1&pageSize=50000");
    setReports(res.data?.data?.items ?? []);
  };

  useEffect(() => {
    void (async () => {
      setError("");
      try {
        await loadReports();
      } catch (requestError: unknown) {
        setError(getErrorMessage(requestError, "Failed to load reports."));
      }
    })();
  }, []);

  const onRunReport = async (report: Report) => {
    setRunLoadingReportId(report.id);
    router.push(`/reports/${report.id}?autorun=1`);
  };

  const onEditReport = (report: Report) => {
    router.push(`/report-builder?reportId=${report.id}`);
  };

  const onDeleteReport = async (report: Report) => {
    setStatus("");
    setError("");
    setDeleteLoadingReportId(report.id);

    try {
      await api.delete(`/reports/${report.id}`);
      setStatus("Report deleted.");
      await loadReports();
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Failed to delete report."));
    } finally {
      setDeleteLoadingReportId(null);
    }
  };

  return (
    <div className="stack">
      <section className="card">
        <h2>My Reports</h2>
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
            {reports.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.code}</td>
                <td>{r.description}</td>
                <td className="actions">
                  <button
                    type="button"
                    className="ghost"
                    disabled={runLoadingReportId === r.id}
                    onClick={() => void onRunReport(r)}
                  >
                    {runLoadingReportId === r.id ? "Running..." : "Run"}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => onEditReport(r)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="danger"
                    disabled={deleteLoadingReportId === r.id}
                    onClick={() => void onDeleteReport(r)}
                  >
                    {deleteLoadingReportId === r.id ? "Deleting..." : "Delete"}
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
