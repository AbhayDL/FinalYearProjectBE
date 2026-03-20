console.log("Teacher Login Page Loaded");

const API_BASE = localStorage.getItem("API_BASE_URL") || "http://localhost:4000";

// Ensure other teacher pages use the correct base URLs
localStorage.setItem("API_BASE_URL", API_BASE);
localStorage.setItem("AUTH_BASE_URL", API_BASE);
localStorage.setItem("PROBLEMS_BASE_URL", API_BASE);
localStorage.setItem("EXECUTOR_BASE_URL", API_BASE);

// Toggle Password Visibility
function togglePassword() {
  const passwordInput = document.getElementById('password');
  const toggleBtn = document.querySelector('.toggle-password');
  
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    toggleBtn.textContent = 'Hide';
  } else {
    passwordInput.type = 'password';
    toggleBtn.textContent = 'Show';
  }
}

// Handle Login
function handleLogin(event) {
  event.preventDefault();
  
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const rememberMe = document.getElementById('rememberMe').checked;

  // Clear previous errors
  clearErrors();

  // Validation
  if (!email) {
    showError('emailError', 'Please enter your email address');
    return;
  }

  if (!isValidEmail(email)) {
    showError('emailError', 'Please enter a valid email address');
    return;
  }

  if (!password) {
    showError('passwordError', 'Please enter your password');
    return;
  }

  if (password.length < 6) {
    showError('passwordError', 'Password must be at least 6 characters');
    return;
  }

  // Simulate login (replace with actual API call)
  performLogin(email, password, rememberMe);
}

// Email Validation
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Show Error
function showError(elementId, message) {
  const errorElement = document.getElementById(elementId);
  if (errorElement) {
    errorElement.textContent = message;
  }
}

// Clear Errors
function clearErrors() {
  const errorElements = document.querySelectorAll('.error-message');
  errorElements.forEach(el => el.textContent = '');
}

// Perform Login
async function performLogin(email, password, rememberMe) {
  const loginBtn = document.querySelector('.login-btn');
  loginBtn.disabled = true;
  loginBtn.textContent = 'Logging in...';

  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Invalid email or password.');
    }

    const data = await res.json();
    if (!data.user || data.user.role !== 'teacher') {
      throw new Error('Only teachers can login here.');
    }
    if (data.user.isActive === false) {
      throw new Error('Your account is inactive. Contact the admin.');
    }

    if (rememberMe) {
      localStorage.setItem('teacherEmail', data.user.email);
      localStorage.setItem('teacherRememberMe', 'true');
    } else {
      localStorage.removeItem('teacherEmail');
      localStorage.removeItem('teacherRememberMe');
    }

    localStorage.setItem('teacherToken', data.token);
    localStorage.setItem('teacherUser', JSON.stringify(data.user));
    sessionStorage.setItem('teacherSession', 'active');

    showSuccessModal();
    setTimeout(() => {
      window.location.href = '../teacherFE-dashboard/index.html';
    }, 800);
  } catch (error) {
    showErrorModal(error.message || 'Login failed. Please try again.');
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Login';
  }
}

// Show Error Modal
function showErrorModal(message) {
  const modal = document.getElementById('errorModal');
  document.getElementById('errorMessage').textContent = message;
  modal.classList.add('show');
}

// Show Success Modal
function showSuccessModal() {
  const modal = document.getElementById('successModal');
  modal.classList.add('show');
}

// Close Modal
function closeModal() {
  document.getElementById('errorModal').classList.remove('show');
  document.getElementById('successModal').classList.remove('show');
}

// Load Remember Me Data
document.addEventListener('DOMContentLoaded', function() {
  const rememberMe = localStorage.getItem('teacherRememberMe');
  const savedEmail = localStorage.getItem('teacherEmail');

  if (rememberMe === 'true' && savedEmail) {
    document.getElementById('email').value = savedEmail;
    document.getElementById('rememberMe').checked = true;
  }

  // Close modal when clicking outside
  const modals = document.querySelectorAll('.modal');
  window.addEventListener('click', function(event) {
    modals.forEach(modal => {
      if (event.target === modal) {
        closeModal();
      }
    });
  });
});

// Enter key to submit form
document.getElementById('loginForm').addEventListener('keypress', function(event) {
  if (event.key === 'Enter') {
    handleLogin(event);
  }
});
