"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import api from "@/lib/api";
import InlineSnackbar from "@/components/InlineSnackbar";

type SettingsPayload = {
  branding: {
    companyName: string;
    address: string;
    phone: string;
    email: string;
    footerText: string;
    companyLogoDataUrl: string | null;
  };
  datasource: {
    maskedExternalConnectionString: string | null;
    isUsingExternalConnection: boolean;
  };
  aiChat: {
    maskedApiKey: string | null;
    hasApiKey: boolean;
    plannerModel: string;
    responderModel: string;
    availableModels: string[];
  };
};

type DatasourceConnectionTestResult = {
  isSuccess: boolean;
  message: string;
  dataSource: string | null;
  database: string | null;
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

export default function SettingsPage() {
  const [company, setCompany] = useState("Contoso Holdings");
  const [address, setAddress] = useState("Main Boulevard, Lahore");
  const [phone, setPhone] = useState("+92-300-0000000");
  const [email, setEmail] = useState("info@contoso.local");
  const [footer, setFooter] = useState("Confidential - Internal Use");
  const [logoDataUrl, setLogoDataUrl] = useState<string>("");
  const [externalConnectionString, setExternalConnectionString] = useState("");
  const [maskedExternalConnectionString, setMaskedExternalConnectionString] = useState<string | null>(null);
  const [isUsingExternalConnection, setIsUsingExternalConnection] = useState(false);
  const [maskedApiKey, setMaskedApiKey] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [plannerModel, setPlannerModel] = useState("gpt-5.4");
  const [responderModel, setResponderModel] = useState("gpt-5.4-mini");
  const [availableModels, setAvailableModels] = useState<string[]>(["gpt-5.4", "gpt-5.4-mini"]);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingBranding, setSavingBranding] = useState(false);
  const [savingConnection, setSavingConnection] = useState(false);
  const [savingAi, setSavingAi] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await api.get("/settings");
        const payload = (res.data?.data ?? null) as SettingsPayload | null;
        if (payload) {
          setCompany(payload.branding.companyName || "");
          setAddress(payload.branding.address || "");
          setPhone(payload.branding.phone || "");
          setEmail(payload.branding.email || "");
          setFooter(payload.branding.footerText || "");
          setLogoDataUrl(payload.branding.companyLogoDataUrl || "");
          setMaskedExternalConnectionString(payload.datasource.maskedExternalConnectionString || null);
          setExternalConnectionString("");
          setIsUsingExternalConnection(payload.datasource.isUsingExternalConnection);
          setMaskedApiKey(payload.aiChat.maskedApiKey || null);
          setHasApiKey(payload.aiChat.hasApiKey);
          setPlannerModel(payload.aiChat.plannerModel || "gpt-5.4");
          setResponderModel(payload.aiChat.responderModel || "gpt-5.4-mini");
          setAvailableModels(payload.aiChat.availableModels?.length ? payload.aiChat.availableModels : ["gpt-5.4", "gpt-5.4-mini"]);
          setApiKeyInput("");
        }
      } catch (requestError: unknown) {
        setError(getErrorMessage(requestError, "Failed to load settings."));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const onLogoSelected = async (file: File | null) => {
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Only image files are allowed for company logo.");
      return;
    }

    const maxBytes = 1024 * 1024;
    if (file.size > maxBytes) {
      setError("Logo file must be 1MB or smaller.");
      return;
    }

    const nextLogo = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Failed to read logo file."));
      reader.readAsDataURL(file);
    });

    setLogoDataUrl(nextLogo);
  };

  const onSubmitBranding = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("");
    setError("");
    setSavingBranding(true);

    try {
      await api.put("/settings/branding", {
        companyName: company,
        address,
        phone,
        email,
        footerText: footer,
        companyLogoDataUrl: logoDataUrl || null,
      });

      setStatus("Branding settings saved.");
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Failed to save branding settings."));
    } finally {
      setSavingBranding(false);
    }
  };

  const onSubmitDatasourceConnection = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("");
    setError("");
    setSavingConnection(true);

    try {
      const res = await api.put("/settings/datasource-connection", {
        externalConnectionString: externalConnectionString || null,
        clearExternalConnectionString: false,
      });

      const payload = (res.data?.data ?? null) as SettingsPayload["datasource"] | null;
      if (payload) {
        setMaskedExternalConnectionString(payload.maskedExternalConnectionString || null);
        setExternalConnectionString("");
        setIsUsingExternalConnection(payload.isUsingExternalConnection);
      } else {
        setIsUsingExternalConnection(Boolean(externalConnectionString.trim()));
      }

      setStatus("Datasource connection settings saved.");
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Failed to save datasource connection settings."));
    } finally {
      setSavingConnection(false);
    }
  };

  const onClearDatasourceConnection = async () => {
    setStatus("");
    setError("");
    setSavingConnection(true);

    try {
      const res = await api.put("/settings/datasource-connection", {
        externalConnectionString: null,
        clearExternalConnectionString: true,
      });

      const payload = (res.data?.data ?? null) as SettingsPayload["datasource"] | null;
      setMaskedExternalConnectionString(payload?.maskedExternalConnectionString ?? null);
      setExternalConnectionString("");
      setIsUsingExternalConnection(payload?.isUsingExternalConnection ?? false);
      setStatus("External datasource connection removed. Default DB is now active.");
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Failed to clear datasource connection settings."));
    } finally {
      setSavingConnection(false);
    }
  };

  const onTestDatasourceConnection = async () => {
    setStatus("");
    setError("");
    setTestingConnection(true);

    try {
      const res = await api.post("/settings/datasource-connection/test", {
        externalConnectionString: externalConnectionString.trim() || null,
      });

      const result = (res.data?.data ?? null) as DatasourceConnectionTestResult | null;
      if (!result) {
        setError("Connection test failed to return a result.");
        return;
      }

      if (result.isSuccess) {
        const endpointText = [result.dataSource, result.database].filter(Boolean).join(" / ");
        setStatus(endpointText ? `${result.message} (${endpointText})` : result.message);
      } else {
        setError(result.message);
      }
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Failed to test datasource connection."));
    } finally {
      setTestingConnection(false);
    }
  };

  const onSubmitAiSettings = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("");
    setError("");
    setSavingAi(true);

    try {
      const res = await api.put("/settings/ai-chat", {
        apiKey: apiKeyInput.trim() || null,
        clearApiKey: false,
        plannerModel,
        responderModel,
      });

      const payload = (res.data?.data ?? null) as SettingsPayload["aiChat"] | null;
      if (payload) {
        setMaskedApiKey(payload.maskedApiKey || null);
        setHasApiKey(payload.hasApiKey);
        setPlannerModel(payload.plannerModel || "gpt-5.4");
        setResponderModel(payload.responderModel || "gpt-5.4-mini");
        setAvailableModels(payload.availableModels?.length ? payload.availableModels : availableModels);
      }

      setApiKeyInput("");
      setStatus("AI chat settings saved.");
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Failed to save AI chat settings."));
    } finally {
      setSavingAi(false);
    }
  };

  const onClearAiKey = async () => {
    setStatus("");
    setError("");
    setSavingAi(true);

    try {
      const res = await api.put("/settings/ai-chat", {
        apiKey: null,
        clearApiKey: true,
        plannerModel,
        responderModel,
      });

      const payload = (res.data?.data ?? null) as SettingsPayload["aiChat"] | null;
      setMaskedApiKey(payload?.maskedApiKey ?? null);
      setHasApiKey(payload?.hasApiKey ?? false);
      setApiKeyInput("");
      setStatus("AI API key removed.");
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Failed to clear AI API key."));
    } finally {
      setSavingAi(false);
    }
  };

  if (loading) {
    return (
      <div className="card">
        <p>Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <section className="card">
        <h2>Branding Defaults</h2>
        <form className="formGrid" onSubmit={onSubmitBranding}>
          <label>Company Name<input value={company} onChange={(e) => setCompany(e.target.value)} required /></label>
          <label>Address<input value={address} onChange={(e) => setAddress(e.target.value)} required /></label>
          <label>Phone<input value={phone} onChange={(e) => setPhone(e.target.value)} required /></label>
          <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Footer Text<input value={footer} onChange={(e) => setFooter(e.target.value)} required /></label>
          <label>
            Company Logo
            <input type="file" accept="image/*" onChange={(event) => void onLogoSelected(event.target.files?.[0] ?? null)} />
          </label>
          {logoDataUrl ? <Image src={logoDataUrl} alt="Company logo preview" className="reportLogo" width={180} height={180} unoptimized /> : <p>No logo selected.</p>}
          <button type="submit" disabled={savingBranding}>{savingBranding ? "Saving..." : "Save Branding"}</button>
        </form>
      </section>

      <section className="card">
        <h2>Datasource Connection</h2>
        <form className="formGrid" onSubmit={onSubmitDatasourceConnection}>
          <label>
            Currently Configured Connection
            <input value={maskedExternalConnectionString ?? "Not configured"} readOnly />
          </label>
          <label>
            New External SQL Connection String (optional)
            <textarea
              rows={4}
              value={externalConnectionString}
              onChange={(event) => setExternalConnectionString(event.target.value)}
              placeholder="Server=...;Database=...;User Id=...;Password=...;TrustServerCertificate=True;"
            />
          </label>
          <p>{isUsingExternalConnection ? "External DB is active for datasource/report runtime." : "Default reporting DB is active."}</p>
          <div className="actions">
            <button type="button" className="ghost" onClick={() => void onTestDatasourceConnection()} disabled={testingConnection || savingConnection}>
              {testingConnection ? "Testing..." : "Test Connection"}
            </button>
            <button type="submit" disabled={savingConnection || testingConnection}>{savingConnection ? "Saving..." : "Save Connection"}</button>
            <button type="button" className="danger" onClick={() => void onClearDatasourceConnection()} disabled={savingConnection || testingConnection || !isUsingExternalConnection}>
              Clear External Connection
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="settingsSectionHeader">
          <div>
            <h2>Nexa AI Chat</h2>
            <p>Configure the OpenAI key plus the deep-think planner model and lite responder model used by the floating chatbot.</p>
          </div>
        </div>
        <form className="formGrid" onSubmit={onSubmitAiSettings}>
          <label>
            Stored API Key
            <input value={maskedApiKey ?? "Not configured"} readOnly />
          </label>
          <label>
            New OpenAI API Key (optional)
            <input
              type="password"
              value={apiKeyInput}
              onChange={(event) => setApiKeyInput(event.target.value)}
              placeholder="sk-..."
            />
          </label>
          <div className="settingsModelGrid">
            <label>
              Planner Model (Deep Think)
              <select value={plannerModel} onChange={(event) => setPlannerModel(event.target.value)}>
                {availableModels.map((model) => <option key={`planner-${model}`} value={model}>{model}</option>)}
              </select>
            </label>
            <label>
              Responder Model (Lite)
              <select value={responderModel} onChange={(event) => setResponderModel(event.target.value)}>
                {availableModels.map((model) => <option key={`responder-${model}`} value={model}>{model}</option>)}
              </select>
            </label>
          </div>
          <p>
            Default cost profile uses <strong>gpt-5.4</strong> for datasource planning and <strong>gpt-5.4-mini</strong> for streamed answers.
            Nexa only queries datasources already accessible to the logged-in user.
          </p>
          <div className="actions">
            <button type="submit" disabled={savingAi}>{savingAi ? "Saving..." : "Save AI Settings"}</button>
            <button type="button" className="danger" onClick={() => void onClearAiKey()} disabled={savingAi || !hasApiKey}>
              Clear API Key
            </button>
          </div>
        </form>
      </section>

      <InlineSnackbar message={status} type="success" onClose={() => setStatus("")} />
      <InlineSnackbar message={error} type="error" onClose={() => setError("")} />
    </div>
  );
}
