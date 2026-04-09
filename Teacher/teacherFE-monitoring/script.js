const DEFAULT_BASE_URL = localStorage.getItem("API_BASE_URL") || "http://localhost:4000";
const AUTH_BASE_URL = localStorage.getItem("AUTH_BASE_URL") || DEFAULT_BASE_URL;
const TEACHER_LOGIN_URL = "../../Student/index.html?role=teacher";

const state = {
  sessions: [],
  selectedSessionId: "",
  selectedStudentId: "",
  selectedProblemKey: "",
  search: "",
  subject: "all",
  status: "all",
  currentFrames: [],
  currentFrameIndex: 0,
  playbackTimer: null,
  isPlaying: false,
  currentSessionDetail: null,
};

const pageParams = new URLSearchParams(window.location.search);

function getBaseUrl(base) {
  try {
    const url = new URL(base);
    return url.origin;
  } catch {
    return DEFAULT_BASE_URL;
  }
}

const EFFECTIVE_AUTH_BASE = getBaseUrl(AUTH_BASE_URL);

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

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

function goToStudentDetail() {
  const studentId = state.selectedStudentId || pageParams.get("student_id") || "";
  if (!studentId) {
    goBack();
    return;
  }
  window.location.href = `../teacherFE-students/student-detail.html?student_id=${encodeURIComponent(studentId)}`;
}

function getTeacherToken() {
  const token = localStorage.getItem("teacherToken");
  if (!token) {
    window.location.href = TEACHER_LOGIN_URL;
    return null;
  }
  return token;
}

function setStatus(message, type = "") {
  const status = document.getElementById("statusMessage");
  if (!status) return;
  status.className = `status-message${type ? ` ${type}` : ""}`;
  status.textContent = message || "";
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

function formatDuration(start, end) {
  if (!start || !end) return "-";
  const diffMs = Math.max(0, new Date(end) - new Date(start));
  return formatDurationMs(diffMs);
}

function formatDurationMs(diffMs) {
  const safeDiffMs = Math.max(0, Number(diffMs) || 0);
  const totalSeconds = Math.floor(safeDiffMs / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins <= 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

function formatActiveDuration(session = {}) {
  if (Number.isFinite(Number(session?.activeDurationMs)) && Number(session.activeDurationMs) > 0) {
    return formatDurationMs(session.activeDurationMs);
  }
  return formatDuration(session?.startedAt, session?.lastEventAt);
}

function prettifyEventType(eventType) {
  return String(eventType || "")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getProblemKey(session) {
  return session.problem?.id || `general_${session.sessionId}`;
}

function getProblemSubject(session) {
  return session.problem?.subject || "General";
}

function updateSummary() {
  const totalStudentsEl = document.getElementById("totalStudents");
  const totalProblemsEl = document.getElementById("totalProblems");
  const activeSessionsEl = document.getElementById("activeSessions");
  const totalSnapshotsEl = document.getElementById("totalSnapshots");

  if (!totalStudentsEl || !totalProblemsEl || !activeSessionsEl || !totalSnapshotsEl) {
    return;
  }

  const students = buildStudentGroups();
  const problemKeys = new Set();
  let activeSessions = 0;
  let totalSnapshots = 0;

  state.sessions.forEach((session) => {
    const scopedProblemKey = `${session.student?.id || "unknown"}::${getProblemKey(session)}`;
    problemKeys.add(scopedProblemKey);
    if (session.status === "active") activeSessions += 1;
    totalSnapshots += Number(session.countsByType?.snapshot_captured || 0);
  });

  totalStudentsEl.textContent = students.length;
  totalProblemsEl.textContent = problemKeys.size;
  activeSessionsEl.textContent = activeSessions;
  totalSnapshotsEl.textContent = totalSnapshots;
}

function buildStudentGroups() {
  const studentMap = new Map();

  state.sessions.forEach((session) => {
    const studentId = session.student?.id || "unknown_student";
    if (!studentMap.has(studentId)) {
      studentMap.set(studentId, {
        id: studentId,
        name: session.student?.name || "Unknown student",
        email: session.student?.email || "",
        riskLabel: session.riskLabel || "low",
        activeCount: 0,
        flaggedCount: 0,
        problemCount: 0,
        highRiskCount: 0,
        subjects: new Set(),
        sessions: [],
        lastEventAt: session.lastEventAt,
      });
    }

    const group = studentMap.get(studentId);
    group.sessions.push(session);
    group.subjects.add(getProblemSubject(session));
    if (session.status === "active") group.activeCount += 1;
    if (session.riskLabel !== "low") group.flaggedCount += 1;
    if (session.riskLabel === "high") group.highRiskCount += 1;
    if (new Date(session.lastEventAt || 0) > new Date(group.lastEventAt || 0)) {
      group.lastEventAt = session.lastEventAt;
    }
    if ((session.riskLabel === "high") || (group.riskLabel !== "high" && session.riskLabel === "watch")) {
      group.riskLabel = session.riskLabel;
    }
  });

  studentMap.forEach((group) => {
    group.problemCount = new Set(group.sessions.map((session) => getProblemKey(session))).size;
  });

  return Array.from(studentMap.values()).sort((a, b) => new Date(b.lastEventAt || 0) - new Date(a.lastEventAt || 0));
}

function getFilteredStudents() {
  const groups = buildStudentGroups();
  return groups.filter((student) => {
    const query = state.search;
    const haystack = [student.name, student.email].join(" ").toLowerCase();
    const matchesSearch = !query || haystack.includes(query);
    const matchesSubject = state.subject === "all" || student.subjects.has(state.subject);
    const matchesStatus = state.status === "all" || student.sessions.some((session) => session.status === state.status);
    return matchesSearch && matchesSubject && matchesStatus;
  });
}

function populateSubjectFilter() {
  const subjectFilter = document.getElementById("subjectFilter");
  if (!subjectFilter) return;

  const subjects = Array.from(new Set(state.sessions.map((session) => getProblemSubject(session)))).sort((a, b) => a.localeCompare(b));
  subjectFilter.innerHTML = '<option value="all">All Subjects</option>' + subjects.map((subject) => `<option value="${escapeHtml(subject)}">${escapeHtml(subject)}</option>`).join("");
  subjectFilter.value = state.subject;
}

function updateResultsMeta(filteredStudents) {
  const resultsTitle = document.getElementById("resultsTitle");
  const resultsMeta = document.getElementById("resultsMeta");
  if (!resultsTitle || !resultsMeta) return;

  resultsTitle.textContent = filteredStudents.length === 1 ? "1 monitored student shown" : `${filteredStudents.length} monitored students shown`;
  resultsMeta.textContent = `Subject: ${state.subject} | Status: ${state.status} | Search: ${state.search || "none"}`;
}

function renderSelectedStudentMeta(student) {
  const meta = document.getElementById("selectedStudentMeta");
  const detailBtn = document.getElementById("studentDetailBtn");
  if (!meta || !detailBtn) return;

  if (!student) {
    meta.className = "selected-student-meta hidden";
    meta.innerHTML = "";
    detailBtn.classList.add("hidden");
    return;
  }

  meta.className = "selected-student-meta";
  meta.innerHTML = `
    <span class="meta-pill">Problems: ${student.problemCount}</span>
    <span class="meta-pill">Active Sessions: ${student.activeCount}</span>
    <span class="meta-pill">Last Activity: ${escapeHtml(formatDate(student.lastEventAt))}</span>
  `;
  detailBtn.classList.remove("hidden");
}

function renderStudents() {
  const list = document.getElementById("studentList");
  if (!list) return;

  const students = getFilteredStudents();
  updateResultsMeta(students);
  list.innerHTML = "";

  if (!state.sessions.length) {
    list.innerHTML = `
      <div class="empty-state roster-empty-state">
        <strong>No monitoring records found yet.</strong>
        <p>Once students start working in the IDE, monitored students will appear here.</p>
      </div>
    `;
    return;
  }

  if (!students.length) {
    list.innerHTML = `
      <div class="empty-state roster-empty-state">
        <strong>No students match the current filters.</strong>
        <p>Try clearing the search or changing the subject, risk, or status filter.</p>
      </div>
    `;
    return;
  }

  students.forEach((student) => {
    const card = document.createElement("article");
    card.className = `session-card${state.selectedStudentId === student.id ? " active" : ""}`;
    card.innerHTML = `
      <div class="session-card-top">
        <div>
          <div class="session-name-row">
            <strong>${escapeHtml(student.name)}</strong>
          </div>
          <p class="session-subtitle">${escapeHtml(student.email || "No email")}</p>
          <p class="session-problem">Subjects: ${escapeHtml(Array.from(student.subjects).join(", "))}</p>
        </div>
        <button class="action-btn" type="button" onclick="selectStudent('${student.id}')">View Problems</button>
      </div>
      <div class="session-metrics">
        <span class="meta-pill">Problems Monitored: ${student.problemCount}</span>
        <span class="meta-pill">Active Sessions: ${student.activeCount}</span>
        <span class="meta-pill">Last Activity: ${escapeHtml(formatDate(student.lastEventAt))}</span>
      </div>
    `;
    list.appendChild(card);
  });
}

function getStudentSessions(studentId) {
  return state.sessions.filter((session) => session.student?.id === studentId);
}

function getProblemGroupsForStudent(studentId) {
  const sessions = getStudentSessions(studentId).filter((session) => state.subject === "all" || getProblemSubject(session) === state.subject);
  const grouped = new Map();

  sessions.forEach((session) => {
    const key = getProblemKey(session);
    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        title: session.problem?.title || "General IDE Session",
        subject: getProblemSubject(session),
        latestSession: session,
        sessions: [],
      });
    }
    const group = grouped.get(key);
    group.sessions.push(session);
    if (new Date(session.lastEventAt || 0) > new Date(group.latestSession?.lastEventAt || 0)) {
      group.latestSession = session;
    }
  });

  return Array.from(grouped.values()).sort((a, b) => new Date(b.latestSession?.lastEventAt || 0) - new Date(a.latestSession?.lastEventAt || 0));
}

function renderProblemList() {
  const list = document.getElementById("problemList");
  const title = document.getElementById("problemStripTitle");
  const meta = document.getElementById("problemStripMeta");
  if (!list || !title || !meta) return;

  if (!state.selectedStudentId) {
    title.textContent = "Student Problem Monitoring";
    meta.textContent = "Select a student to view monitored problems by subject.";
    list.className = "problem-strip empty-state";
    list.innerHTML = "<p>Select a student to see monitored problems.</p>";
    renderSelectedStudentMeta(null);
    return;
  }

  const student = buildStudentGroups().find((entry) => entry.id === state.selectedStudentId);
  const problems = getProblemGroupsForStudent(state.selectedStudentId);
  renderSelectedStudentMeta(student);
  title.textContent = student ? `${student.name} - Problem Monitoring` : "Problem Monitoring";
  meta.textContent = state.subject === "all"
    ? "Showing all monitored problems for this student."
    : `Showing monitored problems in ${state.subject}.`;

  if (!problems.length) {
    list.className = "problem-strip empty-state";
    list.innerHTML = "<p>No monitored problems found for this student in the selected subject.</p>";
    return;
  }

  list.className = "problem-strip";
  list.innerHTML = problems.map((problem) => {
    const session = problem.latestSession || {};
    const snapshotCount = problem.sessions.reduce((total, entry) => total + Number(entry.countsByType?.snapshot_captured || 0), 0);
    return `
      <button class="problem-chip${state.selectedProblemKey === problem.key ? " active" : ""}" type="button" onclick="selectProblem('${problem.key}')">
        <strong>${escapeHtml(problem.title)}</strong>
        <span>${escapeHtml(problem.subject)}</span>
        <small>Latest review: ${escapeHtml(formatDate(session.lastEventAt))}</small>
        <div class="problem-chip-metrics">
          <span class="meta-pill">Sessions: ${problem.sessions.length}</span>
          <span class="meta-pill">Snapshots: ${snapshotCount}</span>
        </div>
      </button>
    `;
  }).join("");
}

function stopPlayback() {
  if (state.playbackTimer) {
    clearInterval(state.playbackTimer);
    state.playbackTimer = null;
  }
  state.isPlaying = false;
  const btn = document.getElementById("playerToggleBtn");
  if (btn) btn.textContent = "Play";
}

function updatePlayerStats(session) {
  const countsByType = session?.countsByType || {};
  const editEvents = Number(countsByType.save_code || 0) + Number(countsByType.run_code || 0);
  const tabSwitches = Number(countsByType.tab_hidden || 0);
  const blurEvents = Number(countsByType.page_blur || 0);
  const snapshots = Number(countsByType.snapshot_captured || 0);

  document.getElementById("playerTimeTaken").textContent = formatActiveDuration(session);
  document.getElementById("playerSnapshots").textContent = snapshots;
  document.getElementById("playerEditEvents").textContent = editEvents;
  document.getElementById("playerTabSwitches").textContent = tabSwitches;
  document.getElementById("playerWindowBlur").textContent = blurEvents;
}

function getDisplayFrames(timeline = []) {
  const withCode = timeline.filter((frame) => frame.metadata?.codeSnapshot);
  return withCode.length ? withCode : timeline;
}

function renderPlayerFrame() {
  const canvas = document.getElementById("playerCanvas");
  const range = document.getElementById("playerRange");
  if (!canvas || !range) return;

  const frames = state.currentFrames || [];
  const frame = frames[state.currentFrameIndex];

  range.max = Math.max(frames.length - 1, 0);
  range.value = Math.min(state.currentFrameIndex, Math.max(frames.length - 1, 0));

  if (!frame) {
    canvas.className = "player-canvas empty-state";
    canvas.innerHTML = `<p>Select a student and problem to review recorded activity.</p>`;
    return;
  }

  const detail = state.currentSessionDetail || {};
  const session = detail.session || {};
  const codeSnapshot = frame.metadata?.codeSnapshot || "No code snapshot recorded for this frame.";
  const snapshotReason = frame.metadata?.snapshotReason || frame.eventType || "event";
  const charCount = frame.metadata?.characterCount || codeSnapshot.length;
  const lineCount = frame.metadata?.lineCount || codeSnapshot.split(/\r?\n/).length;

  canvas.className = "player-canvas";
  canvas.innerHTML = `
    <div class="player-canvas-header">
      <div>
        <div class="session-name-row">
          <strong>${escapeHtml(session.student?.name || "Unknown student")}</strong>
        </div>
        <p class="session-subtitle">${escapeHtml(session.problem?.title || "General IDE Session")} | ${escapeHtml(session.problem?.subject || "General")}</p>
      </div>
      <div class="player-frame-badge">Frame ${state.currentFrameIndex + 1} / ${frames.length}</div>
    </div>

    <div class="player-frame-meta">
      <span class="meta-pill">Event: ${escapeHtml(prettifyEventType(frame.eventType))}</span>
      <span class="meta-pill">Recorded: ${escapeHtml(formatDate(frame.occurredAt))}</span>
      <span class="meta-pill">Snapshot: ${escapeHtml(prettifyEventType(snapshotReason))}</span>
      <span class="meta-pill">Lines: ${lineCount}</span>
      <span class="meta-pill">Chars: ${charCount}</span>
    </div>

    <div class="player-screen">
      <div class="player-screen-caption">Recorded Code Snapshot</div>
      <pre class="player-screen-code"><code>${escapeHtml(codeSnapshot)}</code></pre>
    </div>
  `;
}

function loadFramesIntoPlayer(detail) {
  state.currentSessionDetail = detail || {};
  state.currentFrames = getDisplayFrames(Array.isArray(detail?.timeline) ? detail.timeline : []);
  state.currentFrameIndex = 0;
  stopPlayback();
  updatePlayerStats(detail?.session || {});
  renderPlayerFrame();
}

function stepPlayer(direction) {
  if (!state.currentFrames.length) return;
  const maxIndex = state.currentFrames.length - 1;
  state.currentFrameIndex = Math.min(maxIndex, Math.max(0, state.currentFrameIndex + direction));
  renderPlayerFrame();
}

function togglePlayback() {
  if (!state.currentFrames.length) return;
  const btn = document.getElementById("playerToggleBtn");

  if (state.isPlaying) {
    stopPlayback();
    return;
  }

  state.isPlaying = true;
  if (btn) btn.textContent = "Pause";
  state.playbackTimer = setInterval(() => {
    if (state.currentFrameIndex >= state.currentFrames.length - 1) {
      stopPlayback();
      return;
    }
    state.currentFrameIndex += 1;
    renderPlayerFrame();
  }, 1200);
}

async function loadSessionDetail(sessionId) {
  const token = getTeacherToken();
  if (!token || !sessionId) return;

  state.selectedSessionId = sessionId;
  renderStudents();
  renderProblemList();
  setStatus("Loading monitoring review...");

  try {
    const res = await fetch(`${EFFECTIVE_AUTH_BASE}/api/monitoring/teacher/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Failed to load monitoring session");

    loadFramesIntoPlayer(data);
    setStatus("Monitoring review loaded.", "success");
  } catch (error) {
    console.error("Monitoring detail load failed:", error);
    setStatus(error.message || "Failed to load monitoring session.", "error");
  }
}

function selectProblem(problemKey) {
  state.selectedProblemKey = problemKey;
  renderProblemList();

  const problems = getProblemGroupsForStudent(state.selectedStudentId);
  const selectedProblem = problems.find((entry) => entry.key === problemKey);
  if (selectedProblem?.latestSession?.sessionId) {
    loadSessionDetail(selectedProblem.latestSession.sessionId);
  }
}

function selectStudent(studentId) {
  state.selectedStudentId = studentId;
  const problems = getProblemGroupsForStudent(studentId);
  state.selectedProblemKey = problems[0]?.key || "";
  renderStudents();
  renderProblemList();

  if (state.selectedProblemKey) {
    selectProblem(state.selectedProblemKey);
  } else {
    loadFramesIntoPlayer({ session: {}, timeline: [] });
  }
}

function resetFilters() {
  state.search = "";
  state.subject = "all";
  state.status = "all";

  document.getElementById("searchInput").value = "";
  document.getElementById("subjectFilter").value = "all";
  document.getElementById("statusFilter").value = "all";
  const availableStudents = getFilteredStudents();
  if (!availableStudents.some((student) => student.id === state.selectedStudentId)) {
    state.selectedStudentId = availableStudents[0]?.id || "";
  }
  const problems = state.selectedStudentId ? getProblemGroupsForStudent(state.selectedStudentId) : [];
  if (!problems.some((problem) => problem.key === state.selectedProblemKey)) {
    state.selectedProblemKey = problems[0]?.key || "";
  }
  renderStudents();
  renderProblemList();
  if (state.selectedProblemKey) {
    selectProblem(state.selectedProblemKey);
  } else {
    loadFramesIntoPlayer({ session: {}, timeline: [] });
  }
  setStatus("Monitoring filters reset.", "success");
}

function syncSelectionAfterFilterChange() {
  const availableStudents = getFilteredStudents();
  if (!availableStudents.some((student) => student.id === state.selectedStudentId)) {
    state.selectedStudentId = availableStudents[0]?.id || "";
    state.selectedProblemKey = "";
  }

  const problems = state.selectedStudentId ? getProblemGroupsForStudent(state.selectedStudentId) : [];
  if (!problems.some((problem) => problem.key === state.selectedProblemKey)) {
    state.selectedProblemKey = problems[0]?.key || "";
  }

  renderStudents();
  renderProblemList();
  if (state.selectedProblemKey) {
    selectProblem(state.selectedProblemKey);
  } else {
    loadFramesIntoPlayer({ session: {}, timeline: [] });
  }
}

function pickInitialStudentAndProblem() {
  const requestedStudentId = pageParams.get("student_id") || "";
  const requestedProblemId = pageParams.get("problem_id") || "";
  const students = getFilteredStudents();

  if (!students.length) {
    state.selectedStudentId = "";
    state.selectedProblemKey = "";
    return;
  }

  const matchedStudent = students.find((student) => student.id === requestedStudentId) || students[0];
  state.selectedStudentId = matchedStudent.id;

  const problems = getProblemGroupsForStudent(state.selectedStudentId);
  const matchedProblem = problems.find((problem) => problem.latestSession?.problem?.id === requestedProblemId || problem.latestSession?.problem?.id === requestedProblemId || problem.key === requestedProblemId);
  state.selectedProblemKey = matchedProblem?.key || problems[0]?.key || "";
}

async function loadMonitoringSessions() {
  const token = getTeacherToken();
  if (!token) return;

  setStatus("Fetching monitored students...");

  try {
    const res = await fetch(`${EFFECTIVE_AUTH_BASE}/api/monitoring/teacher/sessions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Failed to load monitoring sessions");

    state.sessions = Array.isArray(data.sessions) ? data.sessions : [];
    updateSummary();
    populateSubjectFilter();
    pickInitialStudentAndProblem();
    renderStudents();
    renderProblemList();

    const problems = state.selectedStudentId ? getProblemGroupsForStudent(state.selectedStudentId) : [];
    const selectedProblem = problems.find((entry) => entry.key === state.selectedProblemKey);
    const targetSessionId = selectedProblem?.latestSession?.sessionId || "";

    if (targetSessionId) {
      await loadSessionDetail(targetSessionId);
      if (pageParams.get("student_id") || pageParams.get("problem_id")) {
        setStatus("Opened the matching monitoring review for this student submission.", "success");
      }
    } else {
      loadFramesIntoPlayer({ session: {}, timeline: [] });
    }

    setStatus(`Loaded ${state.sessions.length} monitoring sessions.`, "success");
  } catch (error) {
    console.error("Monitoring sessions load failed:", error);
    document.getElementById("studentList").innerHTML = `
      <div class="empty-state roster-empty-state">
        <strong>Unable to load monitored students.</strong>
        <p>${escapeHtml(error.message || "Please try again later.")}</p>
      </div>
    `;
    document.getElementById("problemList").className = "problem-strip empty-state";
    document.getElementById("problemList").innerHTML = "<p>Problem monitoring is unavailable right now.</p>";
    loadFramesIntoPlayer({ session: {}, timeline: [] });
    setStatus(error.message || "Failed to load monitoring sessions.", "error");
  }
}

function bindControls() {
  document.getElementById("searchInput")?.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    syncSelectionAfterFilterChange();
  });

  document.getElementById("subjectFilter")?.addEventListener("change", (event) => {
    state.subject = event.target.value;
    syncSelectionAfterFilterChange();
  });

  document.getElementById("statusFilter")?.addEventListener("change", (event) => {
    state.status = event.target.value;
    syncSelectionAfterFilterChange();
  });

  document.getElementById("playerRange")?.addEventListener("input", (event) => {
    state.currentFrameIndex = Number(event.target.value || 0);
    renderPlayerFrame();
  });
}

window.addEventListener("DOMContentLoaded", () => {
  bindControls();
  loadFramesIntoPlayer({ session: {}, timeline: [] });
  loadMonitoringSessions();
});
