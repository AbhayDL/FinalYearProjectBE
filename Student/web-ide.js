const API_BASE_URL = localStorage.getItem("API_BASE_URL") || "http://localhost:4000";
const PROBLEMS_BASE_URL = localStorage.getItem("PROBLEMS_BASE_URL") || API_BASE_URL;
const AUTH_BASE_URL = localStorage.getItem("AUTH_BASE_URL") || API_BASE_URL;
const LOGIN_PAGE = "index.html";
const WEB_LANGUAGE_ID = 1001;
const pageParams = new URLSearchParams(window.location.search);
const isPracticeMode = pageParams.get("mode") === "practice";
const WEB_PRACTICE_STORAGE_KEY = "student_web_practice_draft";

let currentProblem = null;
let webEditor = null;
let isSaving = false;

function getStudentAuthHeaders() {
  const token = localStorage.getItem("studentToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function ensureLoggedIn() {
  const token = localStorage.getItem("studentToken");
  const userStr = localStorage.getItem("studentUser");
  if (!token || !userStr) {
    const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
    window.location.href = `${LOGIN_PAGE}?next=${next}`;
    return false;
  }

  try {
    const user = JSON.parse(userStr);
    if (user.role !== "student" || user.isActive === false) {
      throw new Error("Unauthorized");
    }
    return user;
  } catch (error) {
    const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
    window.location.href = `${LOGIN_PAGE}?next=${next}`;
    return false;
  }
}

function getStoredStudent() {
  try {
    return JSON.parse(localStorage.getItem("studentUser") || "{}");
  } catch {
    return null;
  }
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function setStatus(message) {
  const status = document.getElementById("web-status-text");
  if (status) status.textContent = message || "";
}

function setCommentStatus(message) {
  const status = document.getElementById("web-comment-status");
  if (status) status.textContent = message || "";
}

function setAnswerBanner(message) {
  const banner = document.getElementById("web-answer-banner");
  if (!banner) return;
  if (message) {
    banner.style.display = "block";
    banner.textContent = message;
  } else {
    banner.style.display = "none";
    banner.textContent = "";
  }
}

function savePracticeWebDraft() {
  if (!webEditor) return;
  const payload = {
    sourceCode: webEditor.getValue(),
    savedAt: new Date().toISOString()
  };
  localStorage.setItem(WEB_PRACTICE_STORAGE_KEY, JSON.stringify(payload));
  setCommentStatus(`Practice draft saved locally at ${new Date(payload.savedAt).toLocaleTimeString()}.`);
  setStatus("Practice draft saved locally.");
}

function loadPracticeWebDraft() {
  try {
    const raw = localStorage.getItem(WEB_PRACTICE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getDefaultWebTemplate(title = "Web Task") {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      padding: 24px;
      background: #f8fafc;
      color: #0f172a;
    }
    .card {
      max-width: 720px;
      margin: 0 auto;
      background: white;
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12);
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>Build your GUI-based solution here.</p>
  </div>
</body>
</html>`;
}

function renderProblemConstraints(problem = {}) {
  const items = [];
  if (problem.constraints) items.push(problem.constraints);
  if (Array.isArray(problem.allowedLibraries) && problem.allowedLibraries.length > 0) {
    items.push(`Allowed libraries: ${problem.allowedLibraries.join(", ")}`);
  }
  if (Array.isArray(problem.teacherVerificationChecklist) && problem.teacherVerificationChecklist.length > 0) {
    items.push(`Teacher review checklist: ${problem.teacherVerificationChecklist.join(" | ")}`);
  }
  return items.length > 0 ? items.map((item) => `<li>${escapeHtml(item)}</li>`).join("") : "<li>No constraints specified</li>";
}

function renderPreview() {
  const frame = document.getElementById("web-preview-frame");
  if (!frame || !webEditor) return;
  frame.srcdoc = webEditor.getValue();
  setStatus("Preview refreshed.");
}

async function fetchAllProblems() {
  const res = await fetch(`${PROBLEMS_BASE_URL}/api/problems`, {
    headers: getStudentAuthHeaders()
  });
  if (!res.ok) throw new Error("Failed to load problems");
  const problems = await res.json();
  return Array.isArray(problems) ? problems : [];
}

async function fetchSubjectsForStudent() {
  const student = getStoredStudent();
  if (!student?.year || !student?.semester) return [];
  const res = await fetch(`${PROBLEMS_BASE_URL}/api/subjects`, {
    headers: getStudentAuthHeaders()
  });
  if (!res.ok) return [];
  const subjects = await res.json();
  return (Array.isArray(subjects) ? subjects : []).filter((subject) => {
    return String(subject.year || "") === String(student.year || "") &&
      String(subject.semester || "") === String(student.semester || "");
  });
}

async function loadProblemList() {
  const listSection = document.getElementById("problem-list-section");
  const listContainer = document.getElementById("problem-list");
  if (!listSection || !listContainer) return;

  try {
    const [problems, subjects] = await Promise.all([fetchAllProblems(), fetchSubjectsForStudent()]);
    const subjectNames = new Set(subjects.map((subject) => subject.name));
    const webProblems = problems.filter((problem) => String(problem.language) === String(WEB_LANGUAGE_ID) && subjectNames.has(problem.subject));

    listContainer.innerHTML = "";
    if (webProblems.length === 0) {
      listContainer.innerHTML = "<p>No web/GUI problems available for your subjects yet.</p>";
      return;
    }

    webProblems.forEach((problem) => {
      const item = document.createElement("div");
      item.className = "problem-item";
      item.innerHTML = `
        <span class="title">${escapeHtml(problem.title)}</span>
        <span class="meta">
          <span class="difficulty">${escapeHtml(problem.difficulty || "Web")}</span>
          <span class="subject">${escapeHtml(problem.subject || "")}</span>
        </span>
      `;
      item.addEventListener("click", () => {
        window.location.href = `web-ide.html?problem_id=${encodeURIComponent(problem._id)}`;
      });
      listContainer.appendChild(item);
    });
  } catch (error) {
    console.error("Web problem list failed:", error);
    listContainer.innerHTML = "<p>Failed to load web problems.</p>";
  }
}

async function loadSavedSubmission(problemId) {
  const token = localStorage.getItem("studentToken");
  if (!token) return;

  try {
    const res = await fetch(`${PROBLEMS_BASE_URL}/api/submissions/me/problem/${encodeURIComponent(problemId)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok || !data.submission) {
      setCommentStatus("No saved web submission yet.");
      return;
    }

    const submission = data.submission;
    if (webEditor && submission.sourceCode) {
      webEditor.setValue(submission.sourceCode);
      renderPreview();
    }

    const queryToggle = document.getElementById("web-query-toggle");
    const notes = document.getElementById("web-proof-notes");
    if (queryToggle) queryToggle.checked = Boolean(submission.queryPending);
    if (notes) notes.value = submission.guiReview?.notes || "";

    if (submission.guiReview?.teacherStatus === "approved") {
      setAnswerBanner("Teacher approved your web output.");
    } else if (submission.guiReview?.teacherStatus === "needs_changes") {
      setAnswerBanner(`Teacher requested web changes${submission.guiReview.teacherNote ? `: ${submission.guiReview.teacherNote}` : "."}`);
    } else if (!submission.queryPending && submission.teacherAnsweredAt) {
      setAnswerBanner("Teacher answered your query in the saved code comments.");
    } else {
      setAnswerBanner("");
    }

    setCommentStatus("Saved web submission loaded.");
  } catch (error) {
    console.error("Load saved web submission failed:", error);
    setCommentStatus("Saved web submission is unavailable right now.");
  }
}

async function saveWebSubmission(markForReview = false) {
  if (isPracticeMode) {
    savePracticeWebDraft();
    renderPreview();
    return;
  }
  if (isSaving || !currentProblem || !webEditor) return;

  const token = localStorage.getItem("studentToken");
  if (!token) return;

  const queryToggle = document.getElementById("web-query-toggle");
  const notes = document.getElementById("web-proof-notes");
  const sourceCode = webEditor.getValue();

  isSaving = true;
  setCommentStatus(markForReview ? "Saving web code and sending for review..." : "Saving web code...");

  try {
    const endpoint = markForReview ? "/api/submissions/submit" : "/api/submissions/save";
    const res = await fetch(`${PROBLEMS_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        problemId: currentProblem._id,
        source_code: sourceCode,
        language_id: WEB_LANGUAGE_ID,
        hasQuery: Boolean(queryToggle?.checked),
        guiEvidence: {
          hasEvidence: true,
          htmlPreview: sourceCode,
          notes: String(notes?.value || "").trim()
        }
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || "Failed to save web submission");
    }

    renderPreview();
    setCommentStatus(markForReview ? "Web submission sent to teacher review." : "Web code saved successfully.");
  } catch (error) {
    console.error("Save web submission failed:", error);
    setCommentStatus(error.message || "Failed to save web submission.");
  } finally {
    isSaving = false;
  }
}

async function loadProblem() {
  const problemId = pageParams.get("problem_id");
  const listSection = document.getElementById("problem-list-section");
  const problemStatement = document.querySelector(".problem-statement");

  if (isPracticeMode) {
    currentProblem = {
      _id: "__practice_web__",
      title: "Web Practice",
      description: "Use this live preview workspace to practice HTML, CSS, and JavaScript without sending anything for teacher review.",
      inputFormat: "GUI task",
      outputFormat: "Rendered page / component"
    };

    if (listSection) listSection.style.display = "none";
    if (problemStatement) problemStatement.style.display = "block";

    const queryRow = document.querySelector(".query-toggle-row");
    const reviewPanel = document.querySelector(".gui-proof-panel");
    const reviewBtn = document.getElementById("send-review-btn");
    const saveBtn = document.getElementById("save-web-btn");

    if (queryRow) queryRow.style.display = "none";
    if (reviewPanel) reviewPanel.style.display = "none";
    if (reviewBtn) reviewBtn.style.display = "none";
    if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-floppy-disk"></i> Save Draft';

    document.getElementById("problem-title").textContent = "Web Practice";
    document.getElementById("display-difficulty").textContent = "PRACTICE";
    document.getElementById("display-subject").textContent = "Code Runner";
    document.getElementById("display-year").textContent = "Practice";
    document.getElementById("display-semester").textContent = "Local Draft";
    document.getElementById("problem-description").textContent = currentProblem.description;
    document.getElementById("input-format").textContent = "Live HTML/CSS/JS editing";
    document.getElementById("output-format").textContent = "Preview updates when you refresh.";
    document.getElementById("constraints-list").innerHTML = "<li>Practice mode does not send work for teacher review.</li><li>Save Draft stores your workspace only in this browser.</li>";

    if (webEditor) {
      const draft = loadPracticeWebDraft();
      webEditor.setValue(draft?.sourceCode || getDefaultWebTemplate("Web Practice"));
      renderPreview();
    }

    setAnswerBanner("");
    setCommentStatus("Practice mode is active. Save Draft stores your web code locally.");
    setStatus("Web practice mode ready.");
    return;
  }

  if (!problemId) {
    if (problemStatement) problemStatement.style.display = "none";
    await loadProblemList();
    setStatus("Select a web problem to get started.");
    return;
  }

  try {
    const res = await fetch(`${PROBLEMS_BASE_URL}/api/problems/${encodeURIComponent(problemId)}`, {
      headers: getStudentAuthHeaders()
    });
    if (!res.ok) throw new Error("Problem not found");
    currentProblem = await res.json();

    if (String(currentProblem.language) !== String(WEB_LANGUAGE_ID)) {
      window.location.href = `submission-ide.html?problem_id=${encodeURIComponent(problemId)}`;
      return;
    }

    if (listSection) listSection.style.display = "none";
    if (problemStatement) problemStatement.style.display = "block";

    document.getElementById("problem-title").textContent = currentProblem.title || "Untitled Web Problem";
    document.getElementById("display-difficulty").textContent = (currentProblem.difficulty || "WEB").toUpperCase();
    document.getElementById("display-subject").textContent = currentProblem.subject || "N/A";
    document.getElementById("display-year").textContent = currentProblem.year || "N/A";
    document.getElementById("display-semester").textContent = currentProblem.semester || "N/A";
    document.getElementById("problem-description").textContent = currentProblem.description || "";
    document.getElementById("input-format").textContent = currentProblem.inputFormat || "GUI task";
    document.getElementById("output-format").textContent = currentProblem.outputFormat || "Rendered page";
    document.getElementById("constraints-list").innerHTML = renderProblemConstraints(currentProblem);

    if (webEditor) {
      webEditor.setValue(getDefaultWebTemplate(currentProblem.title || "Web Task"));
      renderPreview();
    }

    await loadSavedSubmission(problemId);
  } catch (error) {
    console.error("Load web problem failed:", error);
    setStatus("Failed to load web problem.");
  }
}

require.config({ paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs" } });
require(["vs/editor/editor.main"], async function () {
  webEditor = monaco.editor.create(document.getElementById("web-editor"), {
    value: getDefaultWebTemplate(),
    language: "html",
    theme: "vs-dark",
    fontSize: 14,
    automaticLayout: true
  });
  window.webEditor = webEditor;

  webEditor.onDidChangeModelContent(() => {
    setStatus("Preview is out of date. Refresh or save to update it.");
  });

  await loadProblem();
});

document.getElementById("refresh-preview-btn")?.addEventListener("click", renderPreview);
document.getElementById("save-web-btn")?.addEventListener("click", () => saveWebSubmission(false));
document.getElementById("send-review-btn")?.addEventListener("click", () => saveWebSubmission(true));
document.getElementById("reset-web-btn")?.addEventListener("click", () => {
  if (webEditor && currentProblem) {
    webEditor.setValue(getDefaultWebTemplate(currentProblem.title || "Web Task"));
    renderPreview();
  }
});

if (!ensureLoggedIn()) {
  throw new Error("Not authenticated");
}
