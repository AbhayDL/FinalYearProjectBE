(() => {
  const DEFAULT_BASE_URL = localStorage.getItem("API_BASE_URL") || "http://localhost:4000";
  const AUTH_BASE_URL = localStorage.getItem("AUTH_BASE_URL") || DEFAULT_BASE_URL;
  const MONITORING_BASE = (() => {
    try {
      return new URL(AUTH_BASE_URL).origin;
    } catch {
      return DEFAULT_BASE_URL;
    }
  })();

  const token = localStorage.getItem("studentToken");
  if (!token) return;

  const problemId = new URLSearchParams(window.location.search).get("problem_id") || "general";
  const page = document.body.classList.contains("web-ide-page") ? "web_ide" : "submission_ide";
  const sessionKey = `anti_cheat_session_${page}_${problemId}`;

  const generateSessionId = () => {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  };

  const sessionId = sessionStorage.getItem(sessionKey) || generateSessionId();
  sessionStorage.setItem(sessionKey, sessionId);

  const sentRecently = new Map();
  let lastSnapshotSignature = "";
  let snapshotInterval = null;

  function shouldSkip(eventType) {
    const now = Date.now();
    const last = sentRecently.get(eventType) || 0;
    const cooldown = ["page_focus", "page_blur", "tab_visible", "tab_hidden"].includes(eventType) ? 1500 : 0;
    if (cooldown && now - last < cooldown) return true;
    sentRecently.set(eventType, now);
    return false;
  }

  function getActiveEditor() {
    if (window.webEditor && typeof window.webEditor.getValue === "function") return window.webEditor;
    if (window.editor && typeof window.editor.getValue === "function") return window.editor;
    return null;
  }

  function getEditorSnapshot() {
    const editor = getActiveEditor();
    if (!editor) return null;

    const code = String(editor.getValue() || "");
    const trimmed = code.trim();
    if (!trimmed) return null;

    const lines = code.split(/\r?\n/);
    return {
      codeSnapshot: code.slice(0, 4000),
      characterCount: code.length,
      lineCount: lines.length,
      firstLine: lines[0]?.slice(0, 140) || "",
    };
  }

  async function recordEvent(eventType, metadata = {}) {
    if (!token || shouldSkip(eventType)) return;

    try {
      await fetch(`${MONITORING_BASE}/api/monitoring/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId,
          problemId: problemId !== "general" ? problemId : undefined,
          eventType,
          page,
          metadata,
          occurredAt: new Date().toISOString(),
        }),
        keepalive: true,
      });
    } catch (error) {
      // Quietly ignore monitoring transport failures on the client.
    }
  }

  async function recordSnapshot(reason = "periodic") {
    const snapshot = getEditorSnapshot();
    if (!snapshot) return;

    const signature = `${snapshot.characterCount}:${snapshot.firstLine}:${snapshot.codeSnapshot.slice(0, 120)}`;
    if (reason === "periodic" && signature === lastSnapshotSignature) return;
    lastSnapshotSignature = signature;

    await recordEvent("snapshot_captured", {
      snapshotReason: reason,
      ...snapshot,
    });
  }

  function recordEventWithSnapshot(eventType, metadata = {}) {
    const snapshot = getEditorSnapshot();
    return recordEvent(eventType, {
      ...metadata,
      ...(snapshot || {}),
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    recordEvent("session_started", { pathname: window.location.pathname });
    window.setTimeout(() => recordSnapshot("session_start"), 2500);

    document.addEventListener("visibilitychange", () => {
      recordEventWithSnapshot(document.hidden ? "tab_hidden" : "tab_visible", { hidden: document.hidden });
    });

    window.addEventListener("blur", () => recordEventWithSnapshot("page_blur"));
    window.addEventListener("focus", () => recordEvent("page_focus"));

    document.addEventListener("copy", () => recordEventWithSnapshot("copy_attempt"));
    document.addEventListener("paste", () => recordEventWithSnapshot("paste_attempt"));

    document.addEventListener("fullscreenchange", () => {
      recordEventWithSnapshot(document.fullscreenElement ? "fullscreen_enter" : "fullscreen_exit");
    });

    document.getElementById("run-btn")?.addEventListener("click", () => recordEventWithSnapshot("run_code"));
    document.getElementById("refresh-preview-btn")?.addEventListener("click", () => recordEventWithSnapshot("run_code", { mode: "preview_refresh" }));
    document.getElementById("save-btn")?.addEventListener("click", () => recordEventWithSnapshot("save_code"));
    document.getElementById("save-web-btn")?.addEventListener("click", () => recordEventWithSnapshot("save_code"));
    document.getElementById("submit-btn")?.addEventListener("click", () => recordEventWithSnapshot("submission_made"));
    document.getElementById("send-review-btn")?.addEventListener("click", () => recordEventWithSnapshot("submission_made", { mode: "teacher_review" }));

    let idleTimer = null;
    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        recordEventWithSnapshot("idle_warning", { idleMs: 120000 });
      }, 120000);
    };

    ["mousemove", "keydown", "click", "scroll"].forEach((eventName) => {
      window.addEventListener(eventName, resetIdleTimer, { passive: true });
    });
    resetIdleTimer();

    snapshotInterval = window.setInterval(() => {
      recordSnapshot("periodic");
    }, 5000);

    window.addEventListener("beforeunload", () => {
      if (snapshotInterval) {
        clearInterval(snapshotInterval);
        snapshotInterval = null;
      }
      recordSnapshot("before_unload");
      recordEventWithSnapshot("session_ended", { pathname: window.location.pathname });
    });
  });
})();
