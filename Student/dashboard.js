// ============================
// 🔧 CONFIGURATION
// ============================
const API_BASE_URL = localStorage.getItem("API_BASE_URL") || "http://localhost:4000";
const PROBLEMS_BASE_URL = localStorage.getItem("PROBLEMS_BASE_URL") || API_BASE_URL;
const AUTH_BASE_URL = localStorage.getItem("AUTH_BASE_URL") || API_BASE_URL;

function getStudentAuthHeaders() {
  const token = localStorage.getItem("studentToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ============================
// 🌐 AUTHENTICATION CHECK
// ============================
function ensureLoggedIn() {
  const token = localStorage.getItem("studentToken");
  const userStr = localStorage.getItem("studentUser");
  if (!token || !userStr) {
    window.location.href = "index.html";
    return false;
  }

  try {
    const user = JSON.parse(userStr);
    if (user.role !== "student" || user.isActive === false) {
      logout();
      return false;
    }
    return user;
  } catch (err) {
    logout();
    return false;
  }
}

// ============================
// 🚪 LOGOUT FUNCTION
// ============================
function logout() {
  localStorage.removeItem("studentToken");
  localStorage.removeItem("studentUser");
  localStorage.removeItem("studentEmail");
  sessionStorage.removeItem("studentSession");
  window.location.href = "index.html";
}

// ============================
// 📊 DASHBOARD DATA
// ============================
let currentUser = null;
let profileYearEl = null;
let profileSemesterEl = null;
let editProfileBtn = null;
let saveProfileBtn = null;
let cancelProfileBtn = null;
let profileAcademicStatusEl = null;
let studentPasswordStatusEl = null;

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function updateSidebarWelcome(user) {
  const title = document.getElementById("sidebar-welcome-title");
  const subtitle = document.getElementById("sidebar-welcome-subtitle");
  const academics = document.getElementById("sidebar-welcome-academics");
  const avatar = document.getElementById("sidebar-avatar");
  if (!title) return;

  const studentName = user?.name || "Student";
  title.textContent = studentName;
  if (avatar) {
    avatar.textContent = String(studentName).trim().charAt(0).toUpperCase() || "S";
  }

  if (subtitle) {
    subtitle.textContent = user?.email || "";
  }

  if (academics) {
    const academicParts = [
      user?.department || user?.branch || "Department",
      user?.year || "Year",
      user?.semester || "Semester"
    ];
    academics.textContent = academicParts.join(" | ");
  }
}

function refreshAcademicEditStatus(user) {
  if (!profileAcademicStatusEl) return;

  profileAcademicStatusEl.className = "profile-status-banner";

  if (user?.academicEditEnabled) {
    profileAcademicStatusEl.classList.add("enabled");
    profileAcademicStatusEl.textContent = "Admin has enabled one-time Year/Semester editing for your account. After you save once, this option will lock again.";
    if (editProfileBtn) editProfileBtn.disabled = false;
    return;
  }

  if (user?.academicEditUsed) {
    profileAcademicStatusEl.classList.add("used");
    profileAcademicStatusEl.textContent = "Your one-time Year/Semester update has already been used. Contact admin if another change is needed.";
    if (editProfileBtn) editProfileBtn.disabled = true;
    return;
  }

  profileAcademicStatusEl.classList.add("locked");
  profileAcademicStatusEl.textContent = "Year/Semester editing is locked. Admin can enable it for one-time use when your academic term changes.";
  if (editProfileBtn) editProfileBtn.disabled = true;
}

function setStudentPasswordStatus(message, type = "") {
  if (!studentPasswordStatusEl) {
    studentPasswordStatusEl = document.getElementById("student-password-status");
  }
  if (!studentPasswordStatusEl) return;

  studentPasswordStatusEl.style.display = message ? "block" : "none";
  studentPasswordStatusEl.className = "profile-status-banner";
  if (type) {
    studentPasswordStatusEl.classList.add(type);
  }
  studentPasswordStatusEl.textContent = message || "";
}

async function loadDashboardData() {
  try {
    // Load problems count
    const problemsRes = await fetch(`${PROBLEMS_BASE_URL}/api/problems`, {
      headers: getStudentAuthHeaders()
    });
    const problems = await problemsRes.json();
    document.getElementById("total-problems").textContent = problems.length;

    // Load user profile
    const profileRes = await fetch(`${AUTH_BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("studentToken")}` }
    });
    if (profileRes.ok) {
      const profile = await profileRes.json();
      currentUser = profile;
      updateSidebarWelcome(currentUser);
      document.getElementById("profile-name").value = profile.name;
      document.getElementById("profile-email").value = profile.email;
      document.getElementById("profile-role").value = profile.role;
      if (profileYearEl) profileYearEl.value = profile.year || "";
      if (profileSemesterEl) profileSemesterEl.value = profile.semester || "";
      refreshAcademicEditStatus(profile);

      // Keep localStorage in sync for filtering problems
      localStorage.setItem("studentUser", JSON.stringify(profile));
    }

    const submissionsRes = await fetch(`${PROBLEMS_BASE_URL}/api/submissions/me`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("studentToken")}` }
    });
    if (submissionsRes.ok) {
      const submissionData = await submissionsRes.json();
      document.getElementById("solved-problems").textContent = submissionData.solvedCount || 0;
      const pendingQueriesEl = document.getElementById("pending-queries-count");
      const answeredQueriesEl = document.getElementById("answered-queries-count");
      if (pendingQueriesEl) pendingQueriesEl.textContent = submissionData.pendingQueryCount || 0;
      if (answeredQueriesEl) answeredQueriesEl.textContent = submissionData.answeredQueryCount || 0;
      renderRecentStudentActivity(submissionData.submissions || []);
    } else {
      document.getElementById("solved-problems").textContent = "0";
    }

  } catch (error) {
    console.error("Error loading dashboard data:", error);
  }
}

function renderRecentStudentActivity(submissions) {
  const activityList = document.getElementById("recent-activity-list");
  if (!activityList) return;

  if (!Array.isArray(submissions) || submissions.length === 0) {
    activityList.innerHTML = `
      <div class="activity-item">
        <i class="fas fa-code"></i>
        <span>Welcome to VLAB! Start solving problems.</span>
      </div>
    `;
    return;
  }

  activityList.innerHTML = submissions.slice(0, 5).map((submission) => `
    <div class="activity-item">
      <i class="fas ${submission.teacherOverrideStatus === "pending" ? "fa-rotate-left" : (submission.status === "passed" ? "fa-check-circle" : (submission.queryStatus === "answered" ? "fa-comment-dots" : "fa-hourglass-half"))}"></i>
      <span>${submission.problem?.title || "Problem"} - ${formatSubmissionStatus(submission.status, submission.queryStatus, submission.teacherOverrideStatus)}</span>
    </div>
  `).join("");
}

// ============================
// 📚 PROBLEMS SECTION
// ============================
async function loadProblems() {
  try {
    const user = getStoredStudent();
    const subjectsList = document.getElementById("subjects-list");
    const tasksTitle = document.getElementById("tasks-title");

    if (!user?.year || !user?.semester) {
      if (subjectsList) {
        subjectsList.innerHTML = "<p>Please update your Year and Semester in Profile.</p>";
      }
      if (tasksTitle) tasksTitle.textContent = "Tasks";
      document.getElementById("problems-list").innerHTML = "<p>Set your Year and Semester to see tasks.</p>";
      return;
    }

    const subjects = await fetchSubjectsForYearSemester(user.year, user.semester);
    const subjectNames = subjects.map(s => s.name);

    if (!subjectsList) return;
    subjectsList.innerHTML = "";

    if (subjectNames.length === 0) {
      subjectsList.innerHTML = `<p>No subjects found for ${user.year} / ${user.semester}.</p>`;
      document.getElementById("problems-list").innerHTML = "<p>No tasks available.</p>";
      return;
    }

    const allProblems = await fetchAllProblems();
    const problems = allProblems.filter(p => subjectNames.includes(p.subject));

    subjectNames.forEach((subject, idx) => {
      const item = document.createElement("div");
      item.className = "subject-item" + (idx === 0 ? " active" : "");
      item.textContent = subject;
      item.addEventListener("click", () => {
        document.querySelectorAll(".subject-item").forEach(el => el.classList.remove("active"));
        item.classList.add("active");
        renderTasksForSubject(problems, subject);
      });
      subjectsList.appendChild(item);
    });

    renderTasksForSubject(problems, subjectNames[0]);

  } catch (error) {
    console.error("Error loading problems:", error);
    document.getElementById("problems-list").innerHTML = "Failed to load problems.";
  }
}


function displayProblems(problems) {
  const problemsList = document.getElementById("problems-list");
  problemsList.innerHTML = "";

  if (problems.length === 0) {
    problemsList.innerHTML = "<p>No problems found matching your filters.</p>";
    return;
  }

  problems.forEach(problem => {
    const problemCard = document.createElement("div");
    problemCard.className = "problem-card";
    problemCard.innerHTML = `
      <div class="problem-header">
        <h3>${problem.title}</h3>
        <span class="difficulty ${problem.difficulty?.toLowerCase()}">${problem.difficulty || 'Unknown'}</span>
      </div>
      <div class="problem-meta">
        <span><i class="fas fa-book"></i> ${problem.subject || 'N/A'}</span>
        <span><i class="fas fa-calendar"></i> ${problem.year || 'N/A'}</span>
      </div>
      <div class="problem-actions">
        <button class="btn-primary" onclick="solveProblem('${problem._id}', '${String(problem.language || "")}')">Solve Problem</button>
      </div>
    `;
    problemsList.appendChild(problemCard);
  });
}

function renderTasksForSubject(allProblems, subject) {
  const tasksTitle = document.getElementById("tasks-title");
  if (tasksTitle) tasksTitle.textContent = `Tasks • ${subject}`;
  const filtered = allProblems.filter(p => p.subject === subject);
  displayProblems(filtered);
}


function solveProblem(problemId, language = "") {
  const targetPage = String(language) === "1001" ? "web-ide.html" : "submission-ide.html";
  window.location.href = `${targetPage}?problem_id=${problemId}`;
}

function openPracticeRunner(type = "programming") {
  const targetPage = type === "web" ? "web-ide.html" : "submission-ide.html";
  window.location.href = `${targetPage}?mode=practice`;
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


// ============================
// 📤 SUBMISSIONS SECTION
// ============================
async function loadSubmissions() {
  const submissionsList = document.getElementById("submissions-list");
  try {
    const student = getStoredStudent();
    if (!student?.year || !student?.semester) {
      submissionsList.innerHTML = "<p>Please update your Year and Semester in Profile to view subject progress.</p>";
      return;
    }

    const res = await fetch(`${PROBLEMS_BASE_URL}/api/submissions/me`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("studentToken")}` }
    });
    if (!res.ok) throw new Error("Failed to load submissions");
    const data = await res.json();
    const submissions = Array.isArray(data.submissions) ? data.submissions : [];

    const [subjects, allProblems] = await Promise.all([
      fetchSubjectsForYearSemester(student.year, student.semester),
      fetchAllProblems()
    ]);

    const subjectNames = subjects.map((subject) => subject.name);
    const problems = allProblems.filter((problem) => subjectNames.includes(problem.subject));

    if (problems.length === 0) {
      submissionsList.innerHTML = "<p>No tasks available for your subjects yet.</p>";
      return;
    }

    const latestSubmissionByProblem = new Map();
    submissions.forEach((submission) => {
      const problemId = submission.problem?.id || submission.problem?._id;
      if (!problemId) return;

      const existing = latestSubmissionByProblem.get(problemId);
      if (!existing || new Date(submission.updatedAt) > new Date(existing.updatedAt)) {
        latestSubmissionByProblem.set(problemId, submission);
      }
    });

    const subjectProgress = subjectNames.map((subject) => {
      const subjectProblems = problems.filter((problem) => problem.subject === subject);
      const tasks = subjectProblems.map((problem) => {
        const submission = latestSubmissionByProblem.get(problem._id);
        const status = submission?.status || "pending";
        return {
          _id: problem._id,
          title: problem.title || "Problem",
          language: String(problem.language || ""),
          status,
          queryStatus: submission?.queryStatus || "none",
          teacherOverrideStatus: submission?.teacherOverrideStatus || "none",
          updatedAt: submission?.updatedAt || null,
          score: submission?.score || 0
        };
      });

      const completedCount = tasks.filter((task) => task.status === "passed").length;
      return {
        subject,
        total: tasks.length,
        completed: completedCount,
        tasks
      };
    }).filter((entry) => entry.total > 0);

    if (subjectProgress.length === 0) {
      submissionsList.innerHTML = "<p>No subject-wise tasks found yet.</p>";
      return;
    }

    submissionsList.innerHTML = subjectProgress.map((entry) => `
      <div class="submission-item subject-progress-item">
        <div class="submission-info">
          <div>
            <h4>${escapeHtml(entry.subject)}</h4>
            <p class="submission-summary">${entry.completed} of ${entry.total} tasks completed</p>
          </div>
          <span class="status ${entry.completed === entry.total ? "accepted" : "pending"}">${entry.completed}/${entry.total}</span>
        </div>
        <div class="subject-task-list">
          ${entry.tasks.map((task) => `
            <div class="subject-task-row">
              <div>
                <strong>${escapeHtml(task.title)}</strong>
                <span class="submission-meta">${task.updatedAt ? `Updated: ${new Date(task.updatedAt).toLocaleString()}` : "Not submitted yet"}</span>
              </div>
              <div class="subject-task-status">
                <span class="status ${mapSubmissionStatus(task.status, task.queryStatus, task.teacherOverrideStatus)}">${formatSubmissionStatus(task.status, task.queryStatus, task.teacherOverrideStatus)}</span>
                <span class="task-score">Score: ${task.score}</span>
                <button class="btn-secondary" onclick="solveProblem('${task._id}', '${task.language}')">Solve</button>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `).join("");
  } catch (error) {
    console.error("Error loading submissions:", error);
    submissionsList.innerHTML = "<p>Failed to load submissions.</p>";
  }
}

function mapSubmissionStatus(status, queryStatus = "none", teacherOverrideStatus = "none") {
  if (teacherOverrideStatus === "pending") return "info";
  if (status === "passed") return "accepted";
  if (queryStatus === "open" || queryStatus === "revised_by_student") return "query";
  if (queryStatus === "answered") return "info";
  if (status === "failed") return "rejected";
  return "pending";
}

function formatSubmissionStatus(status, queryStatus = "none", teacherOverrideStatus = "none") {
  if (status === "passed") return "Completed";
  if (teacherOverrideStatus === "pending") return "Unapproved by Teacher";
  if (queryStatus === "open") return "Query Sent";
  if (queryStatus === "revised_by_student") return "Query Revised";
  if (queryStatus === "answered") return "Answered";
  if (status === "failed") return "Attempted";
  return "Pending";
}

// ============================
// 👤 PROFILE SECTION
// ============================
function editProfile() {
  const user = getStoredStudent();
  if (!user?.academicEditEnabled) {
    alert("Admin has not enabled Year/Semester editing for your account yet.");
    return;
  }
  setProfileEditMode(true);
}

function cancelProfileEdit() {
  setProfileEditMode(false);
  const user = getStoredStudent();
  if (profileYearEl) profileYearEl.value = user?.year || "";
  if (profileSemesterEl) profileSemesterEl.value = user?.semester || "";
}

function setProfileEditMode(enabled) {
  if (profileYearEl) profileYearEl.disabled = !enabled;
  if (profileSemesterEl) profileSemesterEl.disabled = !enabled;
  if (editProfileBtn) editProfileBtn.style.display = enabled ? "none" : "inline-block";
  if (saveProfileBtn) saveProfileBtn.style.display = enabled ? "inline-block" : "none";
  if (cancelProfileBtn) cancelProfileBtn.style.display = enabled ? "inline-block" : "none";
}

async function saveProfile() {
  const year = profileYearEl ? profileYearEl.value : "";
  const semester = profileSemesterEl ? profileSemesterEl.value : "";
  const token = localStorage.getItem("studentToken");
  if (!token) return logout();

  try {
    const res = await fetch(`${AUTH_BASE_URL}/api/auth/me`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ year, semester })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Failed to update profile");
    }

    const updated = await res.json();
    localStorage.setItem("studentUser", JSON.stringify(updated));
    currentUser = updated;
    setProfileEditMode(false);
    refreshAcademicEditStatus(updated);

    // Refresh problems list to match updated year/semester
    if (document.getElementById("problems-section").classList.contains("active")) {
      loadProblems();
    }
  } catch (error) {
    console.error("Profile update failed:", error);
    alert(error.message || "Failed to update profile.");
  }
}

async function changeStudentPassword() {
  const currentPassword = document.getElementById("student-current-password")?.value || "";
  const newPassword = document.getElementById("student-new-password")?.value || "";
  const confirmPassword = document.getElementById("student-confirm-password")?.value || "";
  const token = localStorage.getItem("studentToken");

  if (!token) return logout();

  if (!currentPassword || !newPassword || !confirmPassword) {
    setStudentPasswordStatus("Please fill in all password fields.", "locked");
    return;
  }

  if (newPassword !== confirmPassword) {
    setStudentPasswordStatus("New password and confirm password do not match.", "locked");
    return;
  }

  setStudentPasswordStatus("Updating password...", "used");

  try {
    const res = await fetch(`${AUTH_BASE_URL}/api/auth/me/password`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ currentPassword, newPassword })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || "Failed to update password");
    }

    const currentEl = document.getElementById("student-current-password");
    const newEl = document.getElementById("student-new-password");
    const confirmEl = document.getElementById("student-confirm-password");
    if (currentEl) currentEl.value = "";
    if (newEl) newEl.value = "";
    if (confirmEl) confirmEl.value = "";

    setStudentPasswordStatus(data.message || "Password updated successfully.", "enabled");
  } catch (error) {
    console.error("Student password update failed:", error);
    setStudentPasswordStatus(error.message || "Failed to update password.", "locked");
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

  // Show selected section
  document.getElementById(`${sectionName}-section`).classList.add("active");

  // Add active class to clicked nav item
  const clickedNavItem = event?.target?.closest(".nav-item");
  if (clickedNavItem) {
    clickedNavItem.classList.add("active");
  } else {
    document.querySelectorAll(".nav-item").forEach((item) => {
      const targetSection = item.getAttribute("onclick") || "";
      if (targetSection.includes(`showSection('${sectionName}')`)) {
        item.classList.add("active");
      }
    });
  }

  // Load section data
  switch(sectionName) {
    case "problems":
      loadProblems();
      break;
    case "submissions":
      loadSubmissions();
      break;
    case "code-runner":
      break;
  }
}

// ============================
// 🚀 INITIALIZATION
// ============================
document.addEventListener("DOMContentLoaded", function() {
  currentUser = ensureLoggedIn();
  if (currentUser) {
    updateSidebarWelcome(currentUser);
    profileYearEl = document.getElementById("profile-year");
    profileSemesterEl = document.getElementById("profile-semester");
    editProfileBtn = document.getElementById("edit-profile-btn");
    saveProfileBtn = document.getElementById("save-profile-btn");
    cancelProfileBtn = document.getElementById("cancel-profile-btn");
    profileAcademicStatusEl = document.getElementById("profile-academic-status");
    studentPasswordStatusEl = document.getElementById("student-password-status");

    setProfileEditMode(false);
    refreshAcademicEditStatus(currentUser);
    loadDashboardData();
  }
});

function getStoredStudent() {
  try {
    return JSON.parse(localStorage.getItem("studentUser") || "{}");
  } catch {
    return null;
  }
}
