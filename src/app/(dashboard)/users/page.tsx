"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import InlineSnackbar from "@/components/InlineSnackbar";

type Role = {
  id: number;
  name: string;
  code: string;
};

type UserRow = {
  id: number;
  username: string;
  email: string;
  fullName: string;
  isActive: boolean;
  roles: string[];
};

const defaultForm = {
  username: "",
  email: "",
  fullName: "",
  password: "",
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<number[]>([]);
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const sortedRoles = useMemo(() => [...roles].sort((a, b) => a.name.localeCompare(b.name)), [roles]);

  const loadPageData = async () => {
    setLoading(true);
    setError("");
    try {
      const [usersRes, rolesRes] = await Promise.all([
        api.get("/users?pageNumber=1&pageSize=200"),
        api.get("/admin/roles"),
      ]);

      setUsers((usersRes.data?.data?.items ?? []) as UserRow[]);
      setRoles((rolesRes.data?.data ?? []) as Role[]);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.errors?.[0] ?? "Failed to load users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPageData();
  }, []);

  const onCreateUser = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("");
    setError("");

    if (selectedRoles.length === 0) {
      setError("Select at least one role for the user.");
      return;
    }

    try {
      await api.post("/users", {
        username: form.username,
        email: form.email,
        fullName: form.fullName,
        password: form.password,
        roleIds: selectedRoles,
      });

      setForm(defaultForm);
      setSelectedRoles([]);
      setStatus("User created successfully.");
      await loadPageData();
    } catch (requestError: any) {
      setError(requestError?.response?.data?.errors?.[0] ?? "Failed to create user.");
    }
  };

  const onToggleStatus = async (user: UserRow) => {
    setStatus("");
    setError("");
    try {
      await api.patch(`/users/${user.id}/status?isActive=${!user.isActive}`);
      setStatus(`Updated status for ${user.username}.`);
      await loadPageData();
    } catch (requestError: any) {
      setError(requestError?.response?.data?.errors?.[0] ?? "Failed to update status.");
    }
  };

  const toggleRole = (roleId: number) => {
    setSelectedRoles((prev) => prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]);
  };

  return (
    <div className="stack">
      <section className="card">
        <h2>Create User</h2>
        <form className="formGrid" onSubmit={onCreateUser}>
          <label>
            Username
            <input
              required
              value={form.username}
              onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
            />
          </label>

          <label>
            Full Name
            <input
              required
              value={form.fullName}
              onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
            />
          </label>

          <label>
            Email
            <input
              required
              type="email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            />
          </label>

          <label>
            Password
            <input
              required
              type="password"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
            />
          </label>

          <div>
            <strong>Assign Roles</strong>
            <div className="checkboxGrid">
              {sortedRoles.map((role) => (
                <label key={role.id} className="checkItem">
                  <input
                    type="checkbox"
                    checked={selectedRoles.includes(role.id)}
                    onChange={() => toggleRole(role.id)}
                  />
                  {role.name} ({role.code})
                </label>
              ))}
            </div>
          </div>

          <button type="submit">Create User</button>
        </form>
      </section>

      <section className="card">
        <h2>Users</h2>
        {loading ? <p>Loading users...</p> : null}
        <table className="table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Name</th>
              <th>Email</th>
              <th>Roles</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.username}</td>
                <td>{user.fullName}</td>
                <td>{user.email}</td>
                <td>{user.roles.join(", ")}</td>
                <td>{user.isActive ? "Active" : "Inactive"}</td>
                <td className="actions">
                  <button type="button" className="ghost" onClick={() => void onToggleStatus(user)}>
                    {user.isActive ? "Deactivate" : "Activate"}
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
