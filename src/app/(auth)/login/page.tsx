"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { saveSession } from "@/lib/auth";
import InlineSnackbar from "@/components/InlineSnackbar";

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

export default function LoginPage() {
  const router = useRouter();
  const [usernameOrEmail, setUsernameOrEmail] = useState("admin");
  const [password, setPassword] = useState("Admin@12345");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await api.post("/auth/login", { usernameOrEmail, password });
      const payload = res.data.data;
      saveSession({
        accessToken: payload.accessToken,
        refreshToken: payload.refreshToken,
        user: {
          userId: payload.userId,
          username: payload.username,
          fullName: payload.fullName,
          roles: payload.roles,
          permissions: payload.permissions,
        },
      });
      router.push("/dashboard");
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Login failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="authWrap">
      <div className="authBubbles" aria-hidden>
        <span className="authBubble authBubbleOne" />
        <span className="authBubble authBubbleTwo" />
        <span className="authBubble authBubbleThree" />
        <span className="authBubble authBubbleFour" />
      </div>
      <div className="authCard">
        <p className="authKicker">Enterprise Reports</p>
        <h1>Analytixa</h1>
        <p className="authSubtitle">Sign in to continue your reporting workflow.</p>
        <form onSubmit={onSubmit} className="formGrid">
          <label>
            Username or Email
            <input value={usernameOrEmail} onChange={(e) => setUsernameOrEmail(e.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <button type="submit" disabled={loading}>{loading ? "Signing in..." : "Sign In"}</button>
        </form>
        <InlineSnackbar message={error} type="error" onClose={() => setError("")} />
      </div>
    </div>
  );
}
