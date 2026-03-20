console.log('Problem view loaded');

const API_BASE = localStorage.getItem("API_BASE_URL") || "http://localhost:4000";

function goBack(){ window.location.href = 'index.html'; }

function getIdFromQuery(){ return new URLSearchParams(window.location.search).get('id'); }

function getToken(){
  const token = localStorage.getItem('teacherToken');
  if(!token){
    window.location.href = '../teacherFE-login/index.html';
    return null;
  }
  return token;
}

async function loadProblem(){
  const id = getIdFromQuery();
  if(!id){ document.getElementById('title').textContent = 'Problem ID missing'; return; }

  try{
    const token = getToken();
    const res = await fetch(`${API_BASE}/api/problems/${encodeURIComponent(id)}?includeHidden=true`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if(!res.ok) throw new Error('Failed to load');
    const p = await res.json();

    document.getElementById('title').textContent = p.title || 'Untitled';
    document.getElementById('meta').textContent = `${p.subject || ''} • ${p.difficulty || ''} • ${p.year || ''} ${p.semester? '• '+p.semester : ''}`;
    document.getElementById('description').textContent = p.description || '';
    document.getElementById('inputFormat').textContent = p.inputFormat || '—';
    document.getElementById('outputFormat').textContent = p.outputFormat || '—';
    document.getElementById('constraints').textContent = p.constraints || '—';
    document.getElementById('yearSem').textContent = `${p.year||'—'} ${p.semester? '/ '+p.semester: ''}`;
    document.getElementById('subject').textContent = p.subject || '—';
    document.getElementById('difficulty').textContent = p.difficulty || '—';
    document.getElementById('language').textContent = p.language || '—';
    document.getElementById('status').textContent = p.status || '—';
    document.getElementById('createdBy').textContent = p.createdBy || '—';
    document.getElementById('createdAt').textContent = p.createdAt ? new Date(p.createdAt).toLocaleString() : '—';

    const tcContainer = document.getElementById('testCases');
    tcContainer.innerHTML = '';
    if(p.testCases && p.testCases.length>0){
      p.testCases.forEach((tc,idx)=>{
        const el = document.createElement('div'); el.className='testcase';
        el.innerHTML = `<div><strong>Test Case #${idx+1} — ${tc.visibility}</strong></div><div style="margin-top:0.4rem"><div><strong>Input</strong><pre>${escapeHtml(tc.input)}</pre></div><div><strong>Output</strong><pre>${escapeHtml(tc.output)}</pre></div></div>`;
        tcContainer.appendChild(el);
      });
    } else {
      tcContainer.innerHTML = '<p>No test cases.</p>';
    }

    await loadSubmissionSummary(id, token);

  }catch(err){
    console.error(err);
    document.getElementById('title').textContent = 'Failed to load problem';
    document.getElementById('description').textContent = '';
  }
}

async function loadSubmissionSummary(problemId, token){
  const container = document.getElementById('submissionSummary');
  if(!container) return;
  container.innerHTML = '<p>Loading submission summary...</p>';

  try{
    const res = await fetch(`${API_BASE}/api/submissions/teacher/problem/${encodeURIComponent(problemId)}/summary`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if(!res.ok) throw new Error('Failed to load summary');
    const data = await res.json();

    const students = data.students || [];
    if(students.length === 0){
      container.innerHTML = '<p>No students found.</p>';
      return;
    }

    const header = `<div class="summary-header">
      <div>Total Students: ${data.totalStudents || students.length}</div>
      <div>Passed: ${data.passedCount || 0}</div>
    </div>`;

    const rows = students.map(s => {
      const statusClass = s.hasPassed ? 'passed' : 'pending';
      const statusText = s.hasPassed ? 'Passed' : 'Not yet';
      const submittedAt = s.submittedAt ? new Date(s.submittedAt).toLocaleString() : '-';
      return `<tr>
        <td>${escapeHtml(s.name || 'Unknown')}</td>
        <td>${escapeHtml(s.email || '')}</td>
        <td><span class="summary-status ${statusClass}">${statusText}</span></td>
        <td>${s.score || 0}</td>
        <td>${submittedAt}</td>
      </tr>`;
    }).join('');

    const table = `<table class="summary-table">
      <thead>
        <tr>
          <th>Student</th>
          <th>Email</th>
          <th>Status</th>
          <th>Score</th>
          <th>Submitted At</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

    container.innerHTML = header + table;
  }catch(err){
    console.error(err);
    container.innerHTML = '<p>Failed to load submission summary.</p>';
  }
}

function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

window.addEventListener('DOMContentLoaded', loadProblem);

function editCurrent(){
  const id = getIdFromQuery();
  if(id) window.location.href = `../teacherFE-upload_page/index.html?id=${encodeURIComponent(id)}`;
}

async function deleteCurrent(){
  const id = getIdFromQuery();
  if(!id) return;
  if(!confirm('Delete this problem? This cannot be undone.')) return;
  try{
    const token = getToken();
    if(!token) return;
    const res = await fetch(`${API_BASE}/api/problems/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if(!res.ok) throw new Error('Delete failed');
    alert('Problem deleted');
    window.location.href = 'index.html';
  }catch(err){
    console.error(err);
    alert('Failed to delete problem');
  }
}
