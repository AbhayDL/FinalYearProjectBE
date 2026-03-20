const BASE_URL = localStorage.getItem("API_BASE_URL") || "http://localhost:4000";
let adminToken = localStorage.getItem("adminToken");

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
  const res = await authFetch(`${BASE_URL}/api/admin/users/${userId}`);
  if (!res.ok) {
    alert("Failed to load user");
    window.location.href = "dashboard.html";
    return;
  }
  const user = await res.json();
  document.getElementById("userName").value = user.name;
  document.getElementById("userEmail").value = user.email;
  document.getElementById("userRole").value = user.role;
  document.getElementById("userStatus").value = user.isActive ? "true" : "false";
}

async function updateUser(e) {
  e.preventDefault();
  const name = document.getElementById("userName").value;
  const email = document.getElementById("userEmail").value;
  const role = document.getElementById("userRole").value;
  const isActive = document.getElementById("userStatus").value === "true";
  const password = document.getElementById("userPassword").value;
  const body = { name, email, role, isActive };
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
window.addEventListener("DOMContentLoaded", loadUser);
