"use client";

import { useEffect } from "react";

type InlineSnackbarProps = {
  message: string;
  type: "success" | "error" | "info";
  onClose: () => void;
  durationMs?: number;
};

export default function InlineSnackbar({ message, type, onClose, durationMs = 3500 }: InlineSnackbarProps) {
  useEffect(() => {
    if (!message) {
      return;
    }

    const timeout = window.setTimeout(() => onClose(), durationMs);
    return () => window.clearTimeout(timeout);
  }, [message, durationMs, onClose]);

  if (!message) {
    return null;
  }

  return (
    <div className={`snackbar snackbar-${type}`} role="alert" aria-live="polite">
      <span>{message}</span>
      <button type="button" className="snackbarClose" onClick={onClose} aria-label="Close message">
        x
      </button>
    </div>
  );
}
