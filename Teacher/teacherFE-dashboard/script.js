// ============================
// 🔧 CONFIGURATION
// ============================
const DEFAULT_BASE_URL = localStorage.getItem("API_BASE_URL") || "http://localhost:4000";
const PROBLEMS_BASE_URL = localStorage.getItem("PROBLEMS_BASE_URL") || DEFAULT_BASE_URL;
const AUTH_BASE_URL = localStorage.getItem("AUTH_BASE_URL") || DEFAULT_BASE_URL;

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
// 🌐 AUTHENTICATION CHECK
// ============================
function ensureLoggedIn() {
  const token = localStorage.getItem("teacherToken");
  const userStr = localStorage.getItem("teacherUser");
  if (!token || !userStr) {
    window.location.href = '../teacherFE-login/index.html';
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
// 🚪 LOGOUT FUNCTION
// ============================
function handleLogout() {
  if (confirm("Are you sure you want to logout?")) {
    localStorage.removeItem('teacherToken');
    localStorage.removeItem('teacherUser');
    localStorage.removeItem('teacherEmail');
    localStorage.removeItem('teacherRememberMe');
    sessionStorage.clear();
    window.location.href = '../teacherFE-login/index.html';
  }
}

// ============================
// 🎛️ NAVIGATION
// ============================
function showSection(sectionName, event) {
  // Hide all sections
  document.querySelectorAll(".section").forEach(section => {
    section.classList.remove("active");
  });

  // Remove active class from nav items
  document.querySelectorAll(".nav-item").forEach(item => {
    item.classList.remove("active");
  });

  // Show selected section (guard in case it was removed)
  const sectionElement = document.getElementById(`${sectionName}-section`);
  if (!sectionElement) return;
  sectionElement.classList.add("active");

  // Add active class to clicked nav item (if available)
  if (event && event.target) {
    const navItem = event.target.closest(".nav-item");
    if (navItem) navItem.classList.add("active");
  }

  // Load section data
  switch(sectionName) {
    case "students":
      loadStudents();
      break;
    case "reports":
      loadReports();
      break;
  }
}

function navigateTo(path) {
  if (path.startsWith('#')) {
    console.log("Navigating to: " + path);
  } else {
    window.location.href = path;
  }
}

// ============================
// 📊 DASHBOARD DATA
// ============================
let currentTeacher = null;
let completionData = null;
let completionFilter = "all";
let completionProblemTitle = "task_completion";
let teacherStudents = [];
let teacherReportSummary = null;

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

function setStudentsStatus(message, type = "") {
  const status = document.getElementById("students-status-message");
  if (!status) return;
  status.className = type ? `students-status-message ${type}` : "students-status-message";
  status.textContent = message || "";
}

function updateStudentSummary(students) {
  const total = students.length;
  const active = students.filter((student) => student.isActive).length;
  const inactive = total - active;

  const totalEl = document.getElementById("students-total-count");
  const activeEl = document.getElementById("students-active-count");
  const inactiveEl = document.getElementById("students-inactive-count");

  if (totalEl) totalEl.textContent = total;
  if (activeEl) activeEl.textContent = active;
  if (inactiveEl) inactiveEl.textContent = inactive;
}

async function loadDashboardData() {
  try {
    // Load teacher profile
    const profileRes = await fetch(`${EFFECTIVE_AUTH_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("teacherToken")}` }
    });
    if (profileRes.ok) {
      const profile = await profileRes.json();
      currentTeacher = profile;
      updateSidebarWelcome(currentTeacher);
    }

    // Load analytics data
    const analyticsRes = await fetch(`${EFFECTIVE_AUTH_BASE}/api/teacher/analytics`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("teacherToken")}` }
    });
    if (analyticsRes.ok) {
      const analytics = await analyticsRes.json();
      document.getElementById("total-students").textContent = analytics.totalStudents;
      document.getElementById("total-submissions").textContent = analytics.totalSubmissions;
      document.getElementById("total-problems").textContent = analytics.totalProblems || 0;
      loadRecentActivity(analytics.recentActivity || []);
    }

    // Load task completion module
    loadTaskCompletionModule();

  } catch (error) {
    console.error("Error loading dashboard data:", error);
  }
}

async function loadRecentActivity(activities) {
  const activityList = document.getElementById("recent-activity-list");
  if (!Array.isArray(activities) || activities.length === 0) {
    activityList.innerHTML = "<p>No recent activity yet.</p>";
    return;
  }

  activityList.innerHTML = activities.map((activity) => `
    <div class="activity-item">
      <i class="fas ${activity.type === "submission" ? "fa-check-circle" : "fa-plus-circle"}"></i>
      <span>${escapeHtml(activity.message || "Recent activity")}</span>
      <span class="activity-time">${new Date(activity.createdAt).toLocaleString()}</span>
    </div>
  `).join("");
}

// ============================
// 👥 STUDENT MANAGEMENT
// ============================
async function loadStudents() {
  const studentsList = document.getElementById("students-list");
  studentsList.innerHTML = "<p>Loading students...</p>";
  setStudentsStatus("Fetching latest student roster...");

  try {
    const token = localStorage.getItem("teacherToken");
    if (!token) {
      studentsList.innerHTML = "<p>Session missing. Please log in again.</p>";
      return;
    }

    const fetchStudentsFrom = async (baseUrl) => {
      try {
        const res = await fetch(`${baseUrl}/api/teacher/students`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        return { res, baseUrl };
      } catch (err) {
        return { error: err, baseUrl };
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
        studentsList.innerHTML = "<p>Your session has expired. Please log in again.</p>";
        return;
      }
      if (parsed && parsed.error === "non_json") {
        studentsList.innerHTML = "<p>Unexpected server response. Check your API base URL.</p>";
        return;
      }
      if (parsed && typeof parsed.error === "string" && parsed.error.startsWith("http_")) {
        studentsList.innerHTML = "<p>Unable to load students from the server. Please try again later.</p>";
        return;
      }
    }

    teacherStudents = (parsed && parsed.students) ? parsed.students : [];
    updateStudentSummary(teacherStudents);
    displayStudents(teacherStudents);
    setStudentsStatus(`Loaded ${teacherStudents.length} students.`, "success");

  } catch (error) {
    console.error("Error loading students:", error);
    studentsList.innerHTML = "<p>Failed to load students. Please try again later.</p>";
    setStudentsStatus("Failed to load students.", "error");
  }
}

function displayStudents(students) {
  const studentsList = document.getElementById("students-list");
  const searchTerm = document.getElementById("student-search").value.toLowerCase();
  const filterValue = document.getElementById("student-filter").value;

  const filteredStudents = students.filter(student => {
    const matchesSearch = student.name.toLowerCase().includes(searchTerm) ||
                         student.email.toLowerCase().includes(searchTerm);
    const matchesFilter = !filterValue ||
                         (filterValue === "active" && student.isActive) ||
                         (filterValue === "inactive" && !student.isActive);
    return matchesSearch && matchesFilter;
  });

  studentsList.innerHTML = "";

  if (filteredStudents.length === 0) {
    studentsList.innerHTML = "<p>No students found matching your criteria.</p>";
    return;
  }

  filteredStudents.forEach(student => {
    const studentCard = document.createElement("div");
    studentCard.className = "student-card";
    studentCard.innerHTML = `
      <div class="student-header">
        <div class="student-info">
          <h3>${escapeHtml(student.name)}</h3>
          <p>${escapeHtml(student.email)}</p>
        </div>
        <div class="student-header-right">
          <div class="student-status ${student.isActive ? "active" : "inactive"}">
            ${student.isActive ? "Active" : "Inactive"}
          </div>
          <div class="student-actions">
            <button class="btn-secondary btn-compact" onclick="viewStudentDetails('${student._id}')">
              <i class="fas fa-eye"></i> View
            </button>
            <button class="btn-danger btn-compact" onclick="toggleStudentStatus('${student._id}')">
              <i class="fas fa-${student.isActive ? 'ban' : 'check'}"></i>
              ${student.isActive ? 'Disable' : 'Enable'}
            </button>
          </div>
        </div>
      </div>
      <div class="student-meta-row">
        <span class="student-meta-pill">Year: ${escapeHtml(student.year || "Not set")}</span>
        <span class="student-meta-pill">Semester: ${escapeHtml(student.semester || "Not set")}</span>
        <span class="student-meta-pill">Joined: ${new Date(student.createdAt).toLocaleDateString()}</span>
      </div>
    `;
    studentsList.appendChild(studentCard);
  });
}

function filterStudents() {
  displayStudents(teacherStudents);
}

function viewStudentDetails(studentId) {
  const student = teacherStudents.find((entry) => entry._id === studentId);
  if (!student) return;
  alert(
    `Student Profile\n\nName: ${student.name}\nEmail: ${student.email}\nYear: ${student.year || "Not set"}\nSemester: ${student.semester || "Not set"}\nStatus: ${student.isActive ? "Active" : "Inactive"}`
  );
}

function toggleStudentStatus(studentId) {
  if (confirm("Are you sure you want to change this student's status?")) {
    setStudentsStatus("Updating student status...");
    fetch(`${EFFECTIVE_AUTH_BASE}/api/teacher/students/${studentId}/status`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("teacherToken")}`
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(result => {
      setStudentsStatus(result.message || "Student status updated.", "success");
      teacherStudents = teacherStudents.map((student) =>
        student._id === studentId ? { ...student, isActive: !student.isActive } : student
      );
      updateStudentSummary(teacherStudents);
      displayStudents(teacherStudents);
    })
    .catch(error => {
      console.error("Error toggling student status:", error);
      setStudentsStatus("Failed to update student status. Please try again.", "error");
    });
  }
}

// ============================
// 📊 REPORTS & ANALYTICS
// ============================
async function loadReports() {
  try {
    const reportsRes = await fetch(`${AUTH_BASE_URL}/api/teacher/reports-summary`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("teacherToken")}` }
    });

    if (!reportsRes.ok) throw new Error("Failed to load report summary");

    teacherReportSummary = await reportsRes.json();
    document.getElementById("total-submissions-report").textContent = teacherReportSummary.totalSubmissions;
    document.getElementById("top-performer").textContent = teacherReportSummary.topPerformer;
    document.getElementById("avg-completion").textContent = `${teacherReportSummary.averageScore}%`;
    document.getElementById("most-attempted").textContent = teacherReportSummary.mostAttempted;
    document.getElementById("success-rate").textContent = `${teacherReportSummary.successRate}%`;
    document.getElementById("weekly-growth").textContent = `${teacherReportSummary.weeklyGrowth >= 0 ? "+" : ""}${teacherReportSummary.weeklyGrowth}%`;
    document.getElementById("best-subject").textContent = teacherReportSummary.bestSubject;
    document.getElementById("needs-improvement").textContent = teacherReportSummary.needsImprovement;

  } catch (error) {
    console.error("Error loading reports:", error);
  }
}

function exportReport() {
  if (!teacherReportSummary) {
    alert("Report data is still loading.");
    return;
  }

  const rows = [
    ["Metric", "Value"],
    ["Top Performer", teacherReportSummary.topPerformer],
    ["Average Score", `${teacherReportSummary.averageScore}%`],
    ["Most Attempted", teacherReportSummary.mostAttempted],
    ["Success Rate", `${teacherReportSummary.successRate}%`],
    ["Total Submissions", teacherReportSummary.totalSubmissions],
    ["Weekly Growth", `${teacherReportSummary.weeklyGrowth}%`],
    ["Best Subject", teacherReportSummary.bestSubject],
    ["Needs Improvement", teacherReportSummary.needsImprovement]
  ];

  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `teacher_report_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function generateDetailedReport() {
  loadReports();
}

// ============================
// ⚙️ SETTINGS
// ============================
function saveSettings() {
  const settings = {
    emailNotifications: document.getElementById("email-notifications").checked,
    studentActivity: document.getElementById("student-activity").checked,
    darkMode: document.getElementById("dark-mode").checked,
    compactView: document.getElementById("compact-view").checked
  };

  localStorage.setItem("teacherSettings", JSON.stringify(settings));
  alert("Settings saved successfully!");
}

// ============================
// 🎯 INITIALIZATION
// ============================
document.addEventListener("DOMContentLoaded", function() {
  currentTeacher = ensureLoggedIn();
  if (currentTeacher) {
    updateSidebarWelcome(currentTeacher);
    loadDashboardData();
  }

  // Load saved settings
  const savedSettings = localStorage.getItem("teacherSettings");
  if (savedSettings) {
    const settings = JSON.parse(savedSettings);
    document.getElementById("email-notifications").checked = settings.emailNotifications || false;
    document.getElementById("student-activity").checked = settings.studentActivity || false;
    document.getElementById("dark-mode").checked = settings.darkMode || false;
    document.getElementById("compact-view").checked = settings.compactView || false;
  }

  const section = new URLSearchParams(window.location.search).get("section");
  if (section) {
    showSection(section);
  }
});

// ============================
// ✅ TASK COMPLETION MODULE
// ============================
async function loadTaskCompletionModule() {
  const select = document.getElementById("completion-problem-select");
  const container = document.getElementById("completion-summary");
  const filterSelect = document.getElementById("completion-filter");
  const exportBtn = document.getElementById("completion-export-btn");
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

    if (!problems || problems.length === 0) {
      container.innerHTML = "<p>No problems found.</p>";
      select.innerHTML = '<option value="">No problems</option>';
      return;
    }

    select.innerHTML = '<option value="">Select a problem...</option>';
    problems.forEach(p => {
      const option = document.createElement("option");
      option.value = p._id;
      option.textContent = p.title || "Untitled";
      select.appendChild(option);
    });

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

    // Auto-load first problem
    select.value = problems[0]._id;
    completionProblemTitle = problems[0].title || "task_completion";
    loadCompletionSummary(problems[0]._id, token);
  } catch (error) {
    console.error("Task completion load failed:", error);
    container.innerHTML = "<p>Failed to load problems.</p>";
  }
}

async function loadCompletionSummary(problemId, token) {
  const container = document.getElementById("completion-summary");
  if (!container) return;

  container.innerHTML = "<p>Loading submission summary...</p>";

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
    const statusClass = s.hasPassed ? "passed" : "pending";
    const statusText = s.hasPassed ? "Solved" : "Not yet";
    const submittedAt = s.submittedAt ? new Date(s.submittedAt).toLocaleString() : "-";
    return `<tr>
      <td>${escapeHtml(s.name || "Unknown")}</td>
      <td>${escapeHtml(s.email || "")}</td>
      <td><span class="completion-status ${statusClass}">${statusText}</span></td>
      <td>${s.score || 0}</td>
      <td>${submittedAt}</td>
    </tr>`;
  }).join("");

  const table = `<table class="completion-table">
    <thead>
      <tr>
        <th>Student</th>
        <th>Email</th>
        <th>Status</th>
        <th>Score</th>
        <th>Submitted At</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;

  container.innerHTML = header + table;
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

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
