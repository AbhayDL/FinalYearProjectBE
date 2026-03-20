// ============================
// CONFIGURATION
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
// AUTHENTICATION CHECK
// ============================
function ensureLoggedIn() {
  const token = localStorage.getItem("teacherToken");
  const userStr = localStorage.getItem("teacherUser");
  if (!token || !userStr) {
    window.location.href = "index.html";
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
    window.location.href = "index.html";
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

  const table = `<div class="completion-table-wrapper">
    <table class="completion-table">
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
    </table>
  </div>`;

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
