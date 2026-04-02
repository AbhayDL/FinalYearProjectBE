console.log("Problems page loaded");

const API_BASE = localStorage.getItem("API_BASE_URL") || "http://localhost:4000";
const TEACHER_LOGIN_URL = "../../Student/index.html?role=teacher";

const state = {
  problems: [],
  subjects: [],
  selectedSubject: null
};

function goBack() {
  window.location.href = "../teacherFE-dashboard/index.html";
}

function handleLogout() {
  if (!confirm("Are you sure you want to logout?")) return;
  localStorage.removeItem("teacherToken");
  localStorage.removeItem("teacherUser");
  localStorage.removeItem("teacherEmail");
  localStorage.removeItem("teacherRememberMe");
  sessionStorage.clear();
  window.location.href = TEACHER_LOGIN_URL;
}

window.addEventListener("DOMContentLoaded", initPage);

async function initPage() {
  const token = localStorage.getItem("teacherToken");
  if (!token) {
    window.location.href = TEACHER_LOGIN_URL;
    return;
  }

  const subjectsList = document.getElementById("subjectsList");
  const problemsList = document.getElementById("problemsList");
  const tasksTitle = document.getElementById("tasksTitle");
  const tasksHint = document.getElementById("tasksHint");

  if (subjectsList) subjectsList.innerHTML = "<p>Loading subjects...</p>";
  if (problemsList) problemsList.innerHTML = "<p>Loading tasks...</p>";
  if (tasksTitle) tasksTitle.textContent = "Tasks";
  if (tasksHint) tasksHint.textContent = "Select a subject to see tasks.";

  try {
    const [subjects, problems] = await Promise.all([
      fetchAssignedSubjects(token),
      fetchTeacherProblems(token)
    ]);

    state.problems = Array.isArray(problems) ? problems : [];
    state.subjects = normalizeSubjects(subjects, state.problems);

    renderSubjects();

    if (state.subjects.length > 0) {
      selectSubject(state.subjects[0].name);
    } else {
      if (subjectsList) {
        subjectsList.innerHTML = "<p>No subjects assigned yet.</p>";
      }
      if (problemsList) {
        problemsList.innerHTML = "<p>No tasks available.</p>";
      }
      if (tasksTitle) tasksTitle.textContent = "Tasks";
      if (tasksHint) tasksHint.textContent = "Ask admin to assign you a subject.";
    }
  } catch (error) {
    console.error(error);
    if (subjectsList) subjectsList.innerHTML = "<p>Failed to load subjects.</p>";
    if (problemsList) problemsList.innerHTML = "<p>Failed to load tasks.</p>";
  }
}

async function fetchAssignedSubjects(token) {
  try {
    const res = await fetch(`${API_BASE}/api/teacher/subjects`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return [];
    const subjects = await res.json();
    return Array.isArray(subjects) ? subjects : [];
  } catch (error) {
    console.warn("Assigned subjects fetch failed:", error);
    return [];
  }
}

async function fetchTeacherProblems(token) {
  const res = await fetch(`${API_BASE}/api/problems/teacher`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error("Network response not ok");
  const problems = await res.json();
  return Array.isArray(problems) ? problems : [];
}

function normalizeSubjects(subjects, problems) {
  if (Array.isArray(subjects) && subjects.length > 0) {
    return subjects
      .filter(s => s && s.name)
      .map(s => ({
        name: s.name,
        year: s.year,
        semester: s.semester
      }));
  }

  const seen = new Set();
  const derived = [];
  problems.forEach(problem => {
    const key = normalizeKey(problem.subject);
    if (!key || seen.has(key)) return;
    seen.add(key);
    derived.push({
      name: problem.subject,
      year: problem.year,
      semester: problem.semester
    });
  });
  return derived;
}

function renderSubjects() {
  const subjectsList = document.getElementById("subjectsList");
  if (!subjectsList) return;

  subjectsList.innerHTML = "";

  if (state.subjects.length === 0) {
    subjectsList.innerHTML = "<p>No subjects assigned yet.</p>";
    return;
  }

  state.subjects.forEach(subject => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "subject-item";
    item.dataset.subject = subject.name;
    item.innerHTML = `
      <span class="subject-name">${escapeHtml(subject.name || "Untitled")}</span>
      ${renderSubjectMeta(subject)}
    `;
    item.addEventListener("click", () => selectSubject(subject.name));
    subjectsList.appendChild(item);
  });
}

function renderSubjectMeta(subject) {
  const yearValue = subject?.year ? String(subject.year) : "";
  const semValue = subject?.semester ? String(subject.semester) : "";
  const year = yearValue
    ? (/\byear\b/i.test(yearValue) ? escapeHtml(yearValue) : `Year ${escapeHtml(yearValue)}`)
    : "";
  const semester = semValue
    ? (/\bsem\b|\bsemester\b/i.test(semValue) ? escapeHtml(semValue) : `Sem ${escapeHtml(semValue)}`)
    : "";
  const meta = [year, semester].filter(Boolean).join(" - ");
  if (!meta) return "";
  return `<span class="subject-meta">${meta}</span>`;
}

function selectSubject(subjectName) {
  state.selectedSubject = subjectName;

  const tasksTitle = document.getElementById("tasksTitle");
  const tasksHint = document.getElementById("tasksHint");
  if (tasksTitle) tasksTitle.textContent = `Tasks - ${subjectName}`;
  if (tasksHint) tasksHint.textContent = "Manage tasks for the selected subject.";

  highlightSubject(subjectName);
  renderTasksForSubject(subjectName);
}

function highlightSubject(subjectName) {
  const items = document.querySelectorAll(".subject-item");
  const targetKey = normalizeKey(subjectName);
  items.forEach(item => {
    const itemKey = normalizeKey(item.dataset.subject);
    item.classList.toggle("active", itemKey === targetKey);
  });
}

function renderTasksForSubject(subjectName) {
  const problemsList = document.getElementById("problemsList");
  if (!problemsList) return;

  const targetKey = normalizeKey(subjectName);
  const filtered = state.problems.filter(problem => {
    return normalizeKey(problem.subject) === targetKey;
  });

  problemsList.innerHTML = "";

  if (filtered.length === 0) {
    problemsList.innerHTML = "<p>No tasks available for this subject.</p>";
    return;
  }

  filtered.forEach(problem => {
    const card = document.createElement("div");
    card.className = "problem-card";
    card.innerHTML = `
      <div class="problem-header">
        <h3>${escapeHtml(problem.title || "Untitled")}</h3>
        ${renderDifficulty(problem.difficulty)}
      </div>
      <p class="problem-meta">${escapeHtml(problem.subject || "Unknown Subject")} - ${escapeHtml(problem.year || "Year")} - ${escapeHtml(problem.semester || "Sem")}</p>
      <p>${escapeHtml(problem.description || "No description available.")}</p>
      <div class="problem-actions">
        <button onclick="viewProblem('${problem._id}')">View</button>
        <button onclick="editProblem('${problem._id}')">Edit</button>
        <button class="del" onclick="deleteProblem('${problem._id}')">Delete</button>
      </div>
    `;
    problemsList.appendChild(card);
  });
}

function renderDifficulty(difficulty) {
  if (!difficulty) return "";
  const label = escapeHtml(difficulty);
  const key = difficulty.toLowerCase();
  return `<span class="difficulty ${key}">${label}</span>`;
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function viewProblem(id) {
  window.location.href = `view.html?id=${encodeURIComponent(id)}`;
}

function editProblem(id) {
  window.location.href = `../teacherFE-upload_page/index.html?id=${encodeURIComponent(id)}`;
}

async function deleteProblem(id) {
  if (!confirm("Delete this problem? This cannot be undone.")) return;
  try {
    const token = localStorage.getItem("teacherToken");
    if (!token) {
      window.location.href = TEACHER_LOGIN_URL;
      return;
    }
    const res = await fetch(`${API_BASE}/api/problems/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Delete failed");

    state.problems = state.problems.filter(problem => problem._id !== id);
    if (state.selectedSubject) {
      renderTasksForSubject(state.selectedSubject);
    } else if (state.subjects.length > 0) {
      selectSubject(state.subjects[0].name);
    }
  } catch (error) {
    console.error(error);
    alert("Failed to delete problem");
  }
}
