const API_BASE = localStorage.getItem("API_BASE_URL") || "http://localhost:4000";

const state = {
  students: [],
  search: "",
  filter: "all",
};

function goBack() {
  window.location.href = "../teacherFE-dashboard/index.html";
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getTeacherToken() {
  const token = localStorage.getItem("teacherToken");
  if (!token) {
    window.location.href = "../teacherFE-login/index.html";
    return null;
  }
  return token;
}

function ensureLayout() {
  const backButton = document.querySelector(".back-btn");
  if (backButton) backButton.textContent = "Back to Dashboard";

  const container = document.querySelector(".container");
  if (!container) return;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Manage Students</h1>
        <p class="muted">Review your roster, filter students quickly, and manage access in one place.</p>
      </div>
      <div id="statusMessage" class="status-message" aria-live="polite"></div>
    </div>

    <section class="summary-grid">
      <div class="summary-card">
        <span class="summary-label">Total Students</span>
        <strong id="totalStudents">0</strong>
      </div>
      <div class="summary-card">
        <span class="summary-label">Active</span>
        <strong id="activeStudents">0</strong>
      </div>
      <div class="summary-card">
        <span class="summary-label">Inactive</span>
        <strong id="inactiveStudents">0</strong>
      </div>
    </section>

    <section class="toolbar">
      <input
        type="search"
        id="searchInput"
        class="search-input"
        placeholder="Search by student name or email"
      />
      <select id="statusFilter" class="filter-select">
        <option value="all">All Students</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </select>
      <button class="refresh-btn inline-refresh" onclick="loadStudents()">Refresh</button>
    </section>

    <div id="studentsList" class="students-list"></div>
  `;
}

function setStatus(message, type = "") {
  const status = document.getElementById("statusMessage");
  if (!status) return;
  status.className = `status-message${type ? ` ${type}` : ""}`;
  status.textContent = message || "";
}

function updateSummary(students) {
  const total = students.length;
  const active = students.filter((student) => student.isActive).length;
  const inactive = total - active;

  document.getElementById("totalStudents").textContent = total;
  document.getElementById("activeStudents").textContent = active;
  document.getElementById("inactiveStudents").textContent = inactive;
}

function getFilteredStudents() {
  return state.students.filter((student) => {
    const matchesSearch =
      !state.search ||
      student.name.toLowerCase().includes(state.search) ||
      student.email.toLowerCase().includes(state.search);

    const matchesFilter =
      state.filter === "all" ||
      (state.filter === "active" && student.isActive) ||
      (state.filter === "inactive" && !student.isActive);

    return matchesSearch && matchesFilter;
  });
}

function renderStudents() {
  const list = document.getElementById("studentsList");
  if (!list) return;

  const students = getFilteredStudents();
  list.innerHTML = "";

  if (students.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <p>No students match the current search or filter.</p>
      </div>
    `;
    return;
  }

  students.forEach((student) => {
    const card = document.createElement("article");
    card.className = "student-card";
    card.innerHTML = `
      <div class="student-info">
        <div class="student-name-row">
          <strong class="student-name">${escapeHtml(student.name)}</strong>
          <span class="status-pill ${student.isActive ? "active" : "inactive"}">
            ${student.isActive ? "Active" : "Inactive"}
          </span>
        </div>
        <div class="student-email">${escapeHtml(student.email)}</div>
      </div>
      <div class="student-meta">
        <span class="meta-pill">Year: ${escapeHtml(student.year || "Not set")}</span>
        <span class="meta-pill">Semester: ${escapeHtml(student.semester || "Not set")}</span>
        <span class="meta-pill">Joined: ${new Date(student.createdAt).toLocaleDateString()}</span>
      </div>
      <div class="student-actions">
        <button
          class="action-btn ${student.isActive ? "danger" : ""}"
          onclick="toggleStudentStatus('${student._id}')"
        >
          ${student.isActive ? "Deactivate" : "Activate"}
        </button>
      </div>
    `;
    list.appendChild(card);
  });
}

async function loadStudents() {
  const token = getTeacherToken();
  if (!token) return;

  const list = document.getElementById("studentsList");
  if (list) {
    list.innerHTML = `
      <div class="empty-state">
        <p>Loading students...</p>
      </div>
    `;
  }
  setStatus("Fetching latest student roster...");

  try {
    const res = await fetch(`${API_BASE}/api/teacher/students`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to load students");

    const students = await res.json();
    state.students = Array.isArray(students) ? students : [];
    updateSummary(state.students);
    renderStudents();
    setStatus(`Loaded ${state.students.length} students.`, "success");
  } catch (error) {
    console.error("Student list error:", error);
    if (list) {
      list.innerHTML = `
        <div class="empty-state">
          <p>Unable to load students right now.</p>
        </div>
      `;
    }
    setStatus("Failed to load students.", "error");
  }
}

async function toggleStudentStatus(studentId) {
  const token = getTeacherToken();
  if (!token) return;

  const student = state.students.find((entry) => entry._id === studentId);
  if (!student) return;

  const actionLabel = student.isActive ? "deactivate" : "activate";
  const confirmed = window.confirm(`Are you sure you want to ${actionLabel} ${student.name}?`);
  if (!confirmed) return;

  setStatus(`Updating ${student.name}...`);

  try {
    const res = await fetch(`${API_BASE}/api/teacher/students/${studentId}/status`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Failed to update student");

    state.students = state.students.map((entry) =>
      entry._id === studentId ? { ...entry, isActive: !entry.isActive } : entry
    );
    updateSummary(state.students);
    renderStudents();
    setStatus(data.message || "Student updated successfully.", "success");
  } catch (error) {
    console.error("Student status update failed:", error);
    setStatus(error.message || "Failed to update student.", "error");
  }
}

function bindControls() {
  const searchInput = document.getElementById("searchInput");
  const statusFilter = document.getElementById("statusFilter");

  if (searchInput) {
    searchInput.addEventListener("input", (event) => {
      state.search = event.target.value.trim().toLowerCase();
      renderStudents();
    });
  }

  if (statusFilter) {
    statusFilter.addEventListener("change", (event) => {
      state.filter = event.target.value;
      renderStudents();
    });
  }
}

window.addEventListener("DOMContentLoaded", () => {
  ensureLayout();
  bindControls();
  loadStudents();
});
