const BASE_URL = localStorage.getItem("API_BASE_URL") || "http://localhost:4000";
let adminToken = localStorage.getItem("adminToken");

function toggleAcademicFields(role) {
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

function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

const userId = getQueryParam("id");
if (!userId) {
  alert("No user ID provided");
  window.location.href = "dashboard.html";
}

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
    return res;
  }
  return res;
}

async function loadUser() {
  const [res, deptRes] = await Promise.all([
    authFetch(`${BASE_URL}/api/admin/users/${userId}`),
    authFetch(`${BASE_URL}/api/admin/departments`)
  ]);
  if (!res.ok) {
    alert("Failed to load user");
    window.location.href = "dashboard.html";
    return;
  }
  const departments = deptRes.ok ? await deptRes.json() : [];
  const user = await res.json();
  const departmentSelect = document.getElementById("userDepartment");
  if (departmentSelect) {
    departmentSelect.innerHTML =
      '<option value="">Select Department</option>' +
      departments
        .map((department) => `<option value="${department.name}">${department.name}${department.code ? ` (${department.code})` : ""}</option>`)
        .join("");
    departmentSelect.value = user.department || "";
  }
  document.getElementById("userName").value = user.name;
  document.getElementById("userEmail").value = user.email;
  document.getElementById("userRole").value = user.role;
  document.getElementById("userStatus").value = user.isActive ? "true" : "false";
  document.getElementById("userYear").value = user.year || "";
  document.getElementById("userSemester").value = user.semester || "";
  toggleAcademicFields(user.role);
}

async function updateUser(e) {
  e.preventDefault();
  const name = document.getElementById("userName").value;
  const email = document.getElementById("userEmail").value;
  const role = document.getElementById("userRole").value;
  const department = document.getElementById("userDepartment").value;
  const year = document.getElementById("userYear").value;
  const semester = document.getElementById("userSemester").value;
  const isActive = document.getElementById("userStatus").value === "true";
  const password = document.getElementById("userPassword").value;
  const body = { name, email, role, department, year, semester, isActive };
  if (password) body.password = password;
  const res = await authFetch(`${BASE_URL}/api/admin/users/${userId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (res.ok) {
    alert("User updated successfully");
    window.location.href = "dashboard.html";
  } else {
    alert("Failed to update user");
  }
}

document.getElementById("editUserForm").addEventListener("submit", updateUser);
document.getElementById("userRole").addEventListener("change", (e) => toggleAcademicFields(e.target.value));
window.addEventListener("DOMContentLoaded", loadUser);
