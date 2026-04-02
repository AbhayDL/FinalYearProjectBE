const DEFAULT_BASE_URL = localStorage.getItem("API_BASE_URL") || "http://localhost:4000";
const AUTH_BASE_URL = localStorage.getItem("AUTH_BASE_URL") || DEFAULT_BASE_URL;
const TEACHER_LOGIN_URL = "../../Student/index.html?role=teacher";

const state = {
  students: [],
  search: "",
  filter: "all",
  sort: "newest",
};

function getBaseUrl(base) {
  try {
    const url = new URL(base);
    return url.origin;
  } catch {
    return DEFAULT_BASE_URL;
  }
}

const EFFECTIVE_AUTH_BASE = getBaseUrl(AUTH_BASE_URL);

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
    window.location.href = TEACHER_LOGIN_URL;
    return null;
  }
  return token;
}

function setStatus(message, type = "") {
  const status = document.getElementById("statusMessage");
  if (!status) return;
  status.className = `status-message${type ? ` ${type}` : ""}`;
  status.textContent = message || "";
}

function getStudentInitials(name) {
  const parts = String(name || "Student").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "S";
}

function getAcademicLabel(student) {
  const department = student.department || "Department not set";
  const year = student.year || "Year not set";
  const semester = student.semester || "Semester not set";
  return `${department} | ${year} | ${semester}`;
}

function updateSummary(students) {
  const total = students.length;
  const active = students.filter((student) => student.isActive).length;
  const inactive = total - active;
  const visible = getFilteredStudents().length;

  document.getElementById("totalStudents").textContent = total;
  document.getElementById("activeStudents").textContent = active;
  document.getElementById("inactiveStudents").textContent = inactive;
  document.getElementById("visibleStudents").textContent = visible;

  const subtitle = document.getElementById("summarySubtitle");
  if (subtitle) {
    subtitle.textContent = total === 1 ? "1 teacher-visible student" : `${total} teacher-visible students`;
  }
}

function getFilteredStudents() {
  const filtered = state.students.filter((student) => {
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

  return filtered.sort((first, second) => {
    if (state.sort === "name_asc") {
      return first.name.localeCompare(second.name);
    }
    if (state.sort === "name_desc") {
      return second.name.localeCompare(first.name);
    }
    if (state.sort === "year_asc") {
      return String(first.year || "").localeCompare(String(second.year || ""), undefined, { numeric: true });
    }
    if (state.sort === "year_desc") {
      return String(second.year || "").localeCompare(String(first.year || ""), undefined, { numeric: true });
    }
    return new Date(second.createdAt || 0) - new Date(first.createdAt || 0);
  });
}

function updateResultsMeta(filteredStudents) {
  const resultsTitle = document.getElementById("resultsTitle");
  const resultsMeta = document.getElementById("resultsMeta");
  if (!resultsTitle || !resultsMeta) return;

  const total = state.students.length;
  const visible = filteredStudents.length;
  resultsTitle.textContent = visible === 1 ? "1 student shown" : `${visible} students shown`;

  const searchPart = state.search ? `Search: \"${state.search}\"` : "No search term";
  const filterPart = state.filter === "all" ? "Status: all" : `Status: ${state.filter}`;
  const sortMap = {
    newest: "Newest first",
    name_asc: "Name A-Z",
    name_desc: "Name Z-A",
    year_asc: "Year low-high",
    year_desc: "Year high-low",
  };
  resultsMeta.textContent = `${searchPart} | ${filterPart} | Sort: ${sortMap[state.sort] || "Newest first"} | Total roster: ${total}`;
}

function renderStudents() {
  const list = document.getElementById("studentsList");
  if (!list) return;

  const students = getFilteredStudents();
  updateSummary(state.students);
  updateResultsMeta(students);
  list.innerHTML = "";

  if (state.students.length === 0) {
    list.innerHTML = `
      <div class="empty-state roster-empty-state">
        <strong>No students are available for this teacher yet.</strong>
        <p>Students appear here when their department, year, and semester match a subject assigned to you.</p>
      </div>
    `;
    return;
  }

  if (students.length === 0) {
    list.innerHTML = `
      <div class="empty-state roster-empty-state">
        <strong>No students match the current filters.</strong>
        <p>Try clearing the search, changing the status filter, or switching the sort order.</p>
      </div>
    `;
    return;
  }

  students.forEach((student) => {
    const card = document.createElement("article");
    card.className = "student-card";
    card.innerHTML = `
      <div class="student-primary">
        <div class="student-avatar">${escapeHtml(getStudentInitials(student.name))}</div>
        <div class="student-info">
          <div class="student-name-row">
            <strong class="student-name">${escapeHtml(student.name)}</strong>
            <span class="status-pill ${student.isActive ? "active" : "inactive"}">
              ${student.isActive ? "Active" : "Inactive"}
            </span>
          </div>
          <div class="student-email">${escapeHtml(student.email)}</div>
          <div class="student-academic">${escapeHtml(getAcademicLabel(student))}</div>
        </div>
      </div>
      <div class="student-secondary">
        <div class="student-meta">
          <span class="meta-pill">Joined: ${student.createdAt ? new Date(student.createdAt).toLocaleDateString() : "Unknown"}</span>
          <span class="meta-pill">Department: ${escapeHtml(student.department || "Not set")}</span>
          <span class="meta-pill">Academic Profile: ${(student.year || student.semester || student.department) ? "Available" : "Incomplete"}</span>
        </div>
        <div class="student-actions">
          <button class="action-btn" type="button" onclick="openStudentDetails('${student._id}')">View Details</button>
          <button
            class="action-btn ${student.isActive ? "danger" : "success"}"
            type="button"
            onclick="toggleStudentStatus('${student._id}')"
          >
            ${student.isActive ? "Deactivate" : "Activate"}
          </button>
        </div>
      </div>
    `;
    list.appendChild(card);
  });
}

function openStudentDetails(studentId) {
  if (!studentId) return;
  window.location.href = `student-detail.html?student_id=${encodeURIComponent(studentId)}`;
}

function resetFilters() {
  state.search = "";
  state.filter = "all";
  state.sort = "newest";

  const searchInput = document.getElementById("searchInput");
  const statusFilter = document.getElementById("statusFilter");
  const sortFilter = document.getElementById("sortFilter");
  if (searchInput) searchInput.value = "";
  if (statusFilter) statusFilter.value = "all";
  if (sortFilter) sortFilter.value = "newest";

  renderStudents();
  setStatus("Filters reset.", "success");
}

async function loadStudents() {
  const token = getTeacherToken();
  if (!token) return;

  const list = document.getElementById("studentsList");
  if (list) {
    list.innerHTML = `
      <div class="empty-state roster-empty-state">
        <strong>Loading students...</strong>
        <p>Refreshing your teacher-visible roster from the server.</p>
      </div>
    `;
  }
  setStatus("Fetching latest student roster...");

  try {
    const fetchStudentsFrom = async (baseUrl) => {
      try {
        const res = await fetch(`${baseUrl}/api/teacher/students`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return { res, baseUrl };
      } catch (error) {
        return { error, baseUrl };
      }
    };

    const parseStudentsResponse = async (res, baseUrl) => {
      if (res.status === 401 || res.status === 403) {
        return { error: "unauthorized" };
      }
      if (!res.ok) {
        return { error: `http_${res.status}` };
      }
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        return { error: "non_json" };
      }
      const students = await res.json();
      return { students, baseUrl };
    };

    let attempt = await fetchStudentsFrom(EFFECTIVE_AUTH_BASE);
    let parsed = null;

    if (!attempt.error) {
      parsed = await parseStudentsResponse(attempt.res, attempt.baseUrl);
    }

    if (attempt.error || (parsed && parsed.error)) {
      if (EFFECTIVE_AUTH_BASE !== DEFAULT_BASE_URL) {
        const fallback = await fetchStudentsFrom(DEFAULT_BASE_URL);
        if (!fallback.error) {
          const fallbackParsed = await parseStudentsResponse(fallback.res, fallback.baseUrl);
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
      throw new Error("Unable to load students from the server.");
    }

    state.students = Array.isArray(parsed.students) ? parsed.students : [];
    renderStudents();
    setStatus(`Loaded ${state.students.length} students.`, "success");
  } catch (error) {
    console.error("Student list error:", error);
    if (list) {
      list.innerHTML = `
        <div class="empty-state roster-empty-state">
          <strong>Unable to load the roster right now.</strong>
          <p>${escapeHtml(error.message || "Please try again in a moment.")}</p>
        </div>
      `;
    }
    updateSummary([]);
    updateResultsMeta([]);
    setStatus(error.message || "Failed to load students.", "error");
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
    const res = await fetch(`${EFFECTIVE_AUTH_BASE}/api/teacher/students/${studentId}/status`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Failed to update student");

    state.students = state.students.map((entry) =>
      entry._id === studentId ? { ...entry, isActive: !entry.isActive } : entry
    );
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
  const sortFilter = document.getElementById("sortFilter");

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

  if (sortFilter) {
    sortFilter.addEventListener("change", (event) => {
      state.sort = event.target.value;
      renderStudents();
    });
  }
}

window.addEventListener("DOMContentLoaded", () => {
  bindControls();
  loadStudents();
});
