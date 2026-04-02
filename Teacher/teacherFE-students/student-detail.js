const DEFAULT_BASE_URL = localStorage.getItem("API_BASE_URL") || "http://localhost:4000";
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

const EFFECTIVE_AUTH_BASE = getBaseUrl(AUTH_BASE_URL);

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getTeacherToken() {
  const token = localStorage.getItem("teacherToken");
  if (!token) {
    window.location.href = TEACHER_LOGIN_URL;
    return null;
  }
  return token;
}

function getStudentId() {
  return new URLSearchParams(window.location.search).get("student_id");
}

function goBack() {
  window.location.href = "index.html";
}

function getStudentInitials(name) {
  const parts = String(name || "Student").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "S";
}

function setStatus(message, type = "") {
  const status = document.getElementById("statusMessage");
  if (!status) return;
  status.className = `status-message${type ? ` ${type}` : ""}`;
  status.textContent = message || "";
}

function renderInfoList(containerId, rows) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = rows.map((row) => `
    <div class="detail-row">
      <span>${escapeHtml(row.label)}</span>
      <strong>${escapeHtml(row.value)}</strong>
    </div>
  `).join("");
}

function getSubmissionStatusBadge(submission) {
  if (submission.status === "passed") {
    return '<span class="status-pill active">Solved</span>';
  }
  if (submission.queryStatus === "revised_by_student") {
    return '<span class="status-pill query">Revised Query</span>';
  }
  if (submission.queryStatus === "answered") {
    return '<span class="status-pill answered">Answered</span>';
  }
  if (submission.queryPending) {
    return '<span class="status-pill query">Query</span>';
  }
  return '<span class="status-pill inactive">Attempted</span>';
}

function getStudentState(summary = {}, student = {}) {
  if (!student.isActive) {
    return { label: "Inactive", meta: "Student access is currently paused." };
  }
  if ((summary.queryCount || 0) > 0) {
    return { label: "Needs Review", meta: "One or more submissions still have pending queries." };
  }
  if ((summary.solvedCount || 0) > 0) {
    return { label: "Progressing", meta: "Student has solved at least one teacher-visible problem." };
  }
  if ((summary.totalSubmissions || 0) > 0) {
    return { label: "Attempting", meta: "Student has submitted work but not solved anything yet." };
  }
  return { label: "Not Started", meta: "No teacher-visible submissions have been recorded yet." };
}

function updateHeader(student = {}, summary = {}) {
  const avatar = document.getElementById("studentAvatar");
  const academicMeta = document.getElementById("studentAcademicMeta");
  const resultsTitle = document.getElementById("detailResultsTitle");
  const resultsMeta = document.getElementById("detailResultsMeta");
  const stateLabel = document.getElementById("studentStateLabel");
  const stateMeta = document.getElementById("studentStateMeta");

  if (avatar) avatar.textContent = getStudentInitials(student.name);
  if (academicMeta) {
    academicMeta.textContent = `${student.department || "Department not set"} | ${student.year || "Year not set"} | ${student.semester || "Semester not set"}`;
  }

  const reviewState = getStudentState(summary, student);
  if (stateLabel) stateLabel.textContent = reviewState.label;
  if (stateMeta) stateMeta.textContent = reviewState.meta;

  if (resultsTitle) {
    resultsTitle.textContent = `${summary.totalSubmissions || 0} submission${Number(summary.totalSubmissions || 0) === 1 ? "" : "s"} in view`;
  }
  if (resultsMeta) {
    resultsMeta.textContent = `Solved: ${summary.solvedCount || 0} | Attempted: ${summary.attemptedCount || 0} | Pending queries: ${summary.queryCount || 0}`;
  }
}

function renderSubmissions(submissions) {
  const list = document.getElementById("submissionList");
  if (!list) return;

  if (!Array.isArray(submissions) || submissions.length === 0) {
    list.innerHTML = `
      <div class="empty-state roster-empty-state">
        <strong>No submissions found for this student yet.</strong>
        <p>This student has not submitted any teacher-visible problem attempts so far.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = submissions.map((submission) => `
    <article class="student-card detail-submission-card">
      <div class="student-primary">
        <div class="student-avatar detail-avatar-small">${escapeHtml(getStudentInitials(submission.problem?.title || "Problem"))}</div>
        <div class="student-info">
          <div class="student-name-row">
            <strong class="student-name">${escapeHtml(submission.problem?.title || "Problem")}</strong>
            ${getSubmissionStatusBadge(submission)}
          </div>
          <div class="student-email">${escapeHtml(submission.problem?.subject || "Unknown subject")}</div>
          <div class="student-academic">Updated ${submission.updatedAt ? new Date(submission.updatedAt).toLocaleString() : "-"}</div>
        </div>
      </div>
      <div class="student-secondary">
        <div class="student-meta">
          <span class="meta-pill">Score: ${submission.score || 0}</span>
          <span class="meta-pill">Tests: ${submission.passedCount || 0}/${submission.totalCount || 0}</span>
          <span class="meta-pill">Answered: ${submission.teacherAnsweredAt ? new Date(submission.teacherAnsweredAt).toLocaleString() : "Not answered"}</span>
        </div>
        <div class="student-actions">
          ${submission.problem?.id
            ? `<a class="action-btn" href="../teacherFE-monitoring/index.html?student_id=${encodeURIComponent(getStudentId() || "")}&problem_id=${encodeURIComponent(submission.problem.id)}&submission_id=${encodeURIComponent(submission.id)}">Open Review</a>`
            : ""}
        </div>
      </div>
    </article>
  `).join("");
}

async function loadStudentOverview() {
  const token = getTeacherToken();
  const studentId = getStudentId();
  if (!token || !studentId) {
    setStatus("Student id is missing.", "error");
    return;
  }

  setStatus("Loading student details...");

  try {
    const fetchOverviewFrom = async (baseUrl) => {
      try {
        const res = await fetch(`${baseUrl}/api/teacher/students/${encodeURIComponent(studentId)}/overview`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        return { res, baseUrl };
      } catch (error) {
        return { error, baseUrl };
      }
    };

    const parseOverviewResponse = async (res, baseUrl) => {
      if (res.status === 401 || res.status === 403) {
        return { error: "unauthorized" };
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { error: data.message || `http_${res.status}` };
      }
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        return { error: "non_json" };
      }
      const data = await res.json();
      return { data, baseUrl };
    };

    let attempt = await fetchOverviewFrom(EFFECTIVE_AUTH_BASE);
    let parsed = null;

    if (!attempt.error) {
      parsed = await parseOverviewResponse(attempt.res, attempt.baseUrl);
    }

    if (attempt.error || (parsed && parsed.error)) {
      if (EFFECTIVE_AUTH_BASE !== DEFAULT_BASE_URL) {
        const fallback = await fetchOverviewFrom(DEFAULT_BASE_URL);
        if (!fallback.error) {
          const fallbackParsed = await parseOverviewResponse(fallback.res, fallback.baseUrl);
          if (!fallbackParsed.error) {
            localStorage.setItem("AUTH_BASE_URL", DEFAULT_BASE_URL);
            parsed = fallbackParsed;
          } else {
            parsed = fallbackParsed;
          }
        } else {
          throw fallback.error;
        }
      } else if (attempt.error) {
        throw attempt.error;
      }
    }

    if (!parsed || parsed.error) {
      if (parsed && parsed.error === "unauthorized") {
        throw new Error("Your session has expired. Please log in again.");
      }
      if (parsed && parsed.error === "non_json") {
        throw new Error("Unexpected server response. Check your API base URL.");
      }
      throw new Error(parsed?.error || "Failed to load student details");
    }

    const data = parsed.data || {};
    const student = data.student || {};
    const summary = data.summary || {};

    document.getElementById("studentName").textContent = student.name || "Student Details";
    document.getElementById("studentSubtitle").textContent = student.email || "Student overview";
    document.getElementById("totalSubmissions").textContent = summary.totalSubmissions || 0;
    document.getElementById("solvedCount").textContent = summary.solvedCount || 0;
    document.getElementById("queryCount").textContent = summary.queryCount || 0;

    updateHeader(student, summary);

    renderInfoList("studentInfo", [
      { label: "Full Name", value: student.name || "Unknown" },
      { label: "Email", value: student.email || "Unknown" },
      { label: "Status", value: student.isActive ? "Active" : "Inactive" },
      { label: "Department", value: student.department || "Not set" },
      { label: "Year", value: student.year || "Not set" },
      { label: "Semester", value: student.semester || "Not set" },
      { label: "Joined", value: student.createdAt ? new Date(student.createdAt).toLocaleString() : "-" }
    ]);

    renderInfoList("studentOverview", [
      { label: "Teacher Problems", value: String(summary.totalTeacherProblems || 0) },
      { label: "Total Submissions", value: String(summary.totalSubmissions || 0) },
      { label: "Solved", value: String(summary.solvedCount || 0) },
      { label: "Attempted", value: String(summary.attemptedCount || 0) },
      { label: "Pending Queries", value: String(summary.queryCount || 0) }
    ]);

    renderSubmissions(data.submissions || []);
    setStatus("Student details loaded.", "success");
  } catch (error) {
    console.error("Failed to load student overview:", error);
    setStatus(error.message || "Failed to load student details.", "error");
    renderSubmissions([]);
  }
}

window.addEventListener("DOMContentLoaded", loadStudentOverview);
