const AUTH_BASE_URL = localStorage.getItem("API_BASE_URL") || "http://localhost:4000";
localStorage.setItem("API_BASE_URL", AUTH_BASE_URL);
localStorage.setItem("AUTH_BASE_URL", AUTH_BASE_URL);
localStorage.setItem("PROBLEMS_BASE_URL", AUTH_BASE_URL);
localStorage.setItem("EXECUTOR_BASE_URL", AUTH_BASE_URL);
const SHARED_REMEMBERED_ROLE_KEY = "sharedLoginRole";

const ROLE_CONFIG = {
  student: {
    title: "Student Login",
    subtitle: "Login to continue coding.",
    helper: "Use your student account created by admin.",
    success: "Redirecting to the student dashboard...",
    roleError: "Student access required.",
    rememberEmailKey: "studentEmail",
    rememberFlagKey: "studentRememberMe",
    tokenKey: "studentToken",
    userKey: "studentUser",
    sessionKey: "studentSession",
    redirect: "dashboard.html"
  },
  teacher: {
    title: "Teacher Login",
    subtitle: "Login to manage problems and student progress.",
    helper: "Use your teacher account created by admin.",
    success: "Redirecting to the teacher dashboard...",
    roleError: "Teacher access required.",
    rememberEmailKey: "teacherEmail",
    rememberFlagKey: "teacherRememberMe",
    tokenKey: "teacherToken",
    userKey: "teacherUser",
    sessionKey: "teacherSession",
    redirect: "../Teacher/teacherFE-dashboard/index.html"
  }
};

let currentRole = "student";

function getRoleConfig(role = currentRole) {
  return ROLE_CONFIG[role] || ROLE_CONFIG.student;
}

function setRole(role) {
  currentRole = ROLE_CONFIG[role] ? role : "student";
  const config = getRoleConfig();

  document.getElementById("loginTitle").textContent = config.title;
  document.getElementById("loginSubtitle").textContent = config.subtitle;
  document.getElementById("loginHelper").textContent = config.helper;
  document.getElementById("successMessage").textContent = config.success;

  document.querySelectorAll(".role-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.role === currentRole);
  });

  const savedEmail = localStorage.getItem(config.rememberEmailKey);
  const remembered = localStorage.getItem(config.rememberFlagKey) === "true";
  document.getElementById("email").value = remembered && savedEmail ? savedEmail : "";
  document.getElementById("rememberMe").checked = remembered && Boolean(savedEmail);
  document.getElementById("password").value = "";

  if (remembered && savedEmail) {
    localStorage.setItem(SHARED_REMEMBERED_ROLE_KEY, currentRole);
  }

  const url = new URL(window.location.href);
  url.searchParams.set("role", currentRole);
  window.history.replaceState({}, "", url.toString());
}

function togglePassword() {
  const passwordInput = document.getElementById("password");
  const toggleBtn = document.querySelector(".toggle-password");

  if (passwordInput.type === "password") {
    passwordInput.type = "text";
    toggleBtn.textContent = "Hide";
  } else {
    passwordInput.type = "password";
    toggleBtn.textContent = "Show";
  }
}

function handleLogin(event) {
  event.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const rememberMe = document.getElementById("rememberMe").checked;

  clearErrors();

  if (!email) {
    showError("emailError", "Please enter your email address");
    return;
  }

  if (!isValidEmail(email)) {
    showError("emailError", "Please enter a valid email address");
    return;
  }

  if (!password) {
    showError("passwordError", "Please enter your password");
    return;
  }

  if (password.length < 6) {
    showError("passwordError", "Password must be at least 6 characters");
    return;
  }

  performLogin(email, password, rememberMe);
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function showError(elementId, message) {
  const errorElement = document.getElementById(elementId);
  if (errorElement) {
    errorElement.textContent = message;
  }
}

function clearErrors() {
  const errorElements = document.querySelectorAll(".error-message");
  errorElements.forEach(el => el.textContent = "");
}

async function performLogin(email, password, rememberMe) {
  const loginBtn = document.getElementById("loginButton");
  const config = getRoleConfig();
  loginBtn.disabled = true;
  loginBtn.textContent = "Logging in...";

  try {
    const res = await fetch(`${AUTH_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Invalid email or password.");
    }

    const data = await res.json();
    if (!data.user || data.user.role !== currentRole) {
      throw new Error(config.roleError);
    }
    if (data.user.isActive === false) {
      throw new Error("Your account is inactive. Contact the admin.");
    }

    if (rememberMe) {
      localStorage.setItem(config.rememberEmailKey, data.user.email);
      localStorage.setItem(config.rememberFlagKey, "true");
      localStorage.setItem(SHARED_REMEMBERED_ROLE_KEY, currentRole);
    } else {
      localStorage.removeItem(config.rememberEmailKey);
      localStorage.removeItem(config.rememberFlagKey);
      localStorage.removeItem(SHARED_REMEMBERED_ROLE_KEY);
    }

    localStorage.setItem(config.tokenKey, data.token);
    localStorage.setItem(config.userKey, JSON.stringify(data.user));
    sessionStorage.setItem(config.sessionKey, "active");

    showSuccessModal();
    const next = new URLSearchParams(window.location.search).get("next");
    const target = next ? decodeURIComponent(next) : config.redirect;
    setTimeout(() => {
      window.location.href = target;
    }, 800);
  } catch (error) {
    showErrorModal(error.message || "Login failed. Please try again.");
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Login";
  }
}

function showErrorModal(message) {
  const modal = document.getElementById("errorModal");
  document.getElementById("errorMessage").textContent = message;
  modal.classList.add("show");
}

function showSuccessModal() {
  const modal = document.getElementById("successModal");
  modal.classList.add("show");
}

function closeModal() {
  document.getElementById("errorModal").classList.remove("show");
  document.getElementById("successModal").classList.remove("show");
}

document.addEventListener("DOMContentLoaded", function () {
  const roleFromUrl = new URLSearchParams(window.location.search).get("role");
  const rememberedRole = localStorage.getItem(SHARED_REMEMBERED_ROLE_KEY);
  setRole(roleFromUrl || rememberedRole || "student");

  const modals = document.querySelectorAll(".modal");
  window.addEventListener("click", function (event) {
    modals.forEach(modal => {
      if (event.target === modal) {
        closeModal();
      }
    });
  });
});

document.getElementById("loginForm").addEventListener("keypress", function (event) {
  if (event.key === "Enter") {
    handleLogin(event);
  }
});
