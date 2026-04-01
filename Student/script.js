// ============================
// 🔧 CONFIGURATION
// ============================
// If you're running the static frontend from a dev server (e.g. Live Server on 127.0.0.1:5500),
// we should not assume that the frontend origin is the executor backend.
const API_BASE_URL = localStorage.getItem("API_BASE_URL") || "http://localhost:4000";
const DEFAULT_EXECUTOR_BASE = API_BASE_URL;

const EXECUTOR_BASE_URL = localStorage.getItem("EXECUTOR_BASE_URL") || DEFAULT_EXECUTOR_BASE;
const PROBLEMS_BASE_URL = localStorage.getItem("PROBLEMS_BASE_URL") || API_BASE_URL;
const AUTH_BASE_URL = localStorage.getItem("AUTH_BASE_URL") || API_BASE_URL;
const LOGIN_PAGE = "index.html";

const EXECUTOR_FALLBACK_URLS = [
  EXECUTOR_BASE_URL,
  API_BASE_URL,
];

function getStudentAuthHeaders() {
  const token = localStorage.getItem("studentToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchWithExecutor(path, options = {}) {
  let lastError;
  for (const base of EXECUTOR_FALLBACK_URLS) {
    if (!base) continue;
    try {
      const url = `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : "/" + path}`;
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      // Store working base for next time
      localStorage.setItem("EXECUTOR_BASE_URL", base);
      return res;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
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
      throw new Error("Unauthorized user");
    }
  } catch (err) {
    const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
    window.location.href = `${LOGIN_PAGE}?next=${next}`;
    return false;
  }

  return true;
}

function getStoredStudent() {
  try {
    return JSON.parse(localStorage.getItem("studentUser") || "{}");
  } catch (err) {
    return null;
  }
}

if (!ensureLoggedIn()) {
  throw new Error("Not authenticated");
}

// ============================
// � GLOBAL ELEMENTS
// ============================
const languageSelect = document.getElementById("language-select");
const outputContent = document.getElementById("output-content");
const statusText = document.getElementById("status-text");
const submitBtn = document.getElementById("submit-btn");

let currentProblem = null;
let currentLanguageId = null;
let canSubmit = false;
let isSubmitting = false;
let isSavingCode = false;
let draftSaveTimer = null;

function setSubmitEnabled(enabled, message) {
  canSubmit = enabled;
  if (submitBtn) submitBtn.disabled = !enabled;
  if (message) statusText.textContent = message;
}

function markSubmissionDirty(message) {
  if (!currentProblem) return;
  const visibleCount = (currentProblem.testCases || []).length;
  if (visibleCount > 0) {
    setSubmitEnabled(false, message || "Run visible test cases to enable submission.");
  }
}

function setCommentStatus(message) {
  const status = document.getElementById("comment-status");
  if (status) status.textContent = message || "";
}

function setQueryAnsweredBanner(message) {
  const banner = document.getElementById("query-answer-banner");
  if (!banner) return;

  if (message) {
    banner.style.display = "block";
    banner.textContent = message;
  } else {
    banner.style.display = "none";
    banner.textContent = "";
  }
}

function getStudentReviewBanner(submission = {}) {
  if (submission.teacherOverrideStatus === "pending") {
    return "Teacher moved this submission back to pending review. Please check the code/comments, update your solution, and resubmit.";
  }

  if (submission.guiReview?.teacherStatus === "approved") {
    return "Teacher approved your GUI output.";
  }

  if (submission.guiReview?.teacherStatus === "needs_changes") {
    return `Teacher requested a resubmission${submission.guiReview.teacherNote ? `: ${submission.guiReview.teacherNote}` : "."}`;
  }

  if (!submission.queryPending && submission.teacherAnsweredAt) {
    return `Your query was answered on ${new Date(submission.teacherAnsweredAt).toLocaleString()}. Check the code comments below.`;
  }

  return "";
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderExecutionOutput(result = {}) {
  if (!outputContent) return;

  const stdout = result.stdout ? escapeHtml(result.stdout) : "";
  const stderr = result.stderr ? escapeHtml(result.stderr) : "";
  const artifacts = Array.isArray(result.artifacts) ? result.artifacts : [];

  const artifactHtml = artifacts
    .filter((artifact) => artifact.type === "image" && artifact.dataUrl)
    .map((artifact) => `
      <div class="execution-artifact-card">
        <div class="execution-artifact-title">${escapeHtml(artifact.name || "Generated Output")}</div>
        <img src="${artifact.dataUrl}" alt="${escapeHtml(artifact.name || "Generated output")}" class="execution-artifact-image">
      </div>
    `)
    .join("");

  outputContent.innerHTML = `
    ${stderr ? `<div class="execution-text-block error-block">${stderr}</div>` : ""}
    ${stdout ? `<div class="execution-text-block">${stdout}</div>` : ""}
    ${artifactHtml}
    ${!stderr && !stdout && !artifactHtml ? `<div class="execution-text-block">(No output)</div>` : ""}
  `;
}

function isGuiReviewProblem(problem = currentProblem) {
  return Boolean(problem?.guiReviewRequired) || String(problem?.language) === "1001";
}

function updateProblemModeUI() {
  const runAllBtn = document.getElementById("run-all-btn");
  const testCasesPanel = document.querySelector(".test-cases-panel");
  const submitLabel = document.getElementById("submit-btn");

  if (isGuiReviewProblem()) {
    if (testCasesPanel) testCasesPanel.style.display = "none";
    if (runAllBtn) runAllBtn.style.display = "none";
    if (submitLabel) submitLabel.innerHTML = '<i class="fas fa-paper-plane"></i> Send For Teacher Review';
    setSubmitEnabled(true, "This GUI-based problem goes directly to teacher review.");
  } else {
    if (testCasesPanel) testCasesPanel.style.display = "";
    if (runAllBtn) runAllBtn.style.display = "";
    if (submitLabel) submitLabel.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Code';
  }
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

function attachEnhancedRunHandler() {
  const originalButton = document.getElementById("run-btn");
  if (!originalButton) return;

  const runButton = originalButton.cloneNode(true);
  originalButton.replaceWith(runButton);

  runButton.addEventListener("click", async () => {
    const source_code = window.editor.getValue();
    const language_id = currentLanguageId;
    const stdin = document.getElementById("stdin-input").value;

    if (!language_id) {
      alert("Select a language first!");
      return;
    }

    statusText.textContent = "Running your code...";
    outputContent.innerHTML = "";

    try {
      const res = await fetchWithExecutor("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_code, language_id: parseInt(language_id, 10), stdin }),
      });

      const data = await res.json();
      renderExecutionOutput(data);
      statusText.textContent = data.stderr ? "Runtime error occurred." : "Code executed successfully.";
    } catch (error) {
      console.error(error);
      outputContent.textContent = "Error: Could not connect to backend. Make sure the server is running at " + EXECUTOR_BASE_URL;
      statusText.textContent = "Backend connection failed.";
    }
  });
}

function getDraftStorageKey(problemId) {
  return `student_draft_${problemId || "unknown"}`;
}

function saveDraftLocally() {
  if (!currentProblem?._id || !window.editor) return;
  const payload = {
    sourceCode: window.editor.getValue(),
    languageId: currentLanguageId || "",
    savedAt: new Date().toISOString()
  };
  localStorage.setItem(getDraftStorageKey(currentProblem._id), JSON.stringify(payload));
}

function scheduleLocalDraftSave() {
  if (draftSaveTimer) {
    window.clearTimeout(draftSaveTimer);
  }
  draftSaveTimer = window.setTimeout(() => {
    saveDraftLocally();
  }, 1200);
}

function loadLocalDraft(problemId) {
  try {
    const raw = localStorage.getItem(getDraftStorageKey(problemId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearLocalDraft(problemId) {
  localStorage.removeItem(getDraftStorageKey(problemId));
}

async function loadSavedSubmission() {
  if (!currentProblem?._id) {
    setCommentStatus("Load a problem, write your query in code comments, then save.");
    setQueryAnsweredBanner("");
    return;
  }

  const token = localStorage.getItem("studentToken");
  if (!token) return;

  setCommentStatus("Fetching your last saved code...");

  try {
    const res = await fetch(`${PROBLEMS_BASE_URL}/api/submissions/me/problem/${encodeURIComponent(currentProblem._id)}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || "Failed to load saved code");
    }

    const submission = data.submission;
    if (!submission) {
      setCommentStatus("No saved code yet for this problem.");
      const queryToggle = document.getElementById("save-query-toggle");
      if (queryToggle) queryToggle.checked = false;
      const localDraft = loadLocalDraft(currentProblem._id);
      if (localDraft?.sourceCode && window.editor) {
        window.editor.setValue(localDraft.sourceCode);
        if (localDraft.languageId && languageSelect) {
          currentLanguageId = String(localDraft.languageId);
          languageSelect.value = String(localDraft.languageId);
        }
        setCommentStatus(`Local draft restored from ${new Date(localDraft.savedAt).toLocaleString()}.`);
      }
      setQueryAnsweredBanner("");
      return;
    }

    if (window.editor && submission.sourceCode) {
      window.editor.setValue(submission.sourceCode);
    }

    if (submission.languageId && languageSelect) {
      currentLanguageId = String(submission.languageId);
      languageSelect.value = String(submission.languageId);
    }

    const queryToggle = document.getElementById("save-query-toggle");
    if (queryToggle) {
      queryToggle.checked = Boolean(submission.queryPending);
    }
    setCommentStatus(
      submission.queryStatus === "revised_by_student"
        ? "You revised the code after a teacher answer. Save again with query if you need another review."
        : submission.teacherOverrideStatus === "pending"
          ? "Teacher moved this submission back to pending review. Please update your code and submit again."
        : submission.queryStatus === "open"
          ? "This saved code is marked as having a query. Teacher can answer inside the code comments."
          : submission.queryStatus === "answered"
            ? "Teacher answered in the reviewed code comments."
            : "Saved code loaded successfully."
    );
    setQueryAnsweredBanner(getStudentReviewBanner(submission));

    const localDraft = loadLocalDraft(currentProblem._id);
    if (
      localDraft?.sourceCode &&
      localDraft.savedAt &&
      submission.updatedAt &&
      new Date(localDraft.savedAt) > new Date(submission.updatedAt)
    ) {
      window.editor.setValue(localDraft.sourceCode);
      if (localDraft.languageId && languageSelect) {
        currentLanguageId = String(localDraft.languageId);
        languageSelect.value = String(localDraft.languageId);
      }
      setCommentStatus(`Newer local draft restored from ${new Date(localDraft.savedAt).toLocaleString()}.`);
    }
  } catch (error) {
    console.error("Failed to load saved submission:", error);
    setCommentStatus("Saved code is unavailable right now.");
    setQueryAnsweredBanner("");
  }
}

async function saveCode() {
  if (isSavingCode || !currentProblem?._id) return;

  const button = document.getElementById("save-btn");
  const queryToggle = document.getElementById("save-query-toggle");
  const token = localStorage.getItem("studentToken");
  const source_code = window.editor.getValue();
  const language_id = currentLanguageId;
  const hasQuery = Boolean(queryToggle?.checked);

  if (!token) {
    alert("Your session has expired. Please log in again.");
    return;
  }

  if (!language_id) {
    alert("Select a language first!");
    return;
  }

  isSavingCode = true;
  if (button) button.disabled = true;
  setCommentStatus("Saving your code...");

  try {
    const res = await fetch(`${PROBLEMS_BASE_URL}/api/submissions/save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        problemId: currentProblem._id,
        source_code,
        language_id: parseInt(language_id, 10),
        hasQuery
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || "Failed to save code");
    }

    setCommentStatus(data.message || "Code saved successfully.");
    clearLocalDraft(currentProblem._id);
    await loadSavedSubmission();
  } catch (error) {
    console.error("Failed to save code:", error);
    setCommentStatus(error.message || "Failed to save code.");
  } finally {
    isSavingCode = false;
    if (button) button.disabled = false;
  }
}

// ============================
// 💻 MONACO EDITOR SETUP
// ============================
require.config({ paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs" } });
require(["vs/editor/editor.main"], async function () {
  window.editor = monaco.editor.create(document.getElementById("editor"), {
    value: "",
    language: "python",
    theme: "vs-dark",
    fontSize: 14,
    automaticLayout: true,
  });

  await loadLanguages();
  await loadProblem();

  if (window.editor) {
    window.editor.onDidChangeModelContent(() => {
      markSubmissionDirty("Code changed. Run visible test cases again.");
      scheduleLocalDraftSave();
    });
  }
});

// ============================
// 🌐 LOAD LANGUAGES FROM BACKEND
// ============================
async function loadLanguages() {
  try {
    const res = await fetchWithExecutor("/api/languages");
    const langs = await res.json();
    languageSelect.innerHTML = '<option value="">Select language...</option>';
    
    langs.forEach(lang => {
      const opt = document.createElement("option");
      opt.value = lang.id;
      opt.textContent = normalizeLanguageName(lang);
      languageSelect.appendChild(opt);
    });

    languageSelect.addEventListener("change", (e) => {
      currentLanguageId = e.target.value;
      const selectedLang = langs.find(l => l.id == currentLanguageId);
      if (selectedLang && window.editor) {
        const monacoLangMap = {
          "python": "python",
          "java": "java",
          "cpp": "cpp",
          "c++": "cpp",
          "c": "c",
          "javascript": "javascript",
          "go": "go",
          "rust": "rust",
          "ruby": "ruby"
        };
        const monacoLang = monacoLangMap[selectedLang.name.toLowerCase().split(' ')[0]] || "python";
        monaco.editor.setModelLanguage(window.editor.getModel(), monacoLang);
      }
      markSubmissionDirty("Language changed. Run visible test cases again.");
    });
  } catch (error) {
    console.error("Failed to fetch languages:", error);
    statusText.textContent = "❌ Failed to load languages (check backend URL/port)";
  }
}

function normalizeLanguageName(lang) {
  const raw = String(lang?.name || '').trim();
  if (raw) return raw.replace(/\s+/g, ' ');
  const map = {
    71: "Python 3",
    62: "Java",
    54: "C++",
    50: "C",
    63: "JavaScript",
    60: "Go",
    73: "Rust",
    72: "Ruby",
    1001: "HTML/CSS/JS"
  };
  return map[lang?.id] || "Language";
}


// ============================
// 📚 LOAD PROBLEM FROM BACKEND
// ============================
async function loadProblemList() {
  const listSection = document.getElementById("problem-list-section");
  const listContainer = document.getElementById("problem-list");

  if (!listSection || !listContainer) return;

  listSection.style.display = "block";
  listContainer.textContent = "Loading problems...";

  try {
    const student = getStoredStudent();
    if (!student?.year || !student?.semester) {
      listContainer.textContent = "Please update your Year and Semester in Profile to see problems.";
      return;
    }

    const subjects = await fetchSubjectsForYearSemester(student.year, student.semester);
    const subjectNames = subjects.map(s => s.name);
    if (subjectNames.length === 0) {
      listContainer.textContent = `No subjects found for ${student.year} / ${student.semester}.`;
      return;
    }

    const allProblems = await fetchAllProblems();
    const problems = allProblems.filter(p => subjectNames.includes(p.subject));

    if (!problems || problems.length === 0) {
      listContainer.textContent = "No problems available. Ask your instructor to add problems.";
      return;
    }

    listContainer.innerHTML = "";
    problems.forEach((p) => {
      const item = document.createElement("div");
      item.className = "problem-item";
      item.innerHTML = `
        <span class="title">${p.title}</span>
        <span class="meta">
          ${p.difficulty ? `<span class="difficulty">${p.difficulty}</span>` : ""}
          ${p.subject ? `<span class="subject">${p.subject}</span>` : ""}
        </span>
      `;

      item.addEventListener("click", () => {
        window.location.href = `${window.location.pathname}?problem_id=${p._id}`;
      });

      listContainer.appendChild(item);
    });
  } catch (error) {
    console.error("Error loading problem list:", error);
    listContainer.textContent = "Failed to load problems. Please try again later.";
  }
}

async function fetchProblemsForYearSemester(year, semester) {
  const yearOptions = buildYearVariants(year);
  const semOptions = buildSemesterVariants(semester);

  let lastProblems = [];
  for (const y of yearOptions) {
    for (const s of semOptions) {
      const params = new URLSearchParams();
      if (y) params.set("year", y);
      if (s) params.set("semester", s);
      const url = params.toString()
        ? `${PROBLEMS_BASE_URL}/api/problems?${params.toString()}`
        : `${PROBLEMS_BASE_URL}/api/problems`;

      try {
        const res = await fetch(url, { headers: getStudentAuthHeaders() });
        if (!res.ok) continue;
        const data = await res.json();
        lastProblems = Array.isArray(data) ? data : [];
        if (lastProblems.length > 0) return lastProblems;
      } catch (err) {
        // try next variant
      }
    }
  }
  // Fallback: fetch all problems and filter by normalized year/semester
  try {
    const resAll = await fetch(`${PROBLEMS_BASE_URL}/api/problems`, {
      headers: getStudentAuthHeaders()
    });
    if (resAll.ok) {
      const all = await resAll.json();
      const yNorm = normalizeYearValue(year);
      const sNorm = normalizeSemesterValue(semester);
      const filtered = (Array.isArray(all) ? all : []).filter(p => {
        const py = normalizeYearValue(p.year);
        const ps = normalizeSemesterValue(p.semester);
        return (!yNorm || py == yNorm) && (!sNorm || ps == sNorm);
      });
      if (filtered.length > 0) return filtered;
    }
  } catch (err) {
    // ignore fallback errors
  }
  return lastProblems;
}
async function fetchSubjectsForYearSemester(year, semester) {
  try {
    const res = await fetch(`${PROBLEMS_BASE_URL}/api/subjects`, {
      headers: getStudentAuthHeaders()
    });
    if (!res.ok) return [];
    const subjects = await res.json();
    const yNorm = normalizeYearValue(year);
    const sNorm = normalizeSemesterValue(semester);
    return (Array.isArray(subjects) ? subjects : []).filter(s => {
      const sy = normalizeYearValue(s.year);
      const ss = normalizeSemesterValue(s.semester);
      return (!yNorm || sy == yNorm) && (!sNorm || ss == sNorm);
    });
  } catch {
    return [];
  }
}

async function fetchAllProblems() {
  try {
    const res = await fetch(`${PROBLEMS_BASE_URL}/api/problems`, {
      headers: getStudentAuthHeaders()
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}



function buildYearVariants(year) {
  const list = [];
  const cleaned = String(year || "").trim();
  if (cleaned) list.push(cleaned);

  const hasYearWord = /\byear\b/i.test(cleaned);
  if (cleaned && !hasYearWord) list.push(`${cleaned} Year`);
  if (cleaned && hasYearWord) list.push(cleaned.replace(/\s*year\b/i, "").trim());

  return Array.from(new Set(list.filter(Boolean)));
}

function buildSemesterVariants(semester) {
  const list = [];
  const cleaned = String(semester || "").trim();
  if (cleaned) list.push(cleaned);

  if (/^sem\s*\d+/i.test(cleaned)) {
    list.push(cleaned.replace(/^sem\s*/i, "Semester "));
  } else if (/^semester\s*\d+/i.test(cleaned)) {
    list.push(cleaned.replace(/^semester\s*/i, "Sem "));
  }

  return Array.from(new Set(list.filter(Boolean)));
}
function normalizeYearValue(value) {
  const raw = String(value || '').toLowerCase().trim();
  if (!raw) return '';
  const numMatch = raw.match(/(\d+)/);
  if (numMatch) return numMatch[1];
  if (raw.includes('first')) return '1';
  if (raw.includes('second')) return '2';
  if (raw.includes('third')) return '3';
  if (raw.includes('fourth')) return '4';
  return raw.replace(/[^a-z0-9]/g, '');
}

function normalizeSemesterValue(value) {
  const raw = String(value || '').toLowerCase().trim();
  if (!raw) return '';
  const numMatch = raw.match(/(\d+)/);
  if (numMatch) return numMatch[1];
  if (raw.includes('first')) return '1';
  if (raw.includes('second')) return '2';
  if (raw.includes('third')) return '3';
  if (raw.includes('fourth')) return '4';
  if (raw.includes('fifth')) return '5';
  if (raw.includes('sixth')) return '6';
  if (raw.includes('seventh')) return '7';
  if (raw.includes('eighth')) return '8';
  return raw.replace(/[^a-z0-9]/g, '');
}


async function loadProblem() {
  try {
    // Get problem_id from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const problemId = urlParams.get("problem_id");
    const listSection = document.getElementById("problem-list-section");
    const stmtSection = document.querySelector(".problem-statement");

    if (!problemId) {
      if (stmtSection) stmtSection.style.display = "none";
      await loadProblemList();
      setSubmitEnabled(false, "Select a problem to get started");
      setCommentStatus("Load a problem, write your query in code comments, then save.");
      return;
    }

    if (listSection) listSection.style.display = "none";
    if (stmtSection) stmtSection.style.display = "block";

    // Fetch problem from backend
    const res = await fetch(`${PROBLEMS_BASE_URL}/api/problems/${problemId}`, {
      headers: getStudentAuthHeaders()
    });
    if (!res.ok) {
      throw new Error("Problem not found");
    }

    currentProblem = await res.json();

    if (String(currentProblem.language) === "1001") {
      window.location.href = `web-ide.html?problem_id=${encodeURIComponent(problemId)}`;
      return;
    }

    // Update problem title
    document.getElementById("problem-title").textContent = currentProblem.title || "Untitled Problem";
    
    // Update difficulty tag
    const difficultyElement = document.getElementById("display-difficulty");
    if (difficultyElement) {
      difficultyElement.textContent = (currentProblem.difficulty || "Unknown").toUpperCase();
      difficultyElement.className = `tag tag-difficulty tag-${(currentProblem.difficulty || "").toLowerCase()}`;
    }

    // Update subject tag
    const subjectElement = document.getElementById("display-subject");
    if (subjectElement) {
      subjectElement.textContent = currentProblem.subject || "N/A";
    }

    // Update year tag
    const yearElement = document.getElementById("display-year");
    if (yearElement) {
      yearElement.textContent = currentProblem.year || "N/A";
    }

    // Update semester tag
    const semesterElement = document.getElementById("display-semester");
    if (semesterElement) {
      semesterElement.textContent = currentProblem.semester || "N/A";
    }

    // Update description
    document.getElementById("problem-description").textContent = currentProblem.description || "";

    // Update input/output format
    document.getElementById("input-format").textContent = currentProblem.inputFormat || "-";
    document.getElementById("output-format").textContent = currentProblem.outputFormat || "-";

    // Update constraints
    const constraintsList = document.getElementById("constraints-list");
    if (constraintsList) {
      constraintsList.innerHTML = renderProblemConstraints(currentProblem);
    }

    // Set editor content
    if (window.editor) {
      window.editor.setValue(`// Write your solution here for: ${currentProblem.title}\n`);
    }

    updateProblemModeUI();
    if (!isGuiReviewProblem()) {
      const visibleCount = (currentProblem.testCases || []).length;
      if (visibleCount === 0) {
        setSubmitEnabled(true, "No visible test cases. You can submit directly.");
      } else {
        setSubmitEnabled(false, "Run visible test cases to enable submission.");
      }
    }

    await loadSavedSubmission();

  } catch (error) {
    console.error("Error loading problem:", error);
    setSubmitEnabled(false, "Failed to load problem");
    document.getElementById("problem-description").textContent = "Error loading problem details. " + error.message;
    setCommentStatus("Saved comments are unavailable because the problem could not be loaded.");
  }
}

// ============================
// 🧮 EXECUTE CODE (Judge0 API)
// ============================
document.getElementById("run-btn").addEventListener("click", async () => {
  const source_code = window.editor.getValue();
  const language_id = currentLanguageId;
  const stdin = document.getElementById("stdin-input").value;

  if (!language_id) {
    alert("Select a language first!");
    return;
  }

  statusText.textContent = "⏳ Running your code...";
  outputContent.textContent = "";

  try {
    const res = await fetchWithExecutor("/api/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_code, language_id: parseInt(language_id), stdin }),
    });

    const data = await res.json();

    if (data.stderr) {
      outputContent.textContent = "Error: " + (data.stderr || "Unknown error");
      statusText.textContent = "❌ Runtime error occurred.";
    } else {
      outputContent.textContent = data.stdout || "(No output)";
      statusText.textContent = "✅ Code executed successfully.";
    }
  } catch (error) {
    console.error(error);
    outputContent.textContent = "Error: Could not connect to backend. Make sure the server is running at " + EXECUTOR_BASE_URL;
    statusText.textContent = "❌ Backend connection failed.";
  }
});

// ============================
// � CLEAR EDITOR
// ============================
document.getElementById("clear-btn").addEventListener("click", () => {
  window.editor.setValue("");
  outputContent.textContent = "";
  statusText.textContent = "Editor cleared.";
  markSubmissionDirty("Editor cleared. Run visible test cases again.");
});

// ============================
// 🚀 SUBMIT CODE
// ============================
document.getElementById("submit-btn").addEventListener("click", async () => {
  if (isSubmitting) return;
  const source_code = window.editor.getValue();
  const language_id = currentLanguageId;

  if (!currentProblem) {
    alert("No problem loaded!");
    return;
  }

  if (!language_id) {
    alert("Select a language first!");
    return;
  }

  const visibleCount = (currentProblem.testCases || []).length;
  if (!isGuiReviewProblem() && visibleCount > 0 && !canSubmit) {
    alert("Run visible test cases and pass them before submitting.");
    return;
  }

  const token = localStorage.getItem("studentToken");
  if (!token) {
    const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
    window.location.href = `${LOGIN_PAGE}?next=${next}`;
    return;
  }

  submitBtn.disabled = true;
  isSubmitting = true;
  statusText.textContent = isGuiReviewProblem() ? "Sending submission to teacher review..." : "Running hidden test cases...";
  outputContent.textContent = "";

  try {
    const res = await fetch(`${PROBLEMS_BASE_URL}/api/submissions/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        problemId: currentProblem._id,
        source_code,
        language_id: parseInt(language_id),
        guiEvidence: isGuiReviewProblem()
          ? {
              hasEvidence: true,
              notes: Array.isArray(currentProblem.teacherVerificationChecklist) && currentProblem.teacherVerificationChecklist.length
                ? `Teacher checklist:\n${currentProblem.teacherVerificationChecklist.join('\n')}`
                : ""
            }
          : undefined
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || "Submission failed");
    }

    if (data.status === "pending_teacher_review") {
      statusText.textContent = "Submission sent to teacher review.";
      outputContent.textContent = "This GUI-based problem does not use automatic test cases. The teacher will review your output and code.";
    } else if (data.status === "passed") {
      statusText.textContent = "Hidden test cases passed. Submission stored.";
      outputContent.textContent = `Passed ${data.passedCount}/${data.totalCount} hidden test cases.`;
    } else {
      statusText.textContent = "Hidden test cases failed.";
      outputContent.textContent = `Passed ${data.passedCount}/${data.totalCount} hidden test cases. Fix and try again.`;
    }
    clearLocalDraft(currentProblem._id);
  } catch (error) {
    console.error(error);
    statusText.textContent = "Submission failed.";
    outputContent.textContent = error.message || "Failed to submit solution.";
  } finally {
    isSubmitting = false;
    submitBtn.disabled = !canSubmit;
  }
});

// ============================
// 🧪 RUN ALL TEST CASES
// ============================
document.getElementById("run-all-btn")?.addEventListener("click", async () => {
  const source_code = window.editor.getValue();
  const language_id = currentLanguageId;

  if (!language_id) {
    alert("Select a language first!");
    return;
  }

  if (!currentProblem) {
    alert("No problem loaded!");
    return;
  }

  const testCasesContent = document.getElementById("test-cases-content");
  if (!testCasesContent) return;
  
  testCasesContent.textContent = "⏳ Running all test cases...";

  // Get all test cases from current problem
  const testCases = currentProblem.testCases || [];

  if (testCases.length === 0) {
    testCasesContent.textContent = "No test cases available for this problem.";
    return;
  }

  let results = [];
  let passedCount = 0;

  for (let i = 0; i < testCases.length; i++) {
    try {
      const res = await fetchWithExecutor("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          source_code, 
          language_id: parseInt(language_id), 
          stdin: testCases[i].input 
        }),
      });

      const data = await res.json();
      const output = (data.stdout || "").trim();
      const expected = (testCases[i].output || "").trim();
      const passed = output === expected;

      if (passed) passedCount++;

      results.push({
        number: i + 1,
        passed,
        output,
        expected,
        error: data.stderr || null
      });
    } catch (error) {
      results.push({
        number: i + 1,
        passed: false,
        error: error.message
      });
    }
  }

  // Display results
  let resultHTML = `<div style="padding: 10px; background: rgba(0,0,0,0.3); border-radius: 6px; margin-bottom: 10px;">
    <strong>Test Results: ${passedCount}/${testCases.length} passed</strong>
  </div>`;

  results.forEach(result => {
    const statusIcon = result.passed ? '✅' : '❌';
    const statusColor = result.passed ? '#2ecc71' : '#ff6464';
    resultHTML += `<div style="margin-bottom: 12px; border: 1px solid ${statusColor}; border-radius: 4px; padding: 8px; background: rgba(0,0,0,0.2);">
      <div style="color: ${statusColor}; font-weight: bold;">${statusIcon} Test Case ${result.number}</div>`;
    
    if (result.error) {
      resultHTML += `<div style="color: #ff6464; margin-top: 5px; font-size: 0.85rem;">Error: ${result.error}</div>`;
    } else {
      resultHTML += `<div style="margin-top: 5px; font-size: 0.85rem;">
        <div>Output: <code>${result.output || '(empty)'}</code></div>
        <div>Expected: <code>${result.expected || '(empty)'}</code></div>
      </div>`;
    }
    resultHTML += `</div>`;
  });

  testCasesContent.innerHTML = resultHTML;

  const allPassed = testCases.length === 0 ? true : passedCount === testCases.length;
  if (allPassed) {
    setSubmitEnabled(true, "All visible test cases passed. You can submit now.");
  } else {
    setSubmitEnabled(false, "Visible test cases failed. Fix and rerun to submit.");
  }
});

document.getElementById("save-btn")?.addEventListener("click", saveCode);
attachEnhancedRunHandler();

