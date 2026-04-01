console.log("SCRIPT LOADED");

const API_BASE = localStorage.getItem("API_BASE_URL") || "http://localhost:4000";
const DEFAULT_EXECUTOR_BASE = API_BASE;
const EXECUTOR_BASE_URL = localStorage.getItem("EXECUTOR_BASE_URL") || DEFAULT_EXECUTOR_BASE;
const TEACHER_LOGIN_URL = "../../Student/index.html?role=teacher";
const EXECUTOR_FALLBACK_URLS = [
  EXECUTOR_BASE_URL,
  API_BASE
];
const subjectSelect = document.getElementById('subject');
const subjectHint = document.getElementById('subjectHint');
const languageHint = document.getElementById('languageHint');
const yearSelect = document.getElementById('year');
const semesterSelect = document.getElementById('semester');
const languageSelect = document.getElementById('language');
const testCasesSection = document.getElementById('testCasesSection');
const guiReviewToggle = document.getElementById('guiReviewRequired');
const guiReviewHint = document.getElementById('guiReviewHint');
const guiReviewFields = document.getElementById('guiReviewFields');
const guiProblemTypeSelect = document.getElementById('guiProblemType');
const allowedLibrariesInput = document.getElementById('allowedLibraries');
const teacherChecklistInput = document.getElementById('teacherVerificationChecklist');
let assignedSubjects = [];
let assignedSubjectNames = new Set();

function goBack() {
  window.location.href = '../teacherFE-dashboard/index.html';
}

var testCases = [
  { input: '', output: '', visibility: 'visible' }
];

renderTestCases();

const subjectsReady = loadAssignedSubjects();
const languagesReady = loadExecutorLanguages();

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setSubjectHint(message, isError) {
  if (!subjectHint) return;
  subjectHint.textContent = message || '';
  subjectHint.classList.toggle('error', Boolean(isError));
}

function setSelectValue(selectEl, value) {
  if (!selectEl) return;
  if (!value) {
    selectEl.value = '';
    return;
  }
  const exists = Array.from(selectEl.options).some(opt => opt.value === value);
  if (!exists) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    selectEl.appendChild(option);
  }
  selectEl.value = value;
}

function isWebLanguage(languageId) {
  return String(languageId || '') === '1001';
}

function isGuiReviewProblem() {
  return Boolean(guiReviewToggle?.checked) || isWebLanguage(languageSelect?.value);
}

function updateLanguageMode() {
  const selectedLanguage = languageSelect ? languageSelect.value : '';
  const webMode = isWebLanguage(selectedLanguage);
  const guiMode = isGuiReviewProblem();

  if (testCasesSection) {
    testCasesSection.style.display = guiMode ? 'none' : 'block';
  }

  if (guiReviewFields) {
    guiReviewFields.style.display = guiMode ? 'block' : 'none';
  }

  if (guiReviewToggle) {
    guiReviewToggle.checked = guiMode;
    guiReviewToggle.disabled = webMode;
  }

  if (guiProblemTypeSelect) {
    if (webMode) {
      guiProblemTypeSelect.value = 'html';
    } else if (!guiProblemTypeSelect.value) {
      guiProblemTypeSelect.value = 'gui_other';
    }
  }

  if (languageHint) {
    languageHint.textContent = webMode
      ? 'HTML/CSS/JS problems use the separate Web IDE with live preview and go directly to teacher review.'
      : guiMode
        ? 'GUI / graph problems skip console test cases and are submitted directly for teacher review.'
        : '';
    languageHint.classList.toggle('error', false);
  }

  if (guiReviewHint) {
    guiReviewHint.textContent = guiMode
      ? 'Students will submit this problem directly to teacher review. Add allowed libraries and a teacher checklist below.'
      : '';
    guiReviewHint.classList.toggle('error', false);
  }
}

async function fetchWithExecutor(path) {
  let lastError;
  for (const base of EXECUTOR_FALLBACK_URLS) {
    if (!base) continue;
    try {
      const url = `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : "/" + path}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      localStorage.setItem("EXECUTOR_BASE_URL", base);
      return res;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

async function loadExecutorLanguages() {
  if (!languageSelect) return [];
  languageSelect.disabled = true;
  languageSelect.innerHTML = '<option value="">Loading languages...</option>';

  try {
    const res = await fetchWithExecutor("/api/languages");
    const langs = await res.json();
    if (!Array.isArray(langs) || langs.length === 0) {
      languageSelect.innerHTML = '<option value="">No languages available</option>';
      return [];
    }

    languageSelect.innerHTML =
      '<option value="">Select Language</option>' +
      langs
        .map((l) => {
          const name = normalizeLanguageName(l);
          return `<option value="${escapeHtml(String(l.id))}">${escapeHtml(name)}</option>`;
        })
        .join('');
    languageSelect.onchange = updateLanguageMode;
    if (guiReviewToggle) {
      guiReviewToggle.onchange = updateLanguageMode;
    }
    updateLanguageMode();
    return langs;
  } catch (err) {
    console.error("Failed to load languages:", err);
    languageSelect.innerHTML = '<option value="">Unable to load languages</option>';
    return [];
  } finally {
    languageSelect.disabled = false;
  }
}

function normalizeLanguageName(lang) {
  const raw = String(lang?.name || '').trim();
  if (raw) return raw.replace(/\s+/g, ' ');
  const map = {
    71: "Python 3",
    62: "Java",
    54: "C++",
    50: "C",
    63: "JavaScript",
    60: "Go",
    73: "Rust",
    72: "Ruby",
    1001: "HTML/CSS/JS"
  };
  return map[lang?.id] || "Language";
}

function setYearSemesterLocked(locked) {
  if (yearSelect) yearSelect.disabled = locked;
  if (semesterSelect) semesterSelect.disabled = locked;
}

function updateYearSemesterLock(subjectName) {
  const shouldLock = Boolean(subjectName);
  setYearSemesterLocked(shouldLock);
}

function applySubjectMeta(subjectName, options = {}) {
  if (!subjectName) return;
  const subject = assignedSubjects.find(s => s.name === subjectName);
  if (!subject) return;

  const force = options.force === true;
  if (force || (!yearSelect || !yearSelect.value)) {
    setSelectValue(yearSelect, subject.year || '');
  }
  if (force || (!semesterSelect || !semesterSelect.value)) {
    setSelectValue(semesterSelect, subject.semester || '');
  }
}

function getTeacherToken() {
  const token = localStorage.getItem('teacherToken');
  if (!token) {
    window.location.href = TEACHER_LOGIN_URL;
    return null;
  }
  return token;
}

function applySubjectSelection(subjectValue) {
  if (!subjectSelect) return;
  if (!subjectValue) {
    subjectSelect.value = '';
    updateYearSemesterLock('');
    return;
  }
  if (assignedSubjectNames.has(subjectValue)) {
    subjectSelect.value = subjectValue;
    setSubjectHint('', false);
    updateYearSemesterLock(subjectValue);
    return;
  }
  const option = document.createElement('option');
  option.value = subjectValue;
  option.textContent = `${subjectValue} (not assigned)`;
  option.disabled = true;
  option.selected = true;
  subjectSelect.prepend(option);
  setSubjectHint('This subject is not assigned to you. Contact the admin.', true);
  updateYearSemesterLock(subjectValue);
}

async function loadAssignedSubjects() {
  if (!subjectSelect) return [];
  const token = getTeacherToken();
  if (!token) return [];

  subjectSelect.disabled = true;
  subjectSelect.innerHTML = '<option value="">Loading subjects...</option>';
  setSubjectHint('', false);

  try {
    const res = await fetch(`${API_BASE}/api/teacher/subjects`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Unable to load assigned subjects.');
    const subjects = await res.json();
    assignedSubjects = Array.isArray(subjects) ? subjects : [];
    assignedSubjectNames = new Set(assignedSubjects.map(s => s.name));

    if (assignedSubjects.length === 0) {
      subjectSelect.innerHTML = '<option value="">No subjects assigned</option>';
      setSubjectHint('No subjects assigned. Contact the admin to assign subjects.', true);
      return assignedSubjects;
    }

    subjectSelect.innerHTML =
      '<option value="">Select Subject</option>' +
      assignedSubjects
        .map((s) => {
          const label = `${s.name}${s.code ? ` (${s.code})` : ''}`;
          return `<option value="${escapeHtml(s.name)}">${escapeHtml(label)}</option>`;
        })
        .join('');

    subjectSelect.onchange = () => {
      applySubjectMeta(subjectSelect.value, { force: true });
      updateYearSemesterLock(subjectSelect.value);
    };
    updateYearSemesterLock(subjectSelect.value);
    return assignedSubjects;
  } catch (err) {
    subjectSelect.innerHTML = '<option value="">Unable to load subjects</option>';
    setSubjectHint(err.message || 'Unable to load assigned subjects.', true);
    return [];
  } finally {
    subjectSelect.disabled = false;
  }
}

// Edit mode: if URL contains ?id=..., load problem and populate form
const urlParams = new URLSearchParams(window.location.search);
const editId = urlParams.get('id');
let isEditMode = false;
if (editId) {
  isEditMode = true;
  // fetch problem data
  const token = getTeacherToken();
  if (token) {
    fetch(`${API_BASE}/api/problems/${encodeURIComponent(editId)}?includeHidden=true`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        // populate fields; keep hidden testcases intact for teacher
        document.getElementById('problemTitle').value = data.title || '';
        document.getElementById('problemDescription').value = data.description || '';
        document.getElementById('inputFormat').value = data.inputFormat || '';
        document.getElementById('outputFormat').value = data.outputFormat || '';
        document.getElementById('constraints').value = data.constraints || '';
        if (guiReviewToggle) guiReviewToggle.checked = Boolean(data.guiReviewRequired);
        document.getElementById('year').value = data.year || '';
        document.getElementById('semester').value = data.semester || '';
        document.getElementById('difficulty').value = data.difficulty || '';
        if (guiProblemTypeSelect) guiProblemTypeSelect.value = data.guiProblemType || 'html';
        if (allowedLibrariesInput) allowedLibrariesInput.value = Array.isArray(data.allowedLibraries) ? data.allowedLibraries.join(', ') : '';
        if (teacherChecklistInput) teacherChecklistInput.value = Array.isArray(data.teacherVerificationChecklist) ? data.teacherVerificationChecklist.join('\n') : '';
        languagesReady.then(() => {
          setSelectValue(languageSelect, data.language || '');
          updateLanguageMode();
        });
        document.getElementById('status').value = data.status || 'published';

        subjectsReady.then(() => applySubjectSelection(data.subject || ''));

        if (data.testCases && data.testCases.length > 0) {
          testCases = data.testCases.map(tc => ({ input: tc.input || '', output: tc.output || '', visibility: tc.visibility || 'visible' }));
          renderTestCases();
        }

        const submitBtn = document.querySelector('.btn-submit');
        if (submitBtn) submitBtn.innerText = 'Update Problem';
      })
      .catch(err => {
        console.error('Failed to load problem for editing', err);
        alert('Failed to load problem for editing');
      });
  }
}

function renderTestCases() {
  var container = document.getElementById('testCasesList');
  container.innerHTML = '';

  for (var i = 0; i < testCases.length; i++) {
    var tc = testCases[i];
    var card = document.createElement('div');
    card.className = 'test-case-card';
    
    var header = document.createElement('div');
    header.className = 'test-case-header';
    
    var title = document.createElement('span');
    title.className = 'test-case-title';
    title.textContent = 'Test Case #' + (i + 1);
    header.appendChild(title);
    
    if (testCases.length > 1) {
      var removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn btn-remove';
      removeBtn.textContent = 'Remove';
      removeBtn.setAttribute('data-index', i);
      removeBtn.onclick = function() {
        removeTestCase(parseInt(this.getAttribute('data-index')));
      };
      header.appendChild(removeBtn);
    }
    
    card.appendChild(header);
    
    var select = document.createElement('select');
    select.className = 'select';
    select.innerHTML = '<option value="visible">Visible Test Case</option><option value="hidden">Hidden Test Case</option>';
    select.value = tc.visibility;
    select.setAttribute('data-index', i);
    select.onchange = function() {
      updateTestCase(parseInt(this.getAttribute('data-index')), 'visibility', this.value);
    };
    card.appendChild(select);
    
    var inputArea = document.createElement('textarea');
    inputArea.className = 'textarea';
    inputArea.rows = 3;
    inputArea.placeholder = 'Input data...';
    inputArea.value = tc.input;
    inputArea.setAttribute('data-index', i);
    inputArea.oninput = function() {
      updateTestCase(parseInt(this.getAttribute('data-index')), 'input', this.value);
    };
    card.appendChild(inputArea);
    
    var outputArea = document.createElement('textarea');
    outputArea.className = 'textarea';
    outputArea.rows = 3;
    outputArea.placeholder = 'Expected output...';
    outputArea.value = tc.output;
    outputArea.setAttribute('data-index', i);
    outputArea.oninput = function() {
      updateTestCase(parseInt(this.getAttribute('data-index')), 'output', this.value);
    };
    card.appendChild(outputArea);
    
    container.appendChild(card);
  }
}

function addTestCase() {
  testCases.push({ input: '', output: '', visibility: 'visible' });
  renderTestCases();
}

function removeTestCase(index) {
  if (testCases.length > 1) {
    testCases.splice(index, 1);
    renderTestCases();
  }
}

function updateTestCase(index, field, value) {
  testCases[index][field] = value;
}

function handleSubmit() {
  const token = getTeacherToken();
  if (!token) return;

  const title = document.getElementById('problemTitle').value.trim();
  const description = document.getElementById('problemDescription').value.trim();
  const language = document.getElementById('language').value;
  const subject = subjectSelect ? subjectSelect.value : '';

  if (!title || !description || !language) {
    alert("Title, Description, and Language are required");
    return;
  }

  if (!subject) {
    setSubjectHint('Select a subject assigned to you.', true);
    alert('Please select a subject assigned to you.');
    return;
  }

  if (!assignedSubjectNames.has(subject)) {
    setSubjectHint('Selected subject is not assigned to you.', true);
    alert('You can only upload problems for your assigned subjects.');
    return;
  }

  if (!isGuiReviewProblem()) {
    for (let i = 0; i < testCases.length; i++) {
      if (!testCases[i].input.trim() || !testCases[i].output.trim()) {
        alert(`Test Case #${i + 1} input and output are required`);
        return;
      }
    }
  }

  const formData = {
    title,
    description,
    inputFormat: document.getElementById('inputFormat').value,
    outputFormat: document.getElementById('outputFormat').value,
    constraints: document.getElementById('constraints').value,
    guiReviewRequired: isGuiReviewProblem(),
    guiProblemType: isGuiReviewProblem() ? (guiProblemTypeSelect?.value || (isWebLanguage(language) ? 'html' : 'gui_other')) : 'standard',
    allowedLibraries: String(allowedLibrariesInput?.value || ''),
    teacherVerificationChecklist: String(teacherChecklistInput?.value || ''),
    year: document.getElementById('year').value,
    semester: document.getElementById('semester').value,
    subject,
    difficulty: document.getElementById('difficulty').value,
    language,
    status: document.getElementById('status').value,
    testCases: isGuiReviewProblem() ? [] : testCases
  };

  // attach createdBy if available
  const teacherEmail = localStorage.getItem('teacherEmail');
  if (teacherEmail) formData.createdBy = teacherEmail;

  const submitBtn = document.querySelector(".btn-submit");
  submitBtn.disabled = true;
  submitBtn.innerText = "Submitting...";

  const endpoint = isEditMode
    ? `${API_BASE}/api/problems/${encodeURIComponent(editId)}`
    : `${API_BASE}/api/problems/add`;
  const method = isEditMode ? 'PUT' : 'POST';

  fetch(endpoint, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(formData)
  })
  .then(res => res.json())
  .then(data => {
    alert(isEditMode ? "Problem updated successfully!" : "Problem uploaded successfully!");
    console.log("Saved in DB:", data);
    submitBtn.disabled = false;
    submitBtn.innerText = "Submit Problem";
  })
  .catch(err => {
    console.error("Error:", err);
    alert("Failed to upload problem");
    submitBtn.disabled = false;
    submitBtn.innerText = "Submit Problem";
  });
}
