"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { buildApiUrl, getAccessToken } from "@/lib/api";

type ChatSessionSummary = {
  id: number;
  title: string;
  updatedAt: string;
  lastMessagePreview: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  isThinking?: boolean;
  traceData?: TraceData | null;
};

type TraceData = {
  datasourceName?: string | null;
  datasourceCode?: string | null;
  datasourcePurpose?: string | null;
  plannerReason?: string | null;
  queryPlanReason?: string | null;
  queryConfidence?: number | null;
  generatedSql?: string | null;
  usedAgentQuery?: boolean;
  plannerModel?: string | null;
  responderModel?: string | null;
};

type ChatSessionDetail = {
  id: number;
  title: string;
  updatedAt: string;
  messages: Array<{
    id: number;
    role: "user" | "assistant";
    content: string;
    createdAt: string;
    metadataJson?: string | null;
  }>;
};

type StreamEvent = {
  type: "meta" | "delta" | "done" | "error" | "trace";
  trace?: TraceData | null;
  content?: string | null;
  sessionId?: number | null;
  sessionTitle?: string | null;
};

type RawStreamEvent = StreamEvent & {
  Type?: StreamEvent["type"];
  Content?: string | null;
  SessionId?: number | null;
  SessionTitle?: string | null;
  Trace?: TraceData | null;
};

function normalizeStreamEvent(eventPayload: RawStreamEvent): StreamEvent {
  return {
    type: eventPayload.type ?? eventPayload.Type ?? "error",
    content: eventPayload.content ?? eventPayload.Content,
    sessionId: eventPayload.sessionId ?? eventPayload.SessionId,
    sessionTitle: eventPayload.sessionTitle ?? eventPayload.SessionTitle,
    trace: eventPayload.trace ?? eventPayload.Trace,
  };
}

function parseTraceData(value: unknown): TraceData | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as TraceData;
}

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const timeZoneLabelFormatter = new Intl.DateTimeFormat(undefined, {
  timeZoneName: "short",
});

const hasExplicitTimeZone = (value: string) => /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);

const parseChatTimestamp = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return new Date();
  }

  const normalized = trimmed.includes("T") && !hasExplicitTimeZone(trimmed)
    ? `${trimmed}Z`
    : trimmed;

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? new Date(trimmed) : parsed;
};

const formatChatTimestamp = (value: string) => {
  const parsed = parseChatTimestamp(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return dateTimeFormatter.format(parsed);
};

const localTimeZoneLabel = (() => {
  const part = timeZoneLabelFormatter
    .formatToParts(new Date())
    .find((item) => item.type === "timeZoneName");
  return part?.value ?? "Local";
})();

function createTempId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 100000)}`;
}

export default function NexaChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [activeTitle, setActiveTitle] = useState("Nexa");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [hasUnreadPulse, setHasUnreadPulse] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const streamAbortControllerRef = useRef<AbortController | null>(null);
  const activeAssistantMessageIdRef = useRef<string | null>(null);
  const [tracePopupId, setTracePopupId] = useState<string | null>(null);

  const canSend = draft.trim().length > 0 && !sending;

  function stopStreaming() {
    streamAbortControllerRef.current?.abort();
    streamAbortControllerRef.current = null;
    setSending(false);

    const activeAssistantId = activeAssistantMessageIdRef.current;
    if (activeAssistantId) {
      setMessages((current) => current.map((message) => (
        message.id === activeAssistantId
          ? { ...message, isThinking: false }
          : message
      )));
    }

    activeAssistantMessageIdRef.current = null;
  }

  useEffect(() => {
    if (!scrollRef.current) {
      return;
    }

    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isOpen]);

  useEffect(() => {
    return () => {
      streamAbortControllerRef.current?.abort();
      streamAbortControllerRef.current = null;
      activeAssistantMessageIdRef.current = null;
    };
  }, []);

  const sessionCountLabel = useMemo(() => {
    if (sessions.length === 0) {
      return "Fresh workspace";
    }

    return `${sessions.length} saved ${sessions.length === 1 ? "thread" : "threads"}`;
  }, [sessions.length]);

  async function openPanel() {
    setHasUnreadPulse(false);
    setIsOpen(true);
    await loadSessions();
  }

  function closePanel() {
    setIsOpen(false);
  }

  async function loadSessions() {
    setLoadingSessions(true);
    setError("");

    try {
      const token = getAccessToken();
      const response = await fetch(buildApiUrl("/ai-chat/sessions?take=12"), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        throw new Error("Failed to load chat history.");
      }

      const payload = (await response.json()) as ChatSessionSummary[];
      setSessions(payload);

      if (!activeSessionId && payload.length > 0) {
        void openSession(payload[0].id, false);
      }
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load chat history.");
    } finally {
      setLoadingSessions(false);
    }
  }

  async function openSession(sessionId: number, shouldOpenPanel = true) {
    if (shouldOpenPanel) {
      setHasUnreadPulse(false);
      setIsOpen(true);
    }

    setLoadingMessages(true);
    setError("");

    try {
      const token = getAccessToken();
      const response = await fetch(buildApiUrl(`/ai-chat/sessions/${sessionId}`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        throw new Error("Failed to load chat session.");
      }

      const payload = (await response.json()) as ChatSessionDetail;
      setActiveSessionId(payload.id);
      setActiveTitle(payload.title || "Nexa");
      setMessages(payload.messages.map((message) => {
        let traceData: TraceData | null = null;
        if (message.metadataJson) {
          try {
            traceData = parseTraceData(JSON.parse(message.metadataJson) as unknown);
          } catch {
            traceData = null;
          }
        }

        return {
          id: `server-${message.id}`,
          role: message.role,
          content: message.content,
          createdAt: message.createdAt,
          traceData,
        };
      }));
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load chat session.");
    } finally {
      setLoadingMessages(false);
    }
  }

  async function deleteSession(sessionId: number) {
    setError("");
    try {
      const token = getAccessToken();
      const response = await fetch(buildApiUrl(`/ai-chat/sessions/${sessionId}`), {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        throw new Error("Failed to delete chat session.");
      }

      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
        setActiveTitle("Nexa");
        setMessages([]);
      }

      setSessions((current) => current.filter((session) => session.id !== sessionId));
      await loadSessions();
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Failed to delete chat session.");
    }
  }

  function startNewChat() {
    setHasUnreadPulse(false);
    setActiveSessionId(null);
    setActiveTitle("Nexa");
    setMessages([]);
    setDraft("");
    setError("");
    setIsOpen(true);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSend) {
      return;
    }

    const text = draft.trim();
    const userId = createTempId("user");
    const assistantId = createTempId("assistant");
    const createdAt = new Date().toISOString();

    setDraft("");
    setError("");
    setSending(true);
    activeAssistantMessageIdRef.current = assistantId;
    setMessages((current) => [
      ...current,
      { id: userId, role: "user", content: text, createdAt },
      { id: assistantId, role: "assistant", content: "", createdAt, isThinking: true },
    ]);

    try {
      const controller = new AbortController();
      streamAbortControllerRef.current = controller;
      const token = getAccessToken();
      const response = await fetch(buildApiUrl("/ai-chat/stream"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
        body: JSON.stringify({
          sessionId: activeSessionId,
          message: text,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Chat request failed.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let nextSessionId = activeSessionId;
      let nextSessionTitle = activeTitle;

      const applyEvent = async (eventPayload: StreamEvent) => {
        if (eventPayload.type === "meta") {
          if (eventPayload.sessionId) {
            nextSessionId = eventPayload.sessionId;
            setActiveSessionId(eventPayload.sessionId);
          }

          if (eventPayload.sessionTitle) {
            nextSessionTitle = eventPayload.sessionTitle;
            setActiveTitle(eventPayload.sessionTitle);
          }

          return;
        }

        if (eventPayload.type === "delta") {
          const chunk = eventPayload.content ?? "";
          setMessages((current) => current.map((message) => (
            message.id === assistantId
              ? { ...message, content: `${message.content}${chunk}`, isThinking: false }
              : message
          )));
          return;
        }

        if (eventPayload.type === "error") {
          const errorMessage = eventPayload.content ?? "Chat request failed.";
          setError(errorMessage);
          setMessages((current) => current.map((message) => (
            message.id === assistantId
              ? { ...message, content: errorMessage, isThinking: false }
              : message
          )));
          return;
        }

        if (eventPayload.type === "done") {
          setMessages((current) => current.map((message) => (
            message.id === assistantId
              ? { ...message, isThinking: false }
              : message
          )));
          activeAssistantMessageIdRef.current = null;
          return;
        }

        if (eventPayload.type === "trace") {
          const traceData = parseTraceData(eventPayload.trace);
          if (!traceData) {
            return;
          }

          setMessages((current) => current.map((message) => (
            message.id === assistantId
              ? { ...message, traceData }
              : message
          )));
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            continue;
          }

          await applyEvent(normalizeStreamEvent(JSON.parse(trimmed) as RawStreamEvent));
        }
      }

      if (buffer.trim()) {
        await applyEvent(normalizeStreamEvent(JSON.parse(buffer.trim()) as RawStreamEvent));
      }

      if (nextSessionId) {
        setActiveSessionId(nextSessionId);
      }

      if (nextSessionTitle) {
        setActiveTitle(nextSessionTitle);
      }

      await loadSessions();
    } catch (requestError: unknown) {
      if (requestError instanceof Error && requestError.name === "AbortError") {
        return;
      }

      const errorMessage = requestError instanceof Error ? requestError.message : "Chat request failed.";
      setError(errorMessage);
      setMessages((current) => current.map((message) => (
        message.id === assistantId
          ? { ...message, content: errorMessage, isThinking: false }
          : message
      )));
    } finally {
      streamAbortControllerRef.current = null;
      activeAssistantMessageIdRef.current = null;
      setSending(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void onSubmit(event as unknown as FormEvent);
    }
  }

  return (
    <>
      <button
        type="button"
        className={clsx("nexaLauncher", isOpen && "open")}
        onClick={() => {
          if (isOpen) {
            closePanel();
            return;
          }

          void openPanel();
        }}
        aria-label={isOpen ? "Close Nexa chat" : "Open Nexa chat"}
      >
        <span className="nexaLauncherGlow" />
        <span className="nexaLauncherIcon">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5v5A3.5 3.5 0 0 1 15.5 15H11l-4.2 3.2c-.6.5-1.5 0-1.5-.8V15A3.5 3.5 0 0 1 2 11.5v-5A3.5 3.5 0 0 1 5.5 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M8 8.5h8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M8 11.5h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </span>
        <span className="nexaLauncherText">
          <strong>Nexa</strong>
          <span>Ask your data</span>
        </span>
        {hasUnreadPulse && !isOpen ? <span className="nexaLauncherPing" /> : null}
      </button>

      <section className={clsx("nexaPanel", isOpen && "open")} aria-label="Nexa assistant">
        <header className="nexaHeader">
          <div>
            <p className="nexaEyebrow">Analytixa AI</p>
            <h2>Nexa</h2>
            <span>{sessionCountLabel}</span>
          </div>
          <div className="nexaHeaderActions">
            <button type="button" className="ghost nexaHeaderButton" onClick={startNewChat}>New chat</button>
            <button type="button" className="ghost nexaHeaderButton" onClick={closePanel}>Close</button>
          </div>
        </header>

        <div className="nexaBody">
          <aside className="nexaHistoryPane">
            <div className="nexaHistoryTitleRow">
              <strong>Recent chats</strong>
              {loadingSessions ? <span>Loading...</span> : <span>{localTimeZoneLabel}</span>}
            </div>
            <div className="nexaHistoryList">
              <button type="button" className={clsx("nexaHistoryItem", !activeSessionId && "active")} onClick={startNewChat}>
               
                <span>Start a fresh question flow</span>
              </button>
              {sessions.map((session) => (
                <div key={session.id} className={clsx("nexaHistoryItem", activeSessionId === session.id && "active")}>
                  <button
                    type="button"
                    className="nexaHistoryOpenBtn"
                    onClick={() => void openSession(session.id)}
                  >
                    <strong>{session.title}</strong>
                    <span>{session.lastMessagePreview}</span>
                    <time>{formatChatTimestamp(session.updatedAt)}</time>
                  </button>
                  <button
                    type="button"
                    className="nexaHistoryDeleteBtn"
                    aria-label={`Delete chat ${session.title}`}
                    title="Delete chat"
                    onClick={() => void deleteSession(session.id)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </aside>

          <div className="nexaConversationPane">
            <div className="nexaConversationTopBar">
              <div>
                <strong>{activeTitle}</strong>
                <span>Only your allowed datasources are used.</span>
              </div>
            </div>

            <div className="nexaMessages" ref={scrollRef}>
              {loadingMessages ? <p className="nexaEmptyState">Loading conversation...</p> : null}
              {!loadingMessages && messages.length === 0 ? (
                <article className="nexaMessage assistant">
                  <div className="nexaMessageBubble nexaWelcomeBubble">
                    <p>Nexa is ready.</p>
                  </div>
                </article>
              ) : null}

              {messages.map((message) => (
                <article key={message.id} className={clsx("nexaMessage", message.role === "user" ? "user" : "assistant")}>
                  <div className="nexaMessageBubble">
                    {message.isThinking && !message.content ? (
                      <div className="nexaThinkingDots" aria-label="Nexa is thinking">
                        <span />
                        <span />
                        <span />
                      </div>
                    ) : (
                      <p>{message.content} </p>
                    )}

                    {message.role === "assistant" && message.traceData ? (
                      <div className="nexaTraceRow">
                        <button
                          type="button"
                          className="nexaTraceIcon"
                          title="View AI reasoning and source"
                          onClick={() => setTracePopupId(tracePopupId === message.id ? null : message.id)}
                          aria-label="View AI reasoning and source"
                        >
                          ℹ
                        </button>
                      </div>
                    ) : null}

                    {tracePopupId === message.id && message.traceData ? (
                      <div className="nexaTraceInline">
                        <div className="nexaTraceInlineHeader">
                          <strong>AI Reasoning & Data Source</strong>
                          <button type="button" className="nexaTraceClose" onClick={() => setTracePopupId(null)}>✕</button>
                        </div>
                        <dl className="nexaTraceList">
                          <dt>Datasource selected</dt>
                          <dd>
                            {message.traceData.datasourceName ?? "—"}
                            <span className="nexaTraceCode">{message.traceData.datasourceCode ? ` (${message.traceData.datasourceCode})` : ""}</span>
                          </dd>
                          {message.traceData.datasourcePurpose ? (<><dt>Datasource purpose</dt><dd>{message.traceData.datasourcePurpose}</dd></>) : null}
                          {message.traceData.plannerReason ? (<><dt>Planner reason</dt><dd>{message.traceData.plannerReason}</dd></>) : null}
                          {message.traceData.queryPlanReason ? (<><dt>Query plan reason</dt><dd>{message.traceData.queryPlanReason}</dd></>) : null}
                          {typeof message.traceData.queryConfidence === "number" ? (<><dt>Query confidence</dt><dd>{`${Math.round(Math.max(0, Math.min(1, message.traceData.queryConfidence)) * 100)}%`}</dd></>) : null}
                          <dt>Query mode</dt>
                          <dd>{message.traceData.usedAgentQuery ? "Agent-generated SQL query" : "Full datasource run"}</dd>
                          {message.traceData.generatedSql ? (<><dt>Generated SQL</dt><dd><code className="nexaTraceSql">{message.traceData.generatedSql}</code></dd></>) : null}
                          {message.traceData.plannerModel ? (<><dt>Planner model</dt><dd>{message.traceData.plannerModel}</dd></>) : null}
                          {message.traceData.responderModel ? (<><dt>Responder model</dt><dd>{message.traceData.responderModel}</dd></>) : null}
                        </dl>
                      </div>
                    ) : null}
                  </div>
                  <div className="nexaMessageMeta">
                    <time>{formatChatTimestamp(message.createdAt)}</time>
                  </div>
                </article>
              ))}
            </div>

            <form className="nexaComposer" onSubmit={(event) => void onSubmit(event)}>
              <textarea
                rows={3}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ask about any datasource you already have access to..."
                disabled={sending}
              />
              <div className="nexaComposerBar">
                <span>{sending ? "Nexa is working on it..." : "Enter to send, Shift+Enter for a new line"}</span>
                <button
                  type={sending ? "button" : "submit"}
                  onClick={sending ? stopStreaming : undefined}
                  disabled={sending ? false : !canSend}
                >
                  {sending ? "⏹ Stop" : "Send"}
                </button>
              </div>
            </form>

            {error ? <p className="nexaErrorBanner">{error}</p> : null}
          </div>
        </div>
      </section>
    </>
  );
}