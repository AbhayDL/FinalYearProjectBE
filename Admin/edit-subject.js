const BASE_URL = localStorage.getItem("API_BASE_URL") || "http://localhost:4000";
let adminToken = localStorage.getItem("adminToken");

function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

const subjectId = getQueryParam("id");
if (!subjectId) {
  alert("No subject ID provided");
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

async function loadTeachers(selectedId) {
  const teacherSelect = document.getElementById("subjectTeacher");
  try {
    const teachersRes = await authFetch(`${BASE_URL}/api/admin/users/teacher`);
    if (!teachersRes.ok) throw new Error("Failed to fetch teachers");
    const teachers = await teachersRes.json();
    teacherSelect.innerHTML =
      '<option value="">Select Teacher</option>' +
      teachers.map((t) => `<option value="${t._id}" ${selectedId === t._id ? 'selected' : ''}>${t.name}</option>`).join("");
  } catch (error) {
    teacherSelect.innerHTML = '<option value="">No teachers found</option>';
    console.error("Teacher list error:", error);
  }
}

async function loadDepartments(selectedDepartment) {
  const departmentSelect = document.getElementById("subjectDepartment");
  try {
    const departmentRes = await authFetch(`${BASE_URL}/api/admin/departments`);
    if (!departmentRes.ok) throw new Error("Failed to fetch departments");
    const departments = await departmentRes.json();
    departmentSelect.innerHTML =
      '<option value="">Select Department</option>' +
      departments
        .map((department) => `<option value="${department.name}" ${selectedDepartment === department.name ? 'selected' : ''}>${department.name}${department.code ? ` (${department.code})` : ""}</option>`)
        .join("");
  } catch (error) {
    departmentSelect.innerHTML = '<option value="">No departments found</option>';
    console.error("Department list error:", error);
  }
}

async function loadSubject() {
  const res = await authFetch(`${BASE_URL}/api/admin/subjects/${subjectId}`);
  if (!res.ok) {
    alert("Failed to load subject");
    window.location.href = "dashboard.html";
    return;
  }
  const subject = await res.json();
  document.getElementById("subjectName").value = subject.name;
  document.getElementById("subjectCode").value = subject.code;
  document.getElementById("subjectDesc").value = subject.description || "";
  document.getElementById("subjectYear").value = subject.year || "";
  document.getElementById("subjectSem").value = subject.semester || "";
  await loadDepartments(subject.department || "");
  await loadTeachers(subject.assignedTeacher);
}

async function updateSubject(e) {
  e.preventDefault();
  const name = document.getElementById("subjectName").value;
  const code = document.getElementById("subjectCode").value;
  const description = document.getElementById("subjectDesc").value;
  const assignedTeacher = document.getElementById("subjectTeacher").value;
  const department = document.getElementById("subjectDepartment").value;
  const year = document.getElementById("subjectYear").value;
  const semester = document.getElementById("subjectSem").value;
  const res = await authFetch(`${BASE_URL}/api/admin/subjects/${subjectId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, code, description, assignedTeacher, department, year, semester })
  });
  if (res.ok) {
    alert("Subject updated successfully");
    window.location.href = "dashboard.html";
  } else {
    alert("Failed to update subject");
  }
}

document.getElementById("editSubjectForm").addEventListener("submit", updateSubject);
window.addEventListener("DOMContentLoaded", loadSubject);
