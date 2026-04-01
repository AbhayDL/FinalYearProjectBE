// ============================
// CONFIGURATION
// ============================
const DEFAULT_BASE_URL = localStorage.getItem("API_BASE_URL") || "http://localhost:4000";
const PROBLEMS_BASE_URL = localStorage.getItem("PROBLEMS_BASE_URL") || DEFAULT_BASE_URL;
const AUTH_BASE_URL = localStorage.getItem("AUTH_BASE_URL") || DEFAULT_BASE_URL;
const TEACHER_LOGIN_URL = "../../Student/index.html?role=teacher";

function getBaseUrl(base) {
  try {
    const url = new URL(base);
    return url.origin;
  } catch {
    return DEFAULT_BASE_URL;
  }
}

const EFFECTIVE_PROBLEMS_BASE = getBaseUrl(PROBLEMS_BASE_URL);
const EFFECTIVE_AUTH_BASE = getBaseUrl(AUTH_BASE_URL);

// ============================
// AUTHENTICATION CHECK
// ============================
function ensureLoggedIn() {
  const token = localStorage.getItem("teacherToken");
  const userStr = localStorage.getItem("teacherUser");
  if (!token || !userStr) {
    window.location.href = TEACHER_LOGIN_URL;
    return false;
  }

  try {
    const user = JSON.parse(userStr);
    if (user.role !== "teacher" || user.isActive === false) {
      handleLogout();
      return false;
    }
    return user;
  } catch (err) {
    handleLogout();
    return false;
  }
}

// ============================
// LOGOUT FUNCTION
// ============================
function handleLogout() {
  if (confirm("Are you sure you want to logout?")) {
    localStorage.removeItem("teacherToken");
    localStorage.removeItem("teacherUser");
    localStorage.removeItem("teacherEmail");
    localStorage.removeItem("teacherRememberMe");
    sessionStorage.clear();
    window.location.href = TEACHER_LOGIN_URL;
  }
}

function navigateTo(path) {
  window.location.href = path;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function updateSidebarWelcome(teacher) {
  const title = document.getElementById("sidebar-welcome-title");
  const subtitle = document.getElementById("sidebar-welcome-subtitle");
  if (!title) return;

  const teacherName = teacher?.name || "Teacher";
  title.innerHTML = `<i class="fas fa-chalkboard-user"></i> Welcome, ${escapeHtml(teacherName)}`;

  if (subtitle) {
    subtitle.textContent = teacher?.email || "Plan, publish, and track classroom coding work.";
  }
}

// ============================
// TASK COMPLETION MODULE
// ============================
let completionData = null;
let completionFilter = "all";
let completionProblemTitle = "task_completion";
let completionSubjectTitle = "";
let subjectSummaryData = null;
let subjectSummaryTitle = "subject_summary";
let allProblems = [];
let selectedProblemId = "";
let selectedStudentId = "";
let selectedSubmissionId = "";
let currentReviewContext = null;
const reviewParams = new URLSearchParams(window.location.search);
const requestedProblemId = reviewParams.get("problem_id");
const requestedStudentId = reviewParams.get("student_id");
const requestedSubmissionId = reviewParams.get("submission_id");

async function loadTaskCompletionModule() {
  const select = document.getElementById("completion-problem-select");
  const completionSubjectSelect = document.getElementById("completion-subject-select");
  const container = document.getElementById("completion-summary");
  const filterSelect = document.getElementById("completion-filter");
  const exportBtn = document.getElementById("completion-export-btn");
  const subjectSelect = document.getElementById("subject-select");
  const subjectExportBtn = document.getElementById("subject-export-btn");
  const subjectContainer = document.getElementById("subject-summary");
  if (!select || !container) return;

  const token = localStorage.getItem("teacherToken");
  if (!token) {
    container.innerHTML = "<p>Session missing. Please log in again.</p>";
    return;
  }

  select.disabled = true;
  container.innerHTML = "<p>Loading problems...</p>";

  try {
    const res = await fetch(`${EFFECTIVE_PROBLEMS_BASE}/api/problems/teacher`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Failed to load problems");
    const problems = await res.json();
    allProblems = problems || [];

    if (!problems || problems.length === 0) {
      container.innerHTML = "<p>No problems found.</p>";
      select.innerHTML = '<option value="">No problems</option>';
      if (subjectSelect && subjectContainer) {
        subjectSelect.innerHTML = '<option value="">No subjects</option>';
        subjectContainer.innerHTML = "<p>No subjects found.</p>";
      }
      return;
    }

    let subjects = [];
    try {
      const subjectRes = await fetch(`${EFFECTIVE_AUTH_BASE}/api/teacher/subjects`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (subjectRes.ok) {
        const subjectData = await subjectRes.json();
        subjects = (subjectData || []).map(s => s.name).filter(Boolean);
      }
    } catch (err) {
      // fallback to subjects inferred from problems
    }

    if (subjects.length === 0) {
      subjects = Array.from(
        new Set(problems.map(p => p.subject).filter(Boolean))
      );
    }

    populateSubjectSelect(subjectSelect, subjects);
    populateSubjectSelect(completionSubjectSelect, subjects);

    if (subjectSelect) {
      subjectSelect.onchange = () => {
        const subject = subjectSelect.value;
        if (subject) {
          subjectSummaryTitle = subject;
          loadSubjectSummary(subject, token);
        } else if (subjectContainer) {
          subjectSummaryData = null;
          subjectContainer.innerHTML = "<p>Select a subject to see completion across all tasks.</p>";
        }
      };
    }

    if (completionSubjectSelect) {
      completionSubjectSelect.onchange = () => {
        completionSubjectTitle = completionSubjectSelect.value;
        populateProblemSelectForSubject(completionSubjectTitle);

        if (select.value) {
          const selectedProblem = allProblems.find((problem) => problem._id === select.value);
          completionProblemTitle = selectedProblem?.title || "task_completion";
          loadCompletionSummary(select.value, token);
        } else {
          completionData = null;
          container.innerHTML = "<p>Select a problem to see which students have solved it.</p>";
        }
      };
    }

    select.disabled = false;
    select.onchange = () => {
      const problemId = select.value;
      if (problemId) {
        const selected = problems.find(p => p._id === problemId);
        completionProblemTitle = selected?.title || "task_completion";
        loadCompletionSummary(problemId, token);
      } else {
        container.innerHTML = "<p>Select a problem to see which students have solved it.</p>";
      }
    };

    if (filterSelect) {
      filterSelect.value = "all";
      filterSelect.onchange = () => {
        completionFilter = filterSelect.value;
        renderCompletionTable();
      };
    }

    if (exportBtn) {
      exportBtn.onclick = () => exportCompletionCSV();
    }

    if (subjectExportBtn) {
      subjectExportBtn.onclick = () => exportSubjectCSV();
    }

    const initialProblem = problems[0];
    if (completionSubjectSelect && initialProblem?.subject) {
      completionSubjectSelect.value = initialProblem.subject;
      completionSubjectTitle = initialProblem.subject;
    }

    populateProblemSelectForSubject(completionSubjectTitle);

    if (select.options.length > 1) {
      select.value = select.options[1].value;
      const selectedProblem = allProblems.find((problem) => problem._id === select.value);
      completionProblemTitle = selectedProblem?.title || "task_completion";
      loadCompletionSummary(select.value, token);
    } else {
      container.innerHTML = "<p>No problems found for the selected subject.</p>";
    }

    if (subjectSelect && subjectSelect.options.length > 1) {
      subjectSelect.value = subjectSelect.options[1].value;
      subjectSummaryTitle = subjectSelect.value;
      loadSubjectSummary(subjectSelect.value, token);
    }

    if (requestedProblemId) {
      const requestedProblem = allProblems.find((problem) => problem._id === requestedProblemId);
      if (requestedProblem) {
        if (completionSubjectSelect && requestedProblem.subject) {
          completionSubjectSelect.value = requestedProblem.subject;
          completionSubjectTitle = requestedProblem.subject;
        }
        populateProblemSelectForSubject(completionSubjectTitle);
        select.value = requestedProblemId;
        completionProblemTitle = requestedProblem.title || "task_completion";
        await loadCompletionSummary(requestedProblemId, token);
      }
    }
  } catch (error) {
    console.error("Task completion load failed:", error);
    container.innerHTML = "<p>Failed to load problems.</p>";
  }
}

function populateSubjectSelect(select, subjects) {
  if (!select) return;

  select.innerHTML = '<option value="">Select a subject...</option>';
  subjects.forEach((subject) => {
    const option = document.createElement("option");
    option.value = subject;
    option.textContent = subject;
    select.appendChild(option);
  });
}

function populateProblemSelectForSubject(subject) {
  const select = document.getElementById("completion-problem-select");
  if (!select) return;

  const filteredProblems = subject
    ? allProblems.filter((problem) => problem.subject === subject)
    : allProblems;

  select.innerHTML = '<option value="">Select a problem...</option>';

  filteredProblems.forEach((problem) => {
    const option = document.createElement("option");
    option.value = problem._id;
    option.textContent = problem.title || "Untitled";
    select.appendChild(option);
  });
}

function getTeacherSummaryStatus(student) {
  if (student.hasPassed) return { className: "passed", label: "Solved" };
  if (student.queryStatus === "revised_by_student") return { className: "query", label: "Revised Query" };
  if (student.queryStatus === "open") return { className: "query", label: "Query" };
  if (student.guiReviewStatus === "needs_changes") {
    return { className: "failed", label: "Resubmit GUI" };
  }
  if (student.guiReviewStatus === "approved") {
    return { className: "answered", label: "GUI Approved" };
  }
  if (student.guiReviewStatus === "pending") {
    return { className: "answered", label: "GUI Review" };
  }
  if (student.queryStatus === "answered") return { className: "answered", label: "Answered" };
  if (student.hasSubmitted) return { className: "failed", label: "Attempted" };
  return { className: "pending", label: "Not yet" };
}

async function loadCompletionSummary(problemId, token) {
  const container = document.getElementById("completion-summary");
  if (!container) return;
  selectedProblemId = problemId;

  container.innerHTML = "<p>Loading submission summary...</p>";
  renderSubmissionViewerEmpty("Select a student submission to view the latest code.");

  try {
    const res = await fetch(
      `${EFFECTIVE_AUTH_BASE}/api/submissions/teacher/problem/${encodeURIComponent(problemId)}/summary`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error("Failed to load summary");
    const data = await res.json();

    const students = data.students || [];
    completionData = {
      header: {
        totalStudents: data.totalStudents || students.length,
        passedCount: data.passedCount || 0
      },
      students
    };

    if (students.length === 0) {
      container.innerHTML = "<p>No students found.</p>";
      return;
    }

    renderCompletionTable();
    if (requestedSubmissionId) {
      await viewSubmissionCode(requestedStudentId || "", requestedSubmissionId);
    } else if (requestedStudentId && requestedProblemId === problemId) {
      await viewSubmissionCode(requestedStudentId);
    }
  } catch (error) {
    console.error("Completion summary failed:", error);
    container.innerHTML = "<p>Failed to load submission summary.</p>";
  }
}

function renderCompletionTable() {
  const container = document.getElementById("completion-summary");
  if (!container) return;
  if (!completionData || !completionData.students) {
    container.innerHTML = "<p>Select a problem to see which students have solved it.</p>";
    return;
  }

  const { students } = completionData;
  let filtered = students;
  if (completionFilter === "passed") {
    filtered = students.filter(s => s.hasPassed);
  } else if (completionFilter === "pending") {
    filtered = students.filter(s => !s.hasPassed);
  }

  if (filtered.length === 0) {
    container.innerHTML = "<p>No students match this filter.</p>";
    return;
  }

  const header = `<div class="completion-header">
    <div>Total Students: ${completionData.header.totalStudents}</div>
    <div>Passed: ${completionData.header.passedCount}</div>
  </div>`;

  const rows = filtered.map(s => {
    const status = getTeacherSummaryStatus(s);
    const submittedAt = s.submittedAt ? new Date(s.submittedAt).toLocaleString() : "-";
    return `<tr>
      <td>${escapeHtml(s.name || "Unknown")}</td>
      <td>${escapeHtml(s.email || "")}</td>
      <td><span class="completion-status ${status.className}">${status.label}</span></td>
      <td>${s.score || 0}</td>
      <td>${submittedAt}</td>
      <td>
        ${s.hasSubmitted
          ? `<div class="table-actions">
              <button class="btn-secondary btn-action" onclick="viewSubmissionCode('${s.id}', '${s.submissionId || ""}')">View Code</button>
              ${s.queryPending ? '<span class="student-meta-pill">Query Pending</span>' : ""}
              ${s.hasGuiEvidence ? '<span class="student-meta-pill">GUI Proof</span>' : ""}
            </div>`
          : '<span class="student-meta-pill">No submission</span>'}
      </td>
    </tr>`;
  }).join("");

  const table = `<div class="completion-table-wrapper">
    <table class="completion-table">
      <thead>
        <tr>
          <th>Student</th>
          <th>Email</th>
        <th>Status</th>
        <th>Score</th>
        <th>Submitted At</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  </div>`;

  container.innerHTML = header + table;
}

function renderSubmissionViewerEmpty(message) {
  const container = document.getElementById("submission-viewer");
  if (!container) return;
  container.innerHTML = `<p class="submission-viewer-empty">${escapeHtml(message || "Select a student submission to view the latest code.")}</p>`;
}

function getLanguageLabel(languageId) {
  const map = {
    1001: "HTML/CSS/JS",
    71: "Python 3",
    62: "Java",
    54: "C++",
    50: "C",
    63: "JavaScript",
    60: "Go",
    73: "Rust",
    72: "Ruby"
  };
  return map[Number(languageId)] || String(languageId || "-");
}

function escapeAttribute(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
}

function isGuiCapableSubmission(problem = {}, submission = {}) {
  if (Number(submission?.languageId) === 1001) return true;
  const haystack = `${problem?.title || ""} ${problem?.description || ""} ${problem?.outputFormat || ""} ${problem?.inputFormat || ""}`.toLowerCase();
  return /(graph|plot|chart|gui|visual|visualization|html|page|canvas|dashboard)/.test(haystack);
}

function renderGuiRuntimeSection() {
  return `
    <div class="gui-runtime-panel">
      <div class="gui-runtime-header">
        <h4>Live GUI Output</h4>
        <button class="btn-secondary" type="button" onclick="runTeacherGuiOutput()">Run GUI Output</button>
      </div>
      <div id="gui-runtime-output" class="gui-runtime-output">
        <p class="submission-viewer-empty">Run the reviewed code to preview the student output here.</p>
      </div>
    </div>
  `;
}

function renderExecutionArtifactsHtml(result = {}) {
  const stdout = result.stdout ? `<div class="execution-text-block">${escapeHtml(result.stdout)}</div>` : "";
  const stderr = result.stderr ? `<div class="execution-text-block error-block">${escapeHtml(result.stderr)}</div>` : "";
  const artifactHtml = (Array.isArray(result.artifacts) ? result.artifacts : [])
    .filter((artifact) => artifact.type === "image" && artifact.dataUrl)
    .map((artifact) => `
      <div class="gui-proof-teacher-card">
        <span>${escapeHtml(artifact.name || "Generated Output")}</span>
        <img src="${artifact.dataUrl}" alt="${escapeHtml(artifact.name || "Generated output")}" class="gui-proof-image">
      </div>
    `)
    .join("");

  return `
    ${stderr}
    ${stdout}
    ${artifactHtml ? `<div class="gui-proof-teacher-grid">${artifactHtml}</div>` : ""}
    ${!stderr && !stdout && !artifactHtml ? `<p class="submission-viewer-empty">(No GUI output returned.)</p>` : ""}
  `;
}

function renderGuiProofSection(problem = {}, submission = {}) {
  const guiReview = submission.guiReview || {};
  const shouldShowGui = isGuiCapableSubmission(problem, submission) || guiReview?.hasEvidence;
  if (!shouldShowGui) {
    return "";
  }

  const screenshotBlock = guiReview.screenshotDataUrl
    ? `<div class="gui-proof-teacher-card">
        <span>Screenshot Proof</span>
        <img src="${guiReview.screenshotDataUrl}" alt="Student GUI proof" class="gui-proof-image">
      </div>`
    : "";
  const htmlBlock = guiReview.htmlPreview
    ? `<div class="gui-proof-teacher-card">
        <span>HTML Preview</span>
        <iframe class="gui-proof-frame" sandbox="" srcdoc="${escapeAttribute(guiReview.htmlPreview)}"></iframe>
      </div>`
    : "";

  return `
    <div class="gui-review-panel">
      <h4>GUI Output Proof</h4>
      ${guiReview.notes ? `<div class="gui-proof-teacher-card"><span>Student Notes</span><p>${escapeHtml(guiReview.notes)}</p></div>` : ""}
      <div class="gui-proof-teacher-grid">
        ${screenshotBlock}
        ${htmlBlock}
      </div>
      ${renderGuiRuntimeSection()}
      <div class="gui-review-controls">
        <label>
          <span>GUI Review Status</span>
          <select id="gui-teacher-status">
            <option value="pending" ${guiReview.teacherStatus === "pending" ? "selected" : ""}>Pending</option>
            <option value="approved" ${guiReview.teacherStatus === "approved" ? "selected" : ""}>Approved</option>
            <option value="needs_changes" ${guiReview.teacherStatus === "needs_changes" ? "selected" : ""}>Needs Changes</option>
          </select>
        </label>
        <label>
          <span>Teacher Review Note</span>
          <textarea id="gui-teacher-note" placeholder="What should the student fix or what was approved?">${escapeHtml(guiReview.teacherNote || "")}</textarea>
        </label>
      </div>
    </div>
  `;
}

async function fetchTeacherSubmissionReview(token, studentId, submissionId) {
  const attemptedSubmissionIds = [];
  const summaryStudents = completionData?.students || [];
  const matchedByStudent = summaryStudents.find((student) => student.id === studentId);
  const matchedBySubmission = summaryStudents.find((student) => student.submissionId === studentId);

  if (submissionId) attemptedSubmissionIds.push(submissionId);
  if (matchedByStudent?.submissionId && !attemptedSubmissionIds.includes(matchedByStudent.submissionId)) {
    attemptedSubmissionIds.push(matchedByStudent.submissionId);
  }
  if (matchedBySubmission?.submissionId && !attemptedSubmissionIds.includes(matchedBySubmission.submissionId)) {
    attemptedSubmissionIds.push(matchedBySubmission.submissionId);
  }
  if (requestedSubmissionId && !attemptedSubmissionIds.includes(requestedSubmissionId)) {
    attemptedSubmissionIds.push(requestedSubmissionId);
  }

  for (const currentSubmissionId of attemptedSubmissionIds) {
    const res = await fetch(
      `${EFFECTIVE_AUTH_BASE}/api/submissions/teacher/submission/${encodeURIComponent(currentSubmissionId)}/latest`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      return {
        data,
        studentId: data?.student?._id || matchedByStudent?.id || matchedBySubmission?.id || studentId || "",
        submissionId: data?.submission?.id || currentSubmissionId
      };
    }
  }

  const fallbackStudentId = matchedBySubmission?.id || studentId;
  const res = await fetch(
    `${EFFECTIVE_AUTH_BASE}/api/submissions/teacher/problem/${encodeURIComponent(selectedProblemId)}/student/${encodeURIComponent(fallbackStudentId)}/latest`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || "Failed to load submission code");
  }

  return {
    data,
    studentId: data?.student?._id || fallbackStudentId,
    submissionId: data?.submission?.id || matchedByStudent?.submissionId || ""
  };
}

async function viewSubmissionCode(studentId, submissionId = "") {
  const token = localStorage.getItem("teacherToken");
  const container = document.getElementById("submission-viewer");
  if (!token || !selectedProblemId || !container) return;

  container.innerHTML = "<p>Loading latest submission code...</p>";

  try {
    const review = await fetchTeacherSubmissionReview(token, studentId, submissionId);
    const data = review.data || {};
    const submission = data.submission || {};
    const student = data.student || {};
    selectedStudentId = review.studentId || studentId;
    selectedSubmissionId = review.submissionId || submissionId || submission.id || "";
    currentReviewContext = {
      problem: data.problem || {},
      student,
      submission
    };

    container.innerHTML = `
      <div class="submission-viewer-card">
        <div class="submission-meta-grid">
          <div class="submission-meta-tile">
            <span>Student</span>
            <strong>${escapeHtml(student.name || "Unknown")}</strong>
          </div>
          <div class="submission-meta-tile">
            <span>Email</span>
            <strong>${escapeHtml(student.email || "")}</strong>
          </div>
          <div class="submission-meta-tile">
            <span>Status</span>
            <strong>${escapeHtml(submission.status || "unknown")}</strong>
          </div>
          <div class="submission-meta-tile">
            <span>Score</span>
            <strong>${submission.score || 0}</strong>
          </div>
          <div class="submission-meta-tile">
            <span>Language Id</span>
            <strong>${escapeHtml(getLanguageLabel(submission.languageId))}</strong>
          </div>
          <div class="submission-meta-tile">
            <span>Updated</span>
            <strong>${submission.updatedAt ? new Date(submission.updatedAt).toLocaleString() : "-"}</strong>
          </div>
          <div class="submission-meta-tile">
            <span>Query Flag</span>
            <strong>${escapeHtml(submission.queryStatus || "none")}</strong>
          </div>
          <div class="submission-meta-tile">
            <span>Last Saved By</span>
            <strong>${escapeHtml(submission.lastSavedBy || "student")}</strong>
          </div>
        </div>
        <div>
          <h4>Student Original Code</h4>
          <pre class="submission-code"><code>${escapeHtml(submission.studentSourceCode || submission.sourceCode || "// No code found")}</code></pre>
        </div>
        <div>
          <h4>Teacher Reviewed Code</h4>
          <textarea id="teacher-code-editor" class="submission-code-editor" spellcheck="false">${escapeHtml(submission.teacherReviewedCode || submission.sourceCode || "// No code found")}</textarea>
        </div>
        ${renderGuiProofSection(data.problem || {}, submission)}
        <div class="submission-editor-actions">
          <label class="resolve-query-toggle">
            <input type="checkbox" id="resolve-query-toggle" ${submission.queryPending ? "checked" : ""}>
            <span>Mark query as resolved when saving edited code</span>
          </label>
          <button class="${isGuiCapableSubmission(data.problem || {}, submission) ? 'btn-secondary' : 'btn-primary'}" onclick="saveTeacherEditedCode('${submission.id}', ${Number(submission.languageId) || 0})">${isGuiCapableSubmission(data.problem || {}, submission) ? 'Save Review Decision' : 'Save Edited Code'}</button>
        </div>
      </div>
    `;
  } catch (error) {
    console.error("Load submission code failed:", error);
    renderSubmissionViewerEmpty(error.message || "Failed to load submission code.");
  }
}

async function runTeacherGuiOutput() {
  const runtimeOutput = document.getElementById("gui-runtime-output");
  const codeInput = document.getElementById("teacher-code-editor");
  const languageId = Number(currentReviewContext?.submission?.languageId || 0);
  const problem = currentReviewContext?.problem || {};
  const sourceCode = String(codeInput?.value || "");

  if (!runtimeOutput || !sourceCode.trim()) return;

  if (languageId === 1001) {
    runtimeOutput.innerHTML = `
      <iframe class="gui-proof-frame" sandbox="allow-scripts" srcdoc="${escapeAttribute(sourceCode)}"></iframe>
    `;
    return;
  }

  runtimeOutput.innerHTML = "<p>Running GUI output...</p>";

  try {
    const res = await fetch(`${EFFECTIVE_AUTH_BASE}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_code: sourceCode,
        language_id: languageId,
        stdin: ""
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || "Failed to execute reviewed code");
    }

    runtimeOutput.innerHTML = renderExecutionArtifactsHtml(data);
    if (!Array.isArray(data.artifacts) || data.artifacts.length === 0) {
      runtimeOutput.insertAdjacentHTML(
        "beforeend",
        `<p class="submission-viewer-empty">${escapeHtml(problem.outputFormat || "No image output was generated. If this should render a chart, make sure the code creates a matplotlib figure.")}</p>`
      );
    }
  } catch (error) {
    console.error("Teacher GUI run failed:", error);
    runtimeOutput.innerHTML = `<div class="execution-text-block error-block">${escapeHtml(error.message || "Failed to run GUI output.")}</div>`;
  }
}

async function saveTeacherEditedCode(submissionId, languageId) {
  const token = localStorage.getItem("teacherToken");
  const input = document.getElementById("teacher-code-editor");
  const resolveQuery = document.getElementById("resolve-query-toggle");
  const guiTeacherStatus = document.getElementById("gui-teacher-status");
  const guiTeacherNote = document.getElementById("gui-teacher-note");
  const sourceCode = String(input?.value || "");

  if (!token || !submissionId) return;
  if (!sourceCode.trim()) {
    alert("Code editor is empty.");
    return;
  }

  try {
    const res = await fetch(
      `${EFFECTIVE_AUTH_BASE}/api/submissions/teacher/${encodeURIComponent(submissionId)}/code`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          sourceCode,
          languageId,
          resolveQuery: Boolean(resolveQuery?.checked),
          guiTeacherStatus: guiTeacherStatus?.value || "not_required",
          guiTeacherNote: guiTeacherNote?.value || ""
        })
      }
    );
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || "Failed to update code");
    }

    await loadCompletionSummary(selectedProblemId, token);
    if (selectedStudentId || selectedSubmissionId) {
      await viewSubmissionCode(selectedStudentId, selectedSubmissionId);
    }
  } catch (error) {
    console.error("Save teacher edited code failed:", error);
    alert(error.message || "Failed to update code.");
  }
}

function exportCompletionCSV() {
  if (!completionData || !completionData.students) {
    alert("No data available to export.");
    return;
  }

  let rows = completionData.students;
  if (completionFilter === "passed") {
    rows = rows.filter(s => s.hasPassed);
  } else if (completionFilter === "pending") {
    rows = rows.filter(s => !s.hasPassed);
  }

  if (rows.length === 0) {
    alert("No students match this filter.");
    return;
  }

  const header = ["Student", "Email", "Status", "Score", "Submitted At"];
  const lines = [header.join(",")];
  rows.forEach(s => {
    const statusText = s.hasPassed ? "Solved" : "Not yet";
    const submittedAt = s.submittedAt ? new Date(s.submittedAt).toLocaleString() : "-";
    const line = [
      csvEscape(s.name || "Unknown"),
      csvEscape(s.email || ""),
      csvEscape(statusText),
      csvEscape(String(s.score || 0)),
      csvEscape(submittedAt)
    ];
    lines.push(line.join(","));
  });

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const dateStamp = new Date().toISOString().slice(0, 10);
  const safeTitle = slugify(completionProblemTitle || "task_completion");
  link.download = `${safeTitle}_${dateStamp}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes("\"") || str.includes("\n")) {
    return `"${str.replace(/\"/g, "\"\"")}"`;
  }
  return str;
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "task_completion";
}

// ============================
// SUBJECT SUMMARY
// ============================
async function loadSubjectSummary(subject, token) {
  const container = document.getElementById("subject-summary");
  if (!container) return;
  subjectSummaryData = null;
  container.innerHTML = "<p>Loading subject summary...</p>";

  try {
    const res = await fetch(
      `${EFFECTIVE_AUTH_BASE}/api/submissions/teacher/subject/${encodeURIComponent(subject)}/summary`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const msg = errJson.message || `Failed to load subject summary (${res.status})`;
      throw new Error(msg);
    }
    const data = await res.json();
    subjectSummaryData = data;
    renderSubjectTable(data);
  } catch (error) {
    console.error("Subject summary failed:", error);
    container.innerHTML = `<p>${escapeHtml(error.message || "Failed to load subject summary.")}</p>`;
  }
}

function exportSubjectCSV() {
  if (!subjectSummaryData || !Array.isArray(subjectSummaryData.students) || !Array.isArray(subjectSummaryData.problems)) {
    alert("No subject data available to export.");
    return;
  }

  const problems = subjectSummaryData.problems || [];
  const students = subjectSummaryData.students || [];

  if (problems.length === 0 || students.length === 0) {
    alert("No subject data available to export.");
    return;
  }

  const header = ["Student", "Email", "All Tasks Done", "Out Of", ...problems.map((problem) => problem.title || "Task")];
  const lines = [header.map(csvEscape).join(",")];

  students.forEach((student) => {
    const completedCount = problems.reduce((count, problem) => {
      const task = student.tasks ? student.tasks[problem.id] : null;
      return count + (task && task.status === "passed" ? 1 : 0);
    }, 0);

    const row = [
      student.name || "Unknown",
      student.email || "",
      student.allSolved ? "Yes" : "No",
      `${completedCount} of ${problems.length}`,
      ...problems.map((problem) => {
        const task = student.tasks ? student.tasks[problem.id] : null;
        return task && task.status === "passed" ? "Done" : "Pending";
      })
    ];
    lines.push(row.map(csvEscape).join(","));
  });

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const dateStamp = new Date().toISOString().slice(0, 10);
  const safeTitle = slugify(subjectSummaryTitle || "subject_summary");
  link.download = `${safeTitle}_summary_${dateStamp}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function renderSubjectTable(data) {
  const container = document.getElementById("subject-summary");
  if (!container) return;

  const problems = data.problems || [];
  const students = data.students || [];

  if (problems.length === 0) {
    container.innerHTML = "<p>No tasks found for this subject.</p>";
    return;
  }
  if (students.length === 0) {
    container.innerHTML = "<p>No students found.</p>";
    return;
  }

  const headerRow = problems
    .map(p => `<th>${escapeHtml(p.title || "Task")}</th>`)
    .join("");

  const rows = students.map(s => {
    const completedCount = problems.reduce((count, problem) => {
      const task = s.tasks ? s.tasks[problem.id] : null;
      return count + (task && task.status === "passed" ? 1 : 0);
    }, 0);

    const taskCells = problems.map(p => {
      const task = s.tasks ? s.tasks[p.id] : null;
      const status = task && task.status === "passed" ? "passed" : "pending";
      const label = status === "passed" ? "Done" : "Pending";
      return `<td><span class="subject-task ${status}">${label}</span></td>`;
    }).join("");

    const allSolvedLabel = s.allSolved ? "Yes" : "No";
    const allSolvedClass = s.allSolved ? "passed" : "pending";

    return `<tr>
      <td>${escapeHtml(s.name || "Unknown")}</td>
      <td>${escapeHtml(s.email || "")}</td>
      <td><span class="subject-task ${allSolvedClass}">${allSolvedLabel}</span></td>
      <td>${completedCount}/${problems.length}</td>
      ${taskCells}
    </tr>`;
  }).join("");

  const table = `<div class="subject-table-wrapper">
    <table class="subject-table">
      <thead>
        <tr>
          <th>Student</th>
          <th>Email</th>
          <th>All Tasks Done</th>
          <th>Out Of</th>
          ${headerRow}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;

  container.innerHTML = table;
}

document.addEventListener("DOMContentLoaded", function () {
  const teacher = ensureLoggedIn();
  if (teacher) {
    updateSidebarWelcome(teacher);
    loadTaskCompletionModule();
  }
});
