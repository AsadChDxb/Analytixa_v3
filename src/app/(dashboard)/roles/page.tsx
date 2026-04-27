"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import api from "@/lib/api";

type Role = {
  id: number;
  name: string;
  code: string;
  description: string;
};

type Permission = {
  id: number;
  name: string;
  code: string;
  description: string;
};

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<number[]>([]);
  const [newRole, setNewRole] = useState({ name: "", code: "", description: "" });
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const sortedPermissions = useMemo(
    () => [...permissions].sort((a, b) => a.name.localeCompare(b.name)),
    [permissions]
  );

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === selectedRoleId) ?? null,
    [roles, selectedRoleId]
  );

  const loadData = async () => {
    setError("");
    try {
      const [rolesRes, permissionsRes] = await Promise.all([
        api.get("/admin/roles"),
        api.get("/admin/permissions"),
      ]);

      const roleRows = (rolesRes.data?.data ?? []) as Role[];
      setRoles(roleRows);
      setPermissions((permissionsRes.data?.data ?? []) as Permission[]);

      if (roleRows.length > 0 && selectedRoleId === null) {
        setSelectedRoleId(roleRows[0].id);
      }
    } catch (requestError: any) {
      setError(requestError?.response?.data?.errors?.[0] ?? "Failed to load roles.");
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!selectedRoleId) {
      setSelectedPermissionIds([]);
      return;
    }

    const loadRolePermissions = async () => {
      setError("");
      try {
        const res = await api.get(`/admin/roles/${selectedRoleId}/permissions`);
        setSelectedPermissionIds((res.data?.data?.permissionIds ?? []) as number[]);
      } catch (requestError: any) {
        setError(requestError?.response?.data?.errors?.[0] ?? "Failed to load role permissions.");
      }
    };

    void loadRolePermissions();
  }, [selectedRoleId]);

  const onCreateRole = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("");
    setError("");

    try {
      await api.post("/admin/roles", {
        name: newRole.name,
        code: newRole.code,
        description: newRole.description,
      });
      setStatus("Role created successfully.");
      setNewRole({ name: "", code: "", description: "" });
      await loadData();
    } catch (requestError: any) {
      setError(requestError?.response?.data?.errors?.[0] ?? "Failed to create role.");
    }
  };

  const togglePermission = (permissionId: number) => {
    setSelectedPermissionIds((prev) =>
      prev.includes(permissionId) ? prev.filter((id) => id !== permissionId) : [...prev, permissionId]
    );
  };

  const onSavePermissions = async () => {
    if (!selectedRoleId) {
      return;
    }

    setStatus("");
    setError("");

    try {
      await api.put(`/admin/roles/${selectedRoleId}/permissions`, {
        permissionIds: selectedPermissionIds,
      });
      setStatus("Role permissions updated.");
    } catch (requestError: any) {
      setError(requestError?.response?.data?.errors?.[0] ?? "Failed to update role permissions.");
    }
  };

  return (
    <div className="stack">
      <section className="card">
        <h2>Create Role</h2>
        <form className="formGrid" onSubmit={onCreateRole}>
          <label>
            Role Name
            <input
              required
              value={newRole.name}
              onChange={(event) => setNewRole((prev) => ({ ...prev, name: event.target.value }))}
            />
          </label>
          <label>
            Role Code
            <input
              required
              value={newRole.code}
              onChange={(event) => setNewRole((prev) => ({ ...prev, code: event.target.value }))}
            />
          </label>
          <label>
            Description
            <input
              required
              value={newRole.description}
              onChange={(event) => setNewRole((prev) => ({ ...prev, description: event.target.value }))}
            />
          </label>
          <button type="submit">Create Role</button>
        </form>
      </section>

      <section className="card">
        <h2>Role Permissions</h2>
        <label>
          Select Role
          <select
            value={selectedRoleId ?? ""}
            onChange={(event) => setSelectedRoleId(Number(event.target.value))}
          >
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name} ({role.code})
              </option>
            ))}
          </select>
        </label>

        {selectedRole ? (
          <p>
            Editing permissions for <strong>{selectedRole.name}</strong>
          </p>
        ) : null}

        <div className="checkboxGrid">
          {sortedPermissions.map((permission) => (
            <label key={permission.id} className="checkItem">
              <input
                type="checkbox"
                checked={selectedPermissionIds.includes(permission.id)}
                onChange={() => togglePermission(permission.id)}
              />
              {permission.name} ({permission.code})
            </label>
          ))}
        </div>

        <div className="actions">
          <button type="button" onClick={() => void onSavePermissions()}>
            Save Permissions
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Existing Roles</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Code</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.id}>
                <td>{role.name}</td>
                <td>{role.code}</td>
                <td>{role.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {status && <p className="ok">{status}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
