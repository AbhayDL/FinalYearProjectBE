const BASE_URL = localStorage.getItem("API_BASE_URL") || "http://localhost:4000";

let adminToken = localStorage.getItem("adminToken");
let adminUser = JSON.parse(localStorage.getItem("adminUser") || "{}");
let cachedDepartments = [];

async function ensureDepartmentsLoaded() {
  if (cachedDepartments.length > 0) return cachedDepartments;
  const deptRes = await authFetch(`${BASE_URL}/api/admin/departments`);
  if (!deptRes.ok) throw new Error("Failed to load departments");
  cachedDepartments = await deptRes.json();
  return cachedDepartments;
}

function toggleUserAcademicFields(role) {
  const ids = ["userDepartment", "userYear", "userSemester"];
  ids.forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    const group = input.closest(".form-group");
    const visible = role === "student";
    if (group) group.style.display = visible ? "" : "none";
    input.disabled = !visible;
    if (!visible) input.value = "";
  });
}

function populateDepartmentSelect(selectId, includeAllOption = false) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const firstOption = includeAllOption
    ? '<option value="">All Departments</option>'
    : '<option value="">Select Department</option>';
  select.innerHTML =
    firstOption +
    cachedDepartments
      .map((d) => `<option value="${d.name}">${d.name}${d.code ? ` (${d.code})` : ""}</option>`)
      .join("");
}

function parseBulkStudentsInput(rawText) {
  return String(rawText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(",").map((part) => part.trim());
      return {
        name: parts[0] || "",
        email: parts[1] || "",
        password: parts[2] || ""
      };
    });
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
// helper: fetch with auth header, redirect to login on 401/403
async function authFetch(url, options = {}) {
  adminToken = localStorage.getItem("adminToken");
  const headers = options.headers || {};
  if (adminToken) headers.Authorization = `Bearer ${adminToken}`;
  options.headers = headers;

  const res = await fetch(url, options);
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminUser");
    window.location.href = "login.html";
    return res; // unreachable but keeps function predictable
  }
  return res;
}

// ===== INITIALIZATION =====
document.addEventListener("DOMContentLoaded", async () => {
  // Basic presence check
  if (!adminToken || adminUser.role !== "admin") {
    window.location.href = "login.html";
    return;
  }

  // Validate token with server
  try {
    const res = await authFetch(`${BASE_URL}/api/auth/me`);
    if (!res.ok) return; // authFetch will redirect on 401/403
    const user = await res.json();
    adminUser = user;
    localStorage.setItem("adminUser", JSON.stringify(adminUser));
  } catch (err) {
    console.error('Auth validation failed', err);
    window.location.href = "login.html";
    return;
  }

  // Set admin name
  document.getElementById("adminName").textContent = `${adminUser.name} (Admin)`;

  // Load initial dashboard
  loadDashboard();

  // Setup event listeners
  setupNavigation();
  setupLogout();
  setupModals();
  setupSettings();
});

// ===== NAVIGATION =====
function setupNavigation() {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const page = item.getAttribute("data-page");
      showPage(page);
    });
  });
}

function showPage(pageName) {
  // Hide all pages
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));

  // Show selected page
  document.getElementById(pageName).classList.add("active");
  document.querySelector(`[data-page="${pageName}"]`).classList.add("active");

  // Update title
  const titles = {
    dashboard: "Dashboard",
    users: "User Management",
    subjects: "Subject Management",
    analytics: "Analytics",
    settings: "Settings",
  };
  document.getElementById("pageTitle").textContent = titles[pageName] || "Dashboard";

  // Load page content
  if (pageName === "dashboard") loadDashboard();
  if (pageName === "users") loadUsers();
  if (pageName === "subjects") loadSubjects();
  if (pageName === "analytics") loadAnalytics();
}

// ===== LOGOUT =====
function setupLogout() {
  document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminUser");
    window.location.href = "login.html";
  });
}

// ===== DASHBOARD =====
async function loadDashboard() {
  try {
    const res = await authFetch(`${BASE_URL}/api/admin/analytics/dashboard`);

    if (!res.ok) throw new Error("Failed to load dashboard");

    const data = await res.json();

    // Update stats
    document.getElementById("statStudents").textContent = data.summary.totalStudents;
    document.getElementById("statTeachers").textContent = data.summary.totalTeachers;
    document.getElementById("statSubjects").textContent = data.summary.totalSubjects;
    document.getElementById("statProblems").textContent = data.summary.totalProblems;

    // Display recent problems
    displayRecentProblems(data.recentProblems);
  } catch (error) {
    console.error("Dashboard load error:", error);
  }
}

function displayRecentProblems(problems) {
  const container = document.getElementById("recentProblems");
  if (problems.length === 0) {
    container.innerHTML = "<p>No problems yet</p>";
    return;
  }

  container.innerHTML = problems
    .map(
      (p) => `
    <div class="problem-item">
      <h4>${p.title}</h4>
      <p>Created by: ${p.createdBy?.name || "Unknown"}</p>
      <p>Subject: ${p.subject?.name || "N/A"} | Difficulty: ${p.difficulty}</p>
    </div>
  `
    )
    .join("");
}

// ===== USERS MANAGEMENT =====
async function loadUsers() {
  try {
    const res = await authFetch(`${BASE_URL}/api/admin/users`);

    if (!res.ok) throw new Error("Failed to load users");

    const users = await res.json();
    displayUsersTable(users);
  } catch (error) {
    console.error("Load users error:", error);
  }
}

function displayUsersTable(users) {
  const container = document.getElementById("usersList");
  if (!Array.isArray(users) || users.length === 0) {
    container.innerHTML = "<p>No users found.</p>";
    return;
  }

  const roles = [
    { label: "Teachers", key: "teacher" },
    { label: "Students", key: "student" },
    { label: "Admins", key: "admin" },
  ];

  const counts = roles.reduce((acc, role) => {
    acc[role.key] = users.filter((u) => u.role === role.key).length;
    return acc;
  }, {});

  const initialRole =
    roles.find((role) => counts[role.key] > 0)?.key || roles[0].key;

  container.innerHTML = `
    <div class="user-role-tabs">
      ${roles
        .map(
          (role) => `
            <button class="role-tab ${
              role.key === initialRole ? "active" : ""
            }" data-role="${role.key}">
              ${role.label}
              <span class="tab-count">${counts[role.key]}</span>
            </button>
          `
        )
        .join("")}
    </div>
    <div id="roleUsersTable" class="table-container"></div>
  `;

  const tableHost = container.querySelector("#roleUsersTable");

  const renderTable = (rows) => `
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Role</th>
          <th>Department</th>
          <th>Year</th>
          <th>Semester</th>
          <th>Academic Edit</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (user) => `
          <tr>
            <td>${user.name}</td>
            <td>${user.email}</td>
            <td><span class="badge badge-${user.role}">${user.role}</span></td>
            <td>${user.department || "N/A"}</td>
            <td>${user.year || "N/A"}</td>
            <td>${user.semester || "N/A"}</td>
            <td>${user.role === "student" ? (user.academicEditEnabled ? "Enabled" : (user.academicEditUsed ? "Used" : "Locked")) : "N/A"}</td>
            <td>${user.isActive ? "Active" : "Inactive"}</td>
            <td>
              <button class="btn btn-secondary" onclick="editUser('${user._id}')">Edit</button>
              ${user.role === "student" ? `<button class="btn btn-secondary" onclick="enableAcademicEditForStudent('${user._id}')">Enable Edit</button>` : ""}
              <button class="btn btn-secondary" onclick="deleteUser('${user._id}')">Delete</button>
            </td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;

  const setActiveRole = (roleKey) => {
    container.querySelectorAll(".role-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.role === roleKey);
    });

    const rows = users.filter((u) => u.role === roleKey);
    if (rows.length === 0) {
      const label = roles.find((r) => r.key === roleKey)?.label || "Users";
      tableHost.innerHTML = `<p class="collection-empty">No ${label.toLowerCase()} found.</p>`;
      return;
    }

    tableHost.innerHTML = renderTable(rows);
  };

  container.querySelectorAll(".role-tab").forEach((btn) => {
    btn.addEventListener("click", () => setActiveRole(btn.dataset.role));
  });

  setActiveRole(initialRole);
}

async function deleteUser(userId) {
  if (!confirm("Are you sure?")) return;

  try {
    const res = await authFetch(`${BASE_URL}/api/admin/users/${userId}`, {
      method: "DELETE",
    });

    if (res.ok) {
      alert("User deleted");
      loadUsers();
    }
  } catch (error) {
    console.error("Delete error:", error);
  }
}

// ===== SUBJECTS MANAGEMENT =====
async function loadSubjects() {
  try {
    const [res, deptRes] = await Promise.all([
      authFetch(`${BASE_URL}/api/admin/subjects`),
      authFetch(`${BASE_URL}/api/admin/departments`)
    ]);

    if (!res.ok) throw new Error("Failed to load subjects");
    if (!deptRes.ok) throw new Error("Failed to load departments");

    const subjects = await res.json();
    cachedDepartments = await deptRes.json();
    displayDepartmentsTable(cachedDepartments);
    displaySubjectsTable(subjects);

    // Populate teacher select in modal
    const teacherSelect = document.getElementById("subjectTeacher");
    const subjectDepartmentSelect = document.getElementById("subjectDepartment");
    const userDepartmentSelect = document.getElementById("userDepartment");
    const bulkDepartmentSelect = document.getElementById("bulkDepartment");
    const unlockDepartmentSelect = document.getElementById("unlockDepartment");
    const teachersRes = await authFetch(`${BASE_URL}/api/admin/users/teacher`);
    const teachers = await teachersRes.json();
    teacherSelect.innerHTML =
      '<option value="">Select Teacher</option>' +
      teachers.map((t) => `<option value="${t._id}">${t.name}</option>`).join("");
    const departmentOptions =
      '<option value="">Select Department</option>' +
      cachedDepartments.map((d) => `<option value="${d.name}">${d.name}${d.code ? ` (${d.code})` : ""}</option>`).join("");
    if (subjectDepartmentSelect) subjectDepartmentSelect.innerHTML = departmentOptions;
    if (userDepartmentSelect) userDepartmentSelect.innerHTML = departmentOptions;
    if (bulkDepartmentSelect) bulkDepartmentSelect.innerHTML = departmentOptions;
    if (unlockDepartmentSelect) populateDepartmentSelect("unlockDepartment", true);
  } catch (error) {
    console.error("Load subjects error:", error);
  }
}

function displayDepartmentsTable(departments) {
  const container = document.getElementById("departmentsList");
  if (!container) return;

  if (!Array.isArray(departments) || departments.length === 0) {
    container.innerHTML = "<p>No departments created yet.</p>";
    return;
  }

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Department</th>
          <th>Code</th>
          <th>Description</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${departments.map((department) => `
          <tr>
            <td>${department.name}</td>
            <td>${department.code || "—"}</td>
            <td>${department.description || "—"}</td>
            <td><button class="btn btn-secondary" onclick="deleteDepartment('${department._id}')">Delete</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function displaySubjectsTable(subjects) {
  const container = document.getElementById("subjectsList");

  const html = `
    <table>
      <thead>
        <tr>
          <th>Subject</th>
          <th>Code</th>
          <th>Department</th>
          <th>Teacher</th>
          <th>Year/Semester</th>
          <th>Problems</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${subjects
          .map(
            (subject) => `
          <tr>
            <td>${subject.name}</td>
            <td>${subject.code}</td>
            <td>${subject.department || "N/A"}</td>
            <td>${subject.assignedTeacher?.name || "Not assigned"}</td>
            <td>${subject.year || "N/A"} / ${subject.semester || "N/A"}</td>
            <td>${subject.totalProblems || 0}</td>
            <td>
              <button class="btn btn-secondary" onclick="editSubject('${subject._id}')">Edit</button>
              <button class="btn btn-secondary" onclick="deleteSubject('${subject._id}')">Delete</button>
            </td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;

  container.innerHTML = html;
}

async function deleteSubject(subjectId) {
  if (!confirm("Are you sure?")) return;

  try {
    const res = await authFetch(`${BASE_URL}/api/admin/subjects/${subjectId}`, {
      method: "DELETE",
    });

    if (res.ok) {
      alert("Subject deleted");
      loadSubjects();
    }
  } catch (error) {
    console.error("Delete error:", error);
  }
}

// ===== EDIT USER =====
function editUser(userId) {
  window.location.href = `edit-user.html?id=${userId}`;
}

// ===== EDIT SUBJECT =====
function editSubject(subjectId) {
  window.location.href = `edit-subject.html?id=${subjectId}`;
}

// ===== ANALYTICS =====
async function loadAnalytics() {
  try {
    const res = await authFetch(`${BASE_URL}/api/admin/analytics/statistics`);

    if (!res.ok) throw new Error("Failed to load analytics");

    const data = await res.json();
    displayAnalytics(data);
  } catch (error) {
    console.error("Analytics load error:", error);
  }
}

function renderAnalyticsList(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return '<p>No data</p>';
  return `<ul class="analytics-list">${arr
    .map(item => `
      <li>${item._id != null ? item._id : item.label || 'Unknown'}: ${
      item.count != null ? item.count : item.value || ''
    }</li>`)
    .join('')}</ul>`;
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
  return map[Number(languageId)] || String(languageId || "Unknown");
}

function renderLanguageAnalyticsList(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return "<p>No data</p>";
  return `<ul class="analytics-list">${arr
    .map((item) => `
      <li>${getLanguageLabel(item._id != null ? item._id : item.label)}: ${
        item.count != null ? item.count : item.value || ""
      }</li>`)
    .join("")}</ul>`;
}

function displayAnalytics(data) {
  const container = document.getElementById("analyticsContent");

  const html = `
    <div class="analytics-card">
      <h3>Users by Role</h3>
      ${renderAnalyticsList(data.usersByRole)}
    </div>
    <div class="analytics-card">
      <h3>Problems by Language</h3>
      ${renderLanguageAnalyticsList(data.problemsByLanguage)}
    </div>
    <div class="analytics-card">
      <h3>Subjects by Year</h3>
      ${renderAnalyticsList(data.subjectsByYear)}
    </div>
    <div class="analytics-card">
      <h3>Subjects by Semester</h3>
      ${renderAnalyticsList(data.subjectsBySemester)}
    </div>
    <div class="analytics-card">
      <h3>Subjects by Department</h3>
      ${renderAnalyticsList(data.subjectsByDepartment)}
    </div>
  `;

  container.innerHTML = html;
}

// ===== MODALS =====
function setupModals() {
  // Add user modal
  document.getElementById("addUserBtn").addEventListener("click", () => {
    ensureDepartmentsLoaded()
      .then(() => populateDepartmentSelect("userDepartment"))
      .catch((error) => console.error("Department preload failed:", error));
    document.getElementById("addUserModal").classList.add("active");
  });
  document.getElementById("bulkAddStudentsBtn").addEventListener("click", () => {
    ensureDepartmentsLoaded()
      .then(() => populateDepartmentSelect("bulkDepartment"))
      .catch((error) => console.error("Department preload failed:", error));
    document.getElementById("bulkAddStudentsModal").classList.add("active");
  });
  document.getElementById("unlockAcademicEditBtn").addEventListener("click", () => {
    ensureDepartmentsLoaded()
      .then(() => populateDepartmentSelect("unlockDepartment", true))
      .catch((error) => console.error("Department preload failed:", error));
    document.getElementById("unlockAcademicEditModal").classList.add("active");
  });
  document.getElementById("addDepartmentBtn").addEventListener("click", () => {
    document.getElementById("addDepartmentModal").classList.add("active");
  });

  document.getElementById("addUserForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const user = {
      name: document.getElementById("userName").value,
      email: document.getElementById("userEmail").value,
      password: document.getElementById("userPassword").value,
      role: document.getElementById("userRole").value,
      department: document.getElementById("userDepartment").value,
      year: document.getElementById("userYear").value,
      semester: document.getElementById("userSemester").value,
    };

    try {
      const res = await authFetch(`${BASE_URL}/api/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(user),
      });

      if (res.ok) {
        alert("User created successfully");
        closeModal("addUserModal");
        loadUsers();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.message || "Failed to create user");
      }
    } catch (error) {
      console.error("Error:", error);
      alert(error.message || "Failed to create user");
    }
  });

  const userRoleSelect = document.getElementById("userRole");
  if (userRoleSelect) {
    toggleUserAcademicFields(userRoleSelect.value);
    userRoleSelect.addEventListener("change", () => toggleUserAcademicFields(userRoleSelect.value));
  }

  // Add subject modal
  document.getElementById("addSubjectBtn").addEventListener("click", () => {
    document.getElementById("addSubjectModal").classList.add("active");
  });

  document.getElementById("addSubjectForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const subject = {
      name: document.getElementById("subjectName").value,
      code: document.getElementById("subjectCode").value,
      description: document.getElementById("subjectDesc").value,
      assignedTeacher: document.getElementById("subjectTeacher").value,
      department: document.getElementById("subjectDepartment").value,
      year: document.getElementById("subjectYear").value,
      semester: document.getElementById("subjectSem").value,
    };

    try {
      const res = await authFetch(`${BASE_URL}/api/admin/subjects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subject),
      });

      if (res.ok) {
        alert("Subject created successfully");
        closeModal("addSubjectModal");
        loadSubjects();
      } else {
        alert("Failed to create subject");
      }
    } catch (error) {
      console.error("Error:", error);
    }
  });

  document.getElementById("addDepartmentForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const department = {
      name: document.getElementById("departmentName").value,
      code: document.getElementById("departmentCode").value,
      description: document.getElementById("departmentDesc").value,
    };

    try {
      const res = await authFetch(`${BASE_URL}/api/admin/departments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(department),
      });

      if (res.ok) {
        alert("Department created successfully");
        closeModal("addDepartmentModal");
        loadSubjects();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.message || "Failed to create department");
      }
    } catch (error) {
      console.error("Error:", error);
    }
  });

  document.getElementById("bulkAddStudentsForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const students = parseBulkStudentsInput(document.getElementById("bulkStudentsInput").value);
    const file = document.getElementById("bulkStudentsFile").files?.[0];
    const payload = {
      department: document.getElementById("bulkDepartment").value,
      year: document.getElementById("bulkYear").value,
      semester: document.getElementById("bulkSemester").value,
      defaultPassword: document.getElementById("bulkDefaultPassword").value,
      students
    };

    try {
      if (!file && students.length === 0) {
        throw new Error("Add manual student rows or choose an Excel file.");
      }

      let endpoint = `${BASE_URL}/api/admin/users/bulk-students`;
      let body = JSON.stringify(payload);

      if (file) {
        endpoint = `${BASE_URL}/api/admin/users/bulk-students/import-excel`;
        const fileBase64 = await readFileAsBase64(file);
        body = JSON.stringify({
          department: payload.department,
          year: payload.year,
          semester: payload.semester,
          defaultPassword: payload.defaultPassword,
          fileBase64
        });
      }

      const res = await authFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to create students");
      }

      const skippedSummary = Array.isArray(data.skipped) && data.skipped.length
        ? ` Skipped: ${data.skipped.map((item) => `${item.email || `Row ${item.index + 1}`}: ${item.reason}`).join("; ")}`
        : "";
      alert(`${data.message || "Students created successfully."}${skippedSummary}`);
      closeModal("bulkAddStudentsModal");
      loadUsers();
    } catch (error) {
      console.error("Bulk student create error:", error);
      alert(error.message || "Failed to create students");
    }
  });

  document.getElementById("unlockAcademicEditForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      department: document.getElementById("unlockDepartment").value,
      year: document.getElementById("unlockYear").value,
      semester: document.getElementById("unlockSemester").value,
    };

    try {
      const res = await authFetch(`${BASE_URL}/api/admin/students/academic-edit/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to enable academic edit");
      }
      alert(data.message || "Academic edit enabled.");
      closeModal("unlockAcademicEditModal");
      loadUsers();
    } catch (error) {
      console.error("Academic unlock error:", error);
      alert(error.message || "Failed to enable academic edit");
    }
  });

  // Close modal buttons
  document.querySelectorAll(".close-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const modal = e.target.closest(".modal");
      if (modal) modal.classList.remove("active");
    });
  });
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove("active");
  document.getElementById(modalId.replace("Modal", "Form")).reset();
}

// ===== SETTINGS =====
function setSettingsStatus(type, message) {
  const status = document.getElementById("settingsStatus");
  if (!status) return;
  status.classList.remove("success", "error");
  if (type) status.classList.add(type);
  status.textContent = message;
}

function setupSettings() {
  const nameInput = document.getElementById("settingsName");
  const emailInput = document.getElementById("settingsEmail");
  const roleInput = document.getElementById("settingsRole");
  const profileForm = document.getElementById("settingsProfileForm");
  const passwordForm = document.getElementById("settingsPasswordForm");
  const exportUsersBtn = document.getElementById("exportUsersBtn");
  const exportSubjectsBtn = document.getElementById("exportSubjectsBtn");
  const exportProblemsBtn = document.getElementById("exportProblemsBtn");

  if (nameInput && emailInput && roleInput) {
    nameInput.value = adminUser.name || "";
    emailInput.value = adminUser.email || "";
    roleInput.value = adminUser.role || "admin";
  }

  if (profileForm) {
    profileForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = nameInput.value.trim();
      const email = emailInput.value.trim();
      if (!name || !email) {
        setSettingsStatus("error", "Name and email are required.");
        return;
      }

      try {
        const res = await authFetch(`${BASE_URL}/api/admin/users/${adminUser._id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            email,
            role: adminUser.role || "admin",
            isActive: adminUser.isActive !== false,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || "Failed to update profile");
        }

        const updated = await res.json();
        adminUser = updated;
        localStorage.setItem("adminUser", JSON.stringify(adminUser));
        document.getElementById("adminName").textContent = `${adminUser.name} (Admin)`;
        if (roleInput) roleInput.value = adminUser.role || "admin";
        setSettingsStatus("success", "Profile updated successfully.");
      } catch (error) {
        setSettingsStatus("error", error.message || "Update failed.");
      }
    });
  }

  if (passwordForm) {
    passwordForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const pwd = document.getElementById("settingsPassword").value;
      const confirm = document.getElementById("settingsPasswordConfirm").value;
      if (!pwd || pwd.length < 6) {
        setSettingsStatus("error", "Password must be at least 6 characters.");
        return;
      }
      if (pwd !== confirm) {
        setSettingsStatus("error", "Passwords do not match.");
        return;
      }

      try {
        const res = await authFetch(`${BASE_URL}/api/admin/users/${adminUser._id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: nameInput ? nameInput.value.trim() : adminUser.name,
            email: emailInput ? emailInput.value.trim() : adminUser.email,
            role: adminUser.role || "admin",
            isActive: adminUser.isActive !== false,
            password: pwd,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || "Failed to update password");
        }

        await res.json();
        document.getElementById("settingsPassword").value = "";
        document.getElementById("settingsPasswordConfirm").value = "";
        setSettingsStatus("success", "Password updated successfully.");
      } catch (error) {
        setSettingsStatus("error", error.message || "Update failed.");
      }
    });
  }

  if (exportUsersBtn) {
    exportUsersBtn.addEventListener("click", () => exportUsers());
  }
  if (exportSubjectsBtn) {
    exportSubjectsBtn.addEventListener("click", () => exportSubjects());
  }
  if (exportProblemsBtn) {
    exportProblemsBtn.addEventListener("click", () => exportProblems());
  }
}

async function deleteDepartment(departmentId) {
  if (!confirm("Are you sure?")) return;

  try {
    const res = await authFetch(`${BASE_URL}/api/admin/departments/${departmentId}`, {
      method: "DELETE",
    });

    if (res.ok) {
      alert("Department deleted");
      loadSubjects();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.message || "Failed to delete department");
    }
  } catch (error) {
    console.error("Delete department error:", error);
  }
}

async function enableAcademicEditForStudent(studentId) {
  try {
    const res = await authFetch(`${BASE_URL}/api/admin/students/${studentId}/academic-edit/unlock`, {
      method: "POST"
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || "Failed to enable academic edit");
    }
    alert(data.message || "Academic edit enabled.");
    loadUsers();
  } catch (error) {
    console.error("Enable student academic edit failed:", error);
    alert(error.message || "Failed to enable academic edit");
  }
}

function escapeCsv(value) {
  if (value == null) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCsv(filename, headers, rows) {
  const lines = [];
  lines.push(headers.map(escapeCsv).join(","));
  rows.forEach((row) => {
    lines.push(row.map(escapeCsv).join(","));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

async function exportUsers() {
  try {
    const res = await authFetch(`${BASE_URL}/api/admin/users`);
    if (!res.ok) throw new Error("Failed to export users");
    const users = await res.json();
    const headers = ["Name", "Email", "Role", "Department", "Year", "Semester", "Active", "Created At"];
    const rows = users.map((u) => [
      u.name,
      u.email,
      u.role,
      u.department || "",
      u.year || "",
      u.semester || "",
      u.isActive ? "Yes" : "No",
      u.createdAt || "",
    ]);
    downloadCsv("users.csv", headers, rows);
    setSettingsStatus("success", "Users export completed.");
  } catch (error) {
    setSettingsStatus("error", error.message || "Users export failed.");
  }
}

async function exportSubjects() {
  try {
    const res = await authFetch(`${BASE_URL}/api/admin/subjects`);
    if (!res.ok) throw new Error("Failed to export subjects");
    const subjects = await res.json();
    const headers = ["Name", "Code", "Department", "Teacher", "Year", "Semester", "Problems"];
    const rows = subjects.map((s) => [
      s.name,
      s.code || "",
      s.department || "",
      s.assignedTeacher?.name || "",
      s.year || "",
      s.semester || "",
      s.totalProblems || 0,
    ]);
    downloadCsv("subjects.csv", headers, rows);
    setSettingsStatus("success", "Subjects export completed.");
  } catch (error) {
    setSettingsStatus("error", error.message || "Subjects export failed.");
  }
}

async function exportProblems() {
  try {
    const res = await authFetch(`${BASE_URL}/api/admin/problems`);
    if (!res.ok) throw new Error("Failed to export problems");
    const problems = await res.json();
    const headers = ["Title", "Difficulty", "Language", "Subject", "Department", "Created By", "Created At"];
    const rows = problems.map((p) => [
      p.title,
      p.difficulty || "",
      p.language || "",
      p.subject?.name || "",
      p.subject?.department || "",
      p.createdBy?.name || "",
      p.createdAt || "",
    ]);
    downloadCsv("problems.csv", headers, rows);
    setSettingsStatus("success", "Problems export completed.");
  } catch (error) {
    setSettingsStatus("error", error.message || "Problems export failed.");
  }
}
