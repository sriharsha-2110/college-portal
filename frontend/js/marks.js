// ===== MARKS MODULE =====

let editingMarksId = null;
let classReportTimeout = null;

// ─── SUBJECT ROW MANAGEMENT ─────────────────────────────────────────────────

function addSubjectRow(data = {}) {
  const tbody = document.getElementById('subjects-body');
  const idx = tbody.children.length;
  const tr = document.createElement('tr');
  tr.className = 'subject-row';
  tr.innerHTML = `
    <td><input type="text" class="marks-input" placeholder="CS401" value="${data.subjectCode || ''}" oninput="this.value=this.value.toUpperCase()" /></td>
    <td><input type="text" class="marks-input wide" placeholder="Subject Name" value="${escapeHtml(data.subjectName || '')}" /></td>
    <td><input type="number" class="marks-input small" placeholder="—" min="0" max="30" step="0.5" value="${data.ia1 ?? ''}" /></td>
    <td><input type="number" class="marks-input small" placeholder="—" min="0" max="30" step="0.5" value="${data.ia2 ?? ''}" /></td>
    <td><input type="number" class="marks-input small" placeholder="—" min="0" max="30" step="0.5" value="${data.ia3 ?? ''}" /></td>
    <td><input type="number" class="marks-input small" placeholder="—" min="0" max="100" step="0.5" value="${data.see ?? ''}" /></td>
    <td><input type="number" class="marks-input small" placeholder="4" min="1" max="6" value="${data.credits ?? 4}" /></td>
    <td><button class="row-del-btn" onclick="this.closest('tr').remove()" title="Remove">✕</button></td>
  `;
  tbody.appendChild(tr);
}

function collectSubjects() {
  const rows = document.querySelectorAll('#subjects-body .subject-row');
  return Array.from(rows).map(row => {
    const inputs = row.querySelectorAll('input');
    return {
      subjectCode: inputs[0].value.trim().toUpperCase(),
      subjectName: inputs[1].value.trim(),
      ia1: inputs[2].value !== '' ? parseFloat(inputs[2].value) : null,
      ia2: inputs[3].value !== '' ? parseFloat(inputs[3].value) : null,
      ia3: inputs[4].value !== '' ? parseFloat(inputs[4].value) : null,
      see: inputs[5].value !== '' ? parseFloat(inputs[5].value) : null,
      credits: parseInt(inputs[6].value) || 4,
    };
  }).filter(s => s.subjectCode && s.subjectName);
}

function initMarksForm() {
  const tbody = document.getElementById('subjects-body');
  if (tbody && tbody.children.length === 0) {
    // Add 6 default empty rows
    for (let i = 0; i < 6; i++) addSubjectRow();
  }
}

function resetMarksForm() {
  editingMarksId = null;
  ['me-usn','me-name','me-year','me-remarks'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['me-semester','me-branch','me-section'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('subjects-body').innerHTML = '';
  for (let i = 0; i < 6; i++) addSubjectRow();
  hideMarksMessages();
  document.getElementById('save-marks-btn').querySelector('span') &&
    (document.getElementById('save-marks-btn').innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,8 15,8"/></svg> Save Marks`);
}

function hideMarksMessages() {
  document.getElementById('marks-entry-error').classList.add('hidden');
  document.getElementById('marks-entry-success').classList.add('hidden');
}

// ─── LOOKUP EXISTING MARKS ───────────────────────────────────────────────────

async function lookupUSN() {
  const usn = document.getElementById('me-usn').value.trim().toUpperCase();
  const sem = document.getElementById('me-semester').value;
  const year = document.getElementById('me-year').value.trim();

  if (!usn) { showMarksError('Please enter a USN first.'); return; }

  try {
    const res = await MarksAPI.getByUSN(usn);
    if (!res.ok || !res.data.records.length) {
      showMarksError(`No existing marks found for ${usn}.`);
      return;
    }

    // Find matching record by semester+year if provided
    let record = res.data.records[0];
    if (sem || year) {
      const match = res.data.records.find(r =>
        (!sem || r.semester == sem) && (!year || r.academicYear === year)
      );
      if (match) record = match;
    }

    // Populate form
    editingMarksId = record._id;
    document.getElementById('me-usn').value = record.usn;
    document.getElementById('me-name').value = record.studentName;
    document.getElementById('me-semester').value = record.semester;
    document.getElementById('me-branch').value = record.branch;
    document.getElementById('me-section').value = record.section;
    document.getElementById('me-year').value = record.academicYear;
    if (record.remarks) document.getElementById('me-remarks').value = record.remarks;

    // Populate subject rows
    document.getElementById('subjects-body').innerHTML = '';
    record.subjects.forEach(s => addSubjectRow(s));

    showMarksSuccess(`Loaded existing record (Sem ${record.semester}, ${record.academicYear}). Editing mode active.`);
    document.getElementById('save-marks-btn').innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,8 15,8"/></svg> Update Marks`;
  } catch (err) {
    showMarksError('Failed to load existing marks.');
  }
}

// ─── SAVE MARKS ─────────────────────────────────────────────────────────────

async function saveMarks() {
  hideMarksMessages();

  const usn = document.getElementById('me-usn').value.trim().toUpperCase();
  const studentName = document.getElementById('me-name').value.trim();
  const semester = document.getElementById('me-semester').value;
  const branch = document.getElementById('me-branch').value;
  const section = document.getElementById('me-section').value;
  const academicYear = document.getElementById('me-year').value.trim();
  const remarks = document.getElementById('me-remarks').value.trim();
  const subjects = collectSubjects();

  if (!usn || !studentName || !semester || !branch || !section || !academicYear) {
    showMarksError('Please fill in all student information fields.'); return;
  }
  if (subjects.length === 0) {
    showMarksError('Please add at least one subject with code and name.'); return;
  }

  const btn = document.getElementById('save-marks-btn');
  btn.disabled = true;

  try {
    let res;
    if (editingMarksId) {
      res = await MarksAPI.update(editingMarksId, { subjects, remarks, studentName });
    } else {
      res = await MarksAPI.save({ usn, studentName, semester, branch, section, academicYear, subjects, remarks });
    }

    if (res.ok) {
      showMarksSuccess(editingMarksId ? '✅ Marks updated successfully!' : '✅ Marks saved successfully!');
      showToast(editingMarksId ? 'Marks updated!' : 'Marks saved!');
      editingMarksId = res.data.marks._id; // switch to edit mode
      document.getElementById('save-marks-btn').innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,8 15,8"/></svg> Update Marks`;
    } else {
      showMarksError(res.data.message || 'Failed to save marks.');
    }
  } catch (err) {
    showMarksError('Server error. Please try again.');
  } finally {
    btn.disabled = false;
  }
}

function showMarksError(msg) {
  const el = document.getElementById('marks-entry-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}
function showMarksSuccess(msg) {
  const el = document.getElementById('marks-entry-success');
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ─── CLASS REPORT ────────────────────────────────────────────────────────────

let classReportDebounce = null;
function debounceClassReport() {
  clearTimeout(classReportDebounce);
  classReportDebounce = setTimeout(loadClassReport, 500);
}

async function loadClassReport() {
  const semester = document.getElementById('cr-semester').value;
  const branch = document.getElementById('cr-branch').value;
  const section = document.getElementById('cr-section').value;
  const academicYear = document.getElementById('cr-year').value.trim();
  const container = document.getElementById('class-report-content');

  if (!semester) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><h3>Select a semester</h3><p>Choose at least a semester to load the report.</p></div>`;
    return;
  }

  container.innerHTML = `<div class="loading-state"><div class="loading-dots"><span></span><span></span><span></span></div><p>Loading class data...</p></div>`;

  const params = {};
  if (semester) params.semester = semester;
  if (branch) params.branch = branch;
  if (section) params.section = section;
  if (academicYear) params.academicYear = academicYear;

  try {
    const [recordsRes, statsRes] = await Promise.all([
      MarksAPI.getClass(params),
      MarksAPI.getClassStats(params),
    ]);

    if (!recordsRes.ok) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Error loading data</h3><p>${recordsRes.data.message}</p></div>`;
      return;
    }

    const records = recordsRes.data.records;
    const stats = statsRes.ok ? statsRes.data.stats : null;

    if (!records.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><h3>No records found</h3><p>No marks have been entered for these filters yet.</p></div>`;
      return;
    }

    container.innerHTML = renderClassReport(records, stats, params);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📡</div><h3>Connection error</h3></div>`;
  }
}

function renderClassReport(records, stats, params) {
  const gradeColor = { O:'#16a34a','A+':'#2563eb',A:'#7c3aed','B+':'#d97706',B:'#ea580c',C:'#dc2626',P:'#6b7280',F:'#991b1b','—':'#9ca3af' };

  // Stats summary cards
  let statsHtml = '';
  if (stats) {
    // Medal icons for top performers
    const medals = ['🥇', '🥈', '🥉', '🏅', '🏅'];

    // Grade distribution bar
    const gd = stats.gradeDistribution || {};
    const gradeItems = [
      { label: 'O', count: gd.O || 0, color: '#16a34a' },
      { label: 'A+', count: gd['A+'] || 0, color: '#2563eb' },
      { label: 'A', count: gd.A || 0, color: '#7c3aed' },
      { label: 'B+', count: gd['B+'] || 0, color: '#d97706' },
      { label: 'B', count: gd.B || 0, color: '#ea580c' },
      { label: '<B', count: gd.others || 0, color: '#991b1b' },
    ];
    const totalForDist = gradeItems.reduce((s, g) => s + g.count, 0) || 1;

    statsHtml = `
    <div class="cr-stats-grid">
      <div class="cr-stat-card"><div class="cr-stat-num">${stats.totalStudents}</div><div class="cr-stat-label">Total Students</div></div>
      <div class="cr-stat-card accent"><div class="cr-stat-num">${stats.avgCGPA}</div><div class="cr-stat-label">Avg CGPA</div></div>
      <div class="cr-stat-card"><div class="cr-stat-num">${stats.avgPercent}%</div><div class="cr-stat-label">Avg Marks</div></div>
      <div class="cr-stat-card green"><div class="cr-stat-num">${stats.passedAll}</div><div class="cr-stat-label">All Clear</div></div>
      <div class="cr-stat-card red"><div class="cr-stat-num">${stats.withBacklogs}</div><div class="cr-stat-label">With Backlogs</div></div>
    </div>

    <!-- Grade Distribution Bar -->
    <div class="cr-section-title">Grade Distribution</div>
    <div class="grade-dist-section">
      <div class="grade-dist-bar">
        ${gradeItems.map(g => g.count > 0 ? `<div class="grade-dist-segment" style="width:${(g.count/totalForDist)*100}%;background:${g.color}" title="${g.label}: ${g.count} students"></div>` : '').join('')}
      </div>
      <div class="grade-dist-legend">
        ${gradeItems.map(g => `<div class="grade-legend-item"><span class="grade-legend-dot" style="background:${g.color}"></span>${g.label} <strong>${g.count}</strong></div>`).join('')}
      </div>
    </div>

    <!-- Top Performers -->
    ${(stats.topPerformers && stats.topPerformers.length) ? `
    <div class="cr-section-title" style="margin-top:2rem">🏆 Top Performers</div>
    <div class="toppers-grid">
      ${stats.topPerformers.map((s, i) => `
        <div class="topper-card ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}">
          <div class="topper-rank">${medals[i] || '🏅'}</div>
          <div class="topper-info">
            <div class="topper-name">${escapeHtml(s.studentName)}</div>
            <div class="topper-usn">${escapeHtml(s.usn)} · Sec ${s.section}</div>
          </div>
          <div class="topper-scores">
            <div class="topper-cgpa">${s.cgpa.toFixed(2)}</div>
            <div class="topper-cgpa-label">CGPA</div>
          </div>
          <div class="topper-percent">${s.avgPercent}%</div>
        </div>`).join('')}
    </div>` : ''}

    <!-- Students Needing Attention -->
    ${(stats.failingStudents && stats.failingStudents.length) ? `
    <div class="cr-section-title" style="margin-top:2rem">⚠️ Needs Attention <span style="font-size:0.8rem;font-weight:400;color:var(--text-3)">(${stats.failingStudents.length} student${stats.failingStudents.length > 1 ? 's' : ''} with backlogs)</span></div>
    <div class="failing-grid">
      ${stats.failingStudents.map(s => `
        <div class="failing-card">
          <div class="failing-info">
            <div class="failing-name">${escapeHtml(s.studentName)}</div>
            <div class="failing-usn">${escapeHtml(s.usn)} · Sec ${s.section}</div>
          </div>
          <div class="failing-stats">
            <span class="failing-backlogs">${s.backlogs} backlog${s.backlogs > 1 ? 's' : ''}</span>
            <span class="failing-cgpa">CGPA: ${s.cgpa.toFixed(2)}</span>
            <span class="failing-percent">${s.avgPercent}%</span>
          </div>
        </div>`).join('')}
    </div>` : ''}

    <div class="cr-section-title" style="margin-top:2rem">Subject-wise Performance</div>
    <div class="subject-stats-grid">
      ${(stats.subjectStats || []).map(s => `
        <div class="subject-stat-card">
          <div class="subj-code">${escapeHtml(s.subjectCode)}</div>
          <div class="subj-name">${escapeHtml(s.subjectName)}</div>
          <div class="subj-bar-wrap">
            <div class="subj-bar" style="width:${s.avgPercent}%;background:${s.avgPercent >= 60 ? 'var(--green)' : s.avgPercent >= 40 ? 'var(--gold)' : 'var(--accent)'}"></div>
          </div>
          <div class="subj-stats-row">
            <span>Avg: <strong>${s.avgPercent}%</strong></span>
            <span>Pass: <strong>${s.passRate}%</strong></span>
          </div>
        </div>`).join('')}
    </div>`;
  }

  // Student table
  const tableRows = records.map(r => {
    const a = r.analytics;
    const rowClass = a.backlogs > 0 ? 'row-backlog' : a.passedAll ? 'row-pass' : '';
    return `
      <tr class="${rowClass}" onclick="openMarksDetail('${r._id}', ${JSON.stringify(r).replace(/"/g,'&quot;')})" style="cursor:pointer">
        <td><strong>${escapeHtml(r.usn)}</strong></td>
        <td>${escapeHtml(r.studentName)}</td>
        <td>${r.section}</td>
        <td>${r.subjects.length}</td>
        <td><strong>${a.cgpa || '—'}</strong></td>
        <td>${a.avgPercent !== null ? a.avgPercent + '%' : '—'}</td>
        <td>${a.earnedCredits}/${a.totalCredits}</td>
        <td>${a.backlogs > 0 ? `<span class="badge-backlog">${a.backlogs} backlog${a.backlogs>1?'s':''}</span>` : '<span class="badge-clear">✓ Clear</span>'}</td>
        <td>
          <button class="btn-secondary" style="padding:3px 8px;font-size:0.75rem" onclick="event.stopPropagation();editMarksRecord('${r._id}',${JSON.stringify(r).replace(/"/g,'&quot;')})">Edit</button>
          <button class="btn-secondary danger" style="padding:3px 8px;font-size:0.75rem" onclick="event.stopPropagation();deleteMarksRecord('${r._id}')">Del</button>
        </td>
      </tr>`;
  }).join('');

  return `
    ${statsHtml}
    <div class="cr-section-title" style="margin-top:2rem">Student Records <span style="font-size:0.8rem;font-weight:400;color:var(--text-3)">(click row for full detail)</span></div>
    <div class="table-wrap">
      <table class="cr-table">
        <thead>
          <tr>
            <th>USN</th><th>Name</th><th>Sec</th><th>Subjects</th>
            <th>CGPA</th><th>Avg%</th><th>Credits</th><th>Status</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;
}

function openMarksDetail(id, record) {
  if (typeof record === 'string') {
    try { record = JSON.parse(record); } catch { return; }
  }
  const modal = document.getElementById('marks-modal');
  const content = document.getElementById('marks-modal-content');
  modal.classList.remove('hidden');

  const a = record.analytics || {};
  const gradeColors = { O:'#16a34a','A+':'#2563eb',A:'#7c3aed','B+':'#d97706',B:'#ea580c',C:'#dc2626',P:'#6b7280',F:'#dc2626','—':'#9ca3af' };

  const subjectRows = (a.analyzed || []).map(s => `
    <tr>
      <td><strong>${escapeHtml(s.subjectCode)}</strong></td>
      <td>${escapeHtml(s.subjectName)}</td>
      <td>${s.ia1 ?? '—'}</td>
      <td>${s.ia2 ?? '—'}</td>
      <td>${s.ia3 ?? '—'}</td>
      <td>${s.bestIA ?? '—'}</td>
      <td>${s.see ?? '—'}</td>
      <td><strong>${s.total ?? '—'}</strong></td>
      <td style="color:${gradeColors[s.grade]||'#333'};font-weight:700">${s.grade}</td>
      <td>${s.credits}</td>
      <td>${s.passed ? '<span style="color:var(--green)">✓</span>' : '<span style="color:var(--accent)">✗</span>'}</td>
    </tr>`).join('');

  content.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:1.25rem;flex-wrap:wrap;gap:0.5rem">
      <div>
        <div class="modal-title">${escapeHtml(record.studentName)}</div>
        <div style="font-family:var(--font-mono);color:var(--gold);font-size:0.9rem;font-weight:600">${record.usn}</div>
        <div style="font-size:0.82rem;color:var(--text-2);margin-top:0.25rem">
          Sem ${record.semester} · ${record.branch} · Section ${record.section} · ${record.academicYear}
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-size:2.5rem;font-weight:700;font-family:var(--font-display);color:var(--ink)">${a.cgpa || '—'}</div>
        <div style="font-size:0.75rem;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em">CGPA</div>
      </div>
    </div>

    <div class="modal-info-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:1.25rem">
      <div class="modal-info-item"><div class="modal-info-label">Avg Marks</div><div class="modal-info-val">${a.avgPercent ?? '—'}%</div></div>
      <div class="modal-info-item"><div class="modal-info-label">Credits Earned</div><div class="modal-info-val">${a.earnedCredits}/${a.totalCredits}</div></div>
      <div class="modal-info-item"><div class="modal-info-label">Backlogs</div><div class="modal-info-val" style="color:${a.backlogs>0?'var(--accent)':'var(--green)'}">${a.backlogs}</div></div>
      <div class="modal-info-item"><div class="modal-info-label">Status</div><div class="modal-info-val" style="color:${a.passedAll?'var(--green)':'var(--accent)'}">${a.passedAll?'✓ Clear':'Backlogs'}</div></div>
    </div>

    <div class="table-wrap">
      <table class="cr-table" style="font-size:0.82rem">
        <thead>
          <tr><th>Code</th><th>Subject</th><th>IA1</th><th>IA2</th><th>IA3</th><th>Best IA</th><th>SEE</th><th>Total</th><th>Grade</th><th>Cr</th><th>Pass</th></tr>
        </thead>
        <tbody>${subjectRows}</tbody>
      </table>
    </div>
    ${record.remarks ? `<div style="margin-top:1rem;font-size:0.85rem;color:var(--text-2)"><strong>Remarks:</strong> ${escapeHtml(record.remarks)}</div>` : ''}`;
}

function editMarksRecord(id, record) {
  if (typeof record === 'string') {
    try { record = JSON.parse(record); } catch { return; }
  }
  editingMarksId = id;
  document.getElementById('me-usn').value = record.usn;
  document.getElementById('me-name').value = record.studentName;
  document.getElementById('me-semester').value = record.semester;
  document.getElementById('me-branch').value = record.branch;
  document.getElementById('me-section').value = record.section;
  document.getElementById('me-year').value = record.academicYear;
  document.getElementById('me-remarks').value = record.remarks || '';
  document.getElementById('subjects-body').innerHTML = '';
  record.subjects.forEach(s => addSubjectRow(s));
  document.getElementById('save-marks-btn').innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,8 15,8"/></svg> Update Marks`;
  switchView('marks-entry');
  showToast('Record loaded for editing.');
}

async function deleteMarksRecord(id) {
  if (!confirm('Delete this marks record? This cannot be undone.')) return;
  try {
    const res = await MarksAPI.delete(id);
    if (res.ok) { showToast('Record deleted.'); loadClassReport(); }
    else showToast(res.data.message || 'Delete failed.', 'error');
  } catch { showToast('Delete failed.', 'error'); }
}

// ─── STUDENT PERFORMANCE DASHBOARD ──────────────────────────────────────────

async function loadPerformance() {
  const user = Storage.getUser();
  const container = document.getElementById('performance-content');
  const banner = document.getElementById('usn-missing-banner');

  if (!user.usn) {
    banner.classList.remove('hidden');
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🎓</div><h3>USN Required</h3><p>Set your USN above to view your marks.</p></div>`;
    return;
  }
  banner.classList.add('hidden');

  container.innerHTML = `<div class="loading-state"><div class="loading-dots"><span></span><span></span><span></span></div><p>Loading your academic record...</p></div>`;

  try {
    const res = await MarksAPI.getMy();
    if (!res.ok) { container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>${res.data.message}</h3></div>`; return; }
    const records = res.data.records;

    if (!records.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><h3>No marks yet</h3><p>Your teachers haven't entered any marks for USN <strong>${user.usn}</strong> yet.</p></div>`;
      return;
    }

    container.innerHTML = renderPerformanceDashboard(records, user);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📡</div><h3>Connection error</h3></div>`;
  }
}

function renderPerformanceDashboard(records, user) {
  // Overall stats across all semesters
  const cgpas = records.map(r => parseFloat(r.analytics.cgpa)).filter(Boolean);
  const overallCGPA = cgpas.length ? (cgpas.reduce((a, b) => a + b, 0) / cgpas.length).toFixed(2) : '—';
  const totalBacklogs = records.reduce((sum, r) => sum + r.analytics.backlogs, 0);
  const allPercents = records.map(r => r.analytics.avgPercent).filter(Boolean);
  const overallAvg = allPercents.length ? Math.round(allPercents.reduce((a, b) => a + b, 0) / allPercents.length) : 0;

  // CGPA trend chart data
  const trendPoints = records.map((r, i) => ({ sem: r.semester, cgpa: parseFloat(r.analytics.cgpa) || 0 }));

  // Semester cards
  const semCards = records.map(r => {
    const a = r.analytics;
    const gradeColors = { O:'#16a34a','A+':'#2563eb',A:'#7c3aed','B+':'#d97706',B:'#ea580c',C:'#dc2626',P:'#6b7280',F:'#dc2626','—':'#9ca3af' };
    const subjectRows = (a.analyzed || []).map(s => `
      <tr>
        <td style="font-family:var(--font-mono);font-size:0.78rem">${escapeHtml(s.subjectCode)}</td>
        <td style="font-size:0.82rem">${escapeHtml(s.subjectName)}</td>
        <td>${s.ia1 ?? '—'}</td>
        <td>${s.ia2 ?? '—'}</td>
        <td>${s.ia3 ?? '—'}</td>
        <td>${s.see ?? '—'}</td>
        <td><strong>${s.total ?? '—'}</strong></td>
        <td style="color:${gradeColors[s.grade]||'#333'};font-weight:700">${s.grade}</td>
        <td>${s.credits}</td>
      </tr>`).join('');

    const cgpaColor = a.cgpa >= 8 ? 'var(--green)' : a.cgpa >= 6 ? 'var(--gold)' : 'var(--accent)';
    return `
      <div class="perf-sem-card">
        <div class="perf-sem-header">
          <div>
            <div class="perf-sem-label">Semester ${r.semester}</div>
            <div class="perf-sem-year">${r.academicYear} · ${r.branch} · Sec ${r.section}</div>
          </div>
          <div class="perf-sem-scores">
            <div class="perf-score-box" style="border-color:${cgpaColor}">
              <div class="perf-score-num" style="color:${cgpaColor}">${a.cgpa || '—'}</div>
              <div class="perf-score-lbl">CGPA</div>
            </div>
            <div class="perf-score-box">
              <div class="perf-score-num">${a.avgPercent ?? '—'}%</div>
              <div class="perf-score-lbl">Avg</div>
            </div>
            <div class="perf-score-box" style="${a.backlogs > 0 ? 'border-color:var(--accent)' : 'border-color:var(--green)'}">
              <div class="perf-score-num" style="color:${a.backlogs > 0 ? 'var(--accent)' : 'var(--green)'}">${a.backlogs > 0 ? a.backlogs + ' ✗' : '✓'}</div>
              <div class="perf-score-lbl">${a.backlogs > 0 ? 'Backlog' : 'Clear'}</div>
            </div>
          </div>
        </div>

        <div class="perf-subject-bars">
          ${(a.analyzed || []).map(s => `
            <div class="perf-subj-bar-row" title="${s.subjectName}: ${s.total ?? '—'}%">
              <div class="perf-subj-code">${s.subjectCode}</div>
              <div class="perf-bar-track">
                <div class="perf-bar-fill" style="width:${Math.min(s.percent || 0, 100)}%;background:${(s.percent||0) >= 60 ? 'var(--green)' : (s.percent||0) >= 40 ? 'var(--gold)' : 'var(--accent)'}"></div>
              </div>
              <div class="perf-bar-val">${s.total ?? '—'}</div>
            </div>`).join('')}
        </div>

        <details class="perf-details">
          <summary>View detailed marks table</summary>
          <div class="table-wrap" style="margin-top:0.75rem">
            <table class="cr-table" style="font-size:0.8rem">
              <thead><tr><th>Code</th><th>Subject</th><th>IA1</th><th>IA2</th><th>IA3</th><th>SEE</th><th>Total</th><th>Grade</th><th>Cr</th></tr></thead>
              <tbody>${subjectRows}</tbody>
            </table>
          </div>
          ${r.remarks ? `<p style="font-size:0.82rem;color:var(--text-2);margin-top:0.75rem"><strong>Remarks:</strong> ${escapeHtml(r.remarks)}</p>` : ''}
          <p style="font-size:0.75rem;color:var(--text-3);margin-top:0.5rem">Marks entered by: ${r.enteredBy?.name || 'Teacher'}</p>
        </details>
      </div>`;
  }).join('');

  // SVG CGPA trend line
  const trendSVG = renderCGPATrend(trendPoints);

  return `
    <!-- Overview stats -->
    <div class="stats-grid" style="margin-bottom:2rem">
      <div class="stat-card primary">
        <div class="stat-icon">🏆</div>
        <div class="stat-info">
          <div class="stat-num">${overallCGPA}</div>
          <div class="stat-label">Overall CGPA</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📊</div>
        <div class="stat-info">
          <div class="stat-num">${overallAvg}%</div>
          <div class="stat-label">Avg Marks</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">${totalBacklogs > 0 ? '⚠️' : '✅'}</div>
        <div class="stat-info">
          <div class="stat-num" style="color:${totalBacklogs > 0 ? 'var(--accent)' : 'var(--green)'}">${totalBacklogs}</div>
          <div class="stat-label">Total Backlogs</div>
        </div>
      </div>
    </div>

    <!-- CGPA Trend -->
    ${trendPoints.length > 1 ? `
    <div class="dash-section" style="margin-bottom:2rem">
      <h3 class="section-title">CGPA Trend</h3>
      ${trendSVG}
    </div>` : ''}

    <!-- Semester-wise cards -->
    <h3 class="section-title" style="margin-bottom:1rem">Semester-wise Performance</h3>
    <div class="perf-grid">${semCards}</div>`;
}

function renderCGPATrend(points) {
  if (points.length < 2) return '';
  const W = 600, H = 160, pad = 40;
  const maxCGPA = 10;
  const xs = points.map((_, i) => pad + (i / (points.length - 1)) * (W - 2 * pad));
  const ys = points.map(p => H - pad - ((p.cgpa / maxCGPA) * (H - 2 * pad)));

  const pathD = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x},${ys[i]}`).join(' ');
  const areaD = `${pathD} L${xs[xs.length-1]},${H-pad} L${xs[0]},${H-pad} Z`;

  const dots = points.map((p, i) => `
    <circle cx="${xs[i]}" cy="${ys[i]}" r="5" fill="var(--gold)" stroke="white" stroke-width="2"/>
    <text x="${xs[i]}" y="${ys[i]-10}" text-anchor="middle" font-size="11" fill="var(--ink)" font-family="DM Sans" font-weight="600">${p.cgpa.toFixed(1)}</text>
    <text x="${xs[i]}" y="${H-pad+16}" text-anchor="middle" font-size="10" fill="var(--text-3)" font-family="DM Sans">S${p.sem}</text>`).join('');

  // Y-axis labels
  const yLabels = [0,2,4,6,8,10].map(v => {
    const y = H - pad - ((v / maxCGPA) * (H - 2 * pad));
    return `<text x="${pad-6}" y="${y+4}" text-anchor="end" font-size="9" fill="var(--text-3)">${v}</text>
    <line x1="${pad}" y1="${y}" x2="${W-pad}" y2="${y}" stroke="var(--border)" stroke-width="0.5"/>`;
  }).join('');

  return `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;overflow:visible" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="trend-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--gold)" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="var(--gold)" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      ${yLabels}
      <path d="${areaD}" fill="url(#trend-grad)"/>
      <path d="${pathD}" fill="none" stroke="var(--gold)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
    </svg>`;
}

// ─── SAVE USN (quick set from performance page) ──────────────────────────────

async function saveUSN() {
  const usn = document.getElementById('usn-quick-set').value.trim().toUpperCase();
  if (!usn) { showToast('Please enter a valid USN.', 'error'); return; }
  try {
    const res = await AuthAPI.updateProfile({ usn });
    if (res.ok) {
      const user = Storage.getUser();
      user.usn = usn;
      Storage.setUser(user);
      currentUser = user;
      showToast('USN saved! Loading your marks...');
      loadPerformance();
    } else {
      showToast(res.data.message || 'Failed to save USN.', 'error');
    }
  } catch { showToast('Error saving USN.', 'error'); }
}
