const API_BASE = localStorage.getItem("API_BASE_URL") || "http://localhost:4000";
const TEACHER_LOGIN_URL = "../../Student/index.html?role=teacher";

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

function renderSubmissions(submissions) {
  const list = document.getElementById("submissionList");
  if (!list) return;

  if (!Array.isArray(submissions) || submissions.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <p>No submissions found for this student yet.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = submissions.map((submission) => `
    <article class="student-card detail-submission-card">
      <div class="student-info">
        <div class="student-name-row">
          <strong class="student-name">${escapeHtml(submission.problem?.title || "Problem")}</strong>
          ${getSubmissionStatusBadge(submission)}
        </div>
        <div class="student-email">${escapeHtml(submission.problem?.subject || "Unknown subject")}</div>
      </div>
      <div class="student-meta">
        <span class="meta-pill">Score: ${submission.score || 0}</span>
        <span class="meta-pill">Tests: ${submission.passedCount || 0}/${submission.totalCount || 0}</span>
        <span class="meta-pill">Updated: ${submission.updatedAt ? new Date(submission.updatedAt).toLocaleString() : "-"}</span>
        <span class="meta-pill">Answered: ${submission.teacherAnsweredAt ? new Date(submission.teacherAnsweredAt).toLocaleString() : "Not answered"}</span>
      </div>
      <div class="student-actions">
        ${submission.problem?.id
          ? `<a class="action-btn" href="../teacherFE-dashboard/task-completion.html?problem_id=${encodeURIComponent(submission.problem.id)}&student_id=${encodeURIComponent(getStudentId() || "")}&submission_id=${encodeURIComponent(submission.id)}">Open Review</a>`
          : ""}
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
    const res = await fetch(`${API_BASE}/api/teacher/students/${encodeURIComponent(studentId)}/overview`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || "Failed to load student details");
    }

    const student = data.student || {};
    const summary = data.summary || {};

    document.getElementById("studentName").textContent = student.name || "Student Details";
    document.getElementById("studentSubtitle").textContent = student.email || "Student overview";
    document.getElementById("totalSubmissions").textContent = summary.totalSubmissions || 0;
    document.getElementById("solvedCount").textContent = summary.solvedCount || 0;
    document.getElementById("queryCount").textContent = summary.queryCount || 0;

    renderInfoList("studentInfo", [
      { label: "Full Name", value: student.name || "Unknown" },
      { label: "Email", value: student.email || "Unknown" },
      { label: "Status", value: student.isActive ? "Active" : "Inactive" },
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
