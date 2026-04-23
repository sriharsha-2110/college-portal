// ===== ATTENDANCE MODULE =====

let faceApiLoaded = false;
let matchedStudents = [];
let unmatchedCount = 0;

// ─── FACE-API.JS LOADER ────────────────────────────────────────────────────

async function loadFaceAPI() {
  if (faceApiLoaded) return true;
  const statusEl = document.getElementById('face-status');
  if (statusEl) statusEl.textContent = 'Loading face detection models...';

  try {
    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
    await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
    faceApiLoaded = true;
    if (statusEl) statusEl.textContent = '✅ Face detection ready';
    return true;
  } catch (err) {
    console.error('Face API load error:', err);
    if (statusEl) statusEl.textContent = '❌ Failed to load face models';
    return false;
  }
}

// ─── STUDENT: FACE REGISTRATION ─────────────────────────────────────────────

// ─── TEACHER: STUDENT FACE REGISTRATION (VERIFIED) ──────────────────────────
async function teacherRegisterFace() {
  const usnInput = document.getElementById('t-reg-usn');
  const photoInput = document.getElementById('t-face-photo-input');
  const statusEl = document.getElementById('t-face-reg-status');
  
  const usn = usnInput.value.trim().toUpperCase();
  const file = photoInput?.files[0];
  
  if (!usn) { showToast('Please enter student USN.', 'error'); return; }
  if (!file) { showToast('Please select a student photo.', 'error'); return; }

  statusEl.textContent = '⏳ Step 1/2: Processing face features...';
  statusEl.className = 'face-reg-status';

  const loaded = await loadFaceAPI();
  if (!loaded) return;

  try {
    const img = await faceapi.bufferToImage(file);
    const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();

    if (!detection) {
      statusEl.textContent = '❌ No face detected. Use a clear front-facing photo of the student.';
      statusEl.className = 'face-reg-status error';
      return;
    }

    const descriptor = Array.from(detection.descriptor);
    statusEl.textContent = '⏳ Step 2/2: Saving verified identity...';

    const reader = new FileReader();
    reader.onload = async () => {
      const facePhotoUrl = reader.result; // base64

      const res = await AttendanceAPI.registerStudentFace(usn, { 
        faceDescriptor: descriptor, 
        facePhotoUrl 
      });

      if (res.ok) {
        statusEl.textContent = `✅ Successfully registered face for ${usn}!`;
        statusEl.className = 'face-reg-status success';
        document.getElementById('t-face-preview-img').src = facePhotoUrl;
        document.getElementById('t-face-preview-wrap').classList.remove('hidden');
        showToast('Student face registered!');
        usnInput.value = '';
        photoInput.value = '';
      } else {
        statusEl.textContent = '❌ ' + (res.data.message || 'Failed to save face data.');
        statusEl.className = 'face-reg-status error';
      }
    };
    reader.readAsDataURL(file);
  } catch (err) {
    console.error('Teacher registration error:', err);
    statusEl.textContent = '❌ Error processing photo. Try again.';
  }
}

// ─── TEACHER: GROUP PHOTO ATTENDANCE ────────────────────────────────────────

async function processGroupPhoto() {
  const input = document.getElementById('group-photo-input');
  const file = input?.files[0];
  if (!file) { showToast('Please select a class group photo.', 'error'); return; }

  const semester = document.getElementById('att-semester').value;
  const branch = document.getElementById('att-branch').value;
  const section = document.getElementById('att-section').value;

  if (!semester || !branch || !section) {
    showToast('Please select semester, branch, and section first.', 'error');
    return;
  }

  const statusEl = document.getElementById('group-photo-status');
  const resultsEl = document.getElementById('attendance-results');
  statusEl.textContent = '⏳ Step 1/3: Loading face detection models...';
  resultsEl.innerHTML = '';

  const loaded = await loadFaceAPI();
  if (!loaded) return;

  statusEl.textContent = '⏳ Step 2/3: Fetching registered student faces...';

  try {
    // Get registered faces for this class
    const facesRes = await AttendanceAPI.getFaces({ semester, branch, section });
    if (!facesRes.ok || !facesRes.data.students?.length) {
      statusEl.textContent = '⚠️ No students have registered their faces for this class yet.';
      return;
    }

    const registeredStudents = facesRes.data.students;
    statusEl.textContent = `⏳ Step 3/3: Detecting faces in group photo (${registeredStudents.length} registered students)...`;

    // Detect faces in group photo
    const img = await faceapi.bufferToImage(file);
    const detections = await faceapi.detectAllFaces(img).withFaceLandmarks().withFaceDescriptors();

    if (!detections.length) {
      statusEl.textContent = '❌ No faces detected in the photo. Try a clearer image.';
      return;
    }

    // Build face matcher from registered students
    const labeledDescriptors = registeredStudents
      .filter(s => s.faceDescriptor && s.faceDescriptor.length === 128)
      .map(s => new faceapi.LabeledFaceDescriptors(
        `${s.usn}|${s.name}`,
        [new Float32Array(s.faceDescriptor)]
      ));

    if (!labeledDescriptors.length) {
      statusEl.textContent = '⚠️ No valid face descriptors found for registered students.';
      return;
    }

    const matcher = new faceapi.FaceMatcher(labeledDescriptors, 0.45); // Relaxed threshold for group photos

    // Match each detected face
    matchedStudents = [];
    unmatchedCount = 0;
    const matchedUSNs = new Set();

    console.log(`Starting match for ${detections.length} detections...`);
    detections.forEach((det, i) => {
      const match = matcher.findBestMatch(det.descriptor);
      console.log(`Detection ${i}: Best match is ${match.label} with distance ${match.distance.toFixed(3)}`);
      
      if (match.label !== 'unknown') {
        const [usn, name] = match.label.split('|');
        if (!matchedUSNs.has(usn)) {
          matchedUSNs.add(usn);
          matchedStudents.push({
            usn,
            name,
            confidence: parseFloat((1 - match.distance).toFixed(2)),
          });
        }
      } else {
        unmatchedCount++;
      }
    });

    // Find absent students (registered but not matched)
    const absentStudents = registeredStudents
      .filter(s => !matchedUSNs.has(s.usn))
      .map(s => ({ usn: s.usn, name: s.name }));

    // Store results for manual toggling
    window._currentPresent = matchedStudents;
    window._currentAbsent = absentStudents;
    window._unmatchedCount = unmatchedCount;
    window._detectionsCount = detections.length;

    renderAttendanceResults();

  } catch (err) {
    console.error('Group photo processing error:', err);
    statusEl.textContent = '❌ Error processing photo: ' + err.message;
  }
}

function renderAttendanceResults() {
  const resultsEl = document.getElementById('attendance-results');
  const present = window._currentPresent || [];
  const absent = window._currentAbsent || [];
  
  resultsEl.innerHTML = `
    <div class="att-results-header">
      <div class="att-result-stat present">
        <div class="att-result-num">${present.length}</div>
        <div class="att-result-label">Present</div>
      </div>
      <div class="att-result-stat absent">
        <div class="att-result-num">${absent.length}</div>
        <div class="att-result-label">Absent</div>
      </div>
      <div class="att-result-stat total">
        <div class="att-result-num">${window._detectionsCount || 0}</div>
        <div class="att-result-label">Faces Found</div>
      </div>
    </div>

    <div class="att-list-section">
      <h4 style="color:var(--green);margin-bottom:0.5rem">✅ Present (${present.length})</h4>
      <div class="att-student-list">
        ${present.map(s => `
          <div class="att-student-item present">
            <span class="att-student-usn">${escapeHtml(s.usn)}</span>
            <span class="att-student-name">${escapeHtml(s.name)}</span>
            <span class="att-confidence">${s.confidence ? Math.round(s.confidence * 100) + '%' : 'Manual'}</span>
            <button class="att-toggle-btn" onclick="togglePresence('${s.usn}', false)" title="Mark as Absent">✕</button>
          </div>`).join('')}
      </div>
    </div>

    ${absent.length ? `
    <div class="att-list-section" style="margin-top:1rem">
      <h4 style="color:var(--accent);margin-bottom:0.5rem">❌ Absent (${absent.length})</h4>
      <div class="att-student-list">
        ${absent.map(s => `
          <div class="att-student-item absent">
            <span class="att-student-usn">${escapeHtml(s.usn)}</span>
            <span class="att-student-name">${escapeHtml(s.name)}</span>
            <button class="att-toggle-btn" onclick="togglePresence('${s.usn}', true)" title="Mark as Present">✓</button>
          </div>`).join('')}
      </div>
    </div>` : ''}

    <div style="display:flex;gap:0.75rem;margin-top:1.25rem;flex-wrap:wrap">
      <button class="btn-primary" onclick="saveAttendance()">💾 Save Attendance</button>
      <button class="btn-secondary" onclick="document.getElementById('attendance-results').innerHTML=''">Clear</button>
    </div>
  `;
}

function togglePresence(usn, markPresent) {
  if (markPresent) {
    const student = window._currentAbsent.find(s => s.usn === usn);
    if (student) {
      window._currentAbsent = window._currentAbsent.filter(s => s.usn !== usn);
      window._currentPresent.push({ ...student, confidence: null }); // null means manual
    }
  } else {
    const student = window._currentPresent.find(s => s.usn === usn);
    if (student) {
      window._currentPresent = window._currentPresent.filter(s => s.usn !== usn);
      window._currentAbsent.push({ usn: student.usn, name: student.name });
    }
  }
  renderAttendanceResults();
}

async function saveAttendance() {
  const semester = document.getElementById('att-semester').value;
  const branch = document.getElementById('att-branch').value;
  const section = document.getElementById('att-section').value;
  const subject = document.getElementById('att-subject').value.trim();
  const date = document.getElementById('att-date').value;

  if (!date) { showToast('Please select a date.', 'error'); return; }

  try {
    const res = await AttendanceAPI.save({
      date,
      semester,
      branch,
      section,
      subject: subject || 'General',
      presentStudents: window._currentPresent,
      absentStudents: window._currentAbsent,
      method: 'face_recognition',
    });

    if (res.ok) {
      showToast('Attendance saved successfully!');
      document.getElementById('attendance-results').innerHTML =
        '<div class="empty-state"><div class="empty-icon">✅</div><h3>Attendance Saved!</h3><p>Records have been saved successfully.</p></div>';
    } else {
      showToast(res.data.message || 'Failed to save.', 'error');
    }
  } catch (err) {
    showToast('Failed to save attendance.', 'error');
  }
}

// ─── STUDENT: MY ATTENDANCE ─────────────────────────────────────────────────

async function loadMyAttendance() {
  const container = document.getElementById('my-attendance-content');
  container.innerHTML = '<div class="loading-state"><div class="loading-dots"><span></span><span></span><span></span></div><p>Loading attendance...</p></div>';

  try {
    const res = await AttendanceAPI.getMy();
    if (!res.ok) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>${res.data.message}</h3></div>`;
      return;
    }

    const { stats } = res.data;

    // Update Student Verified Photo Section
    const user = Storage.getUser();
    if (user.role === 'student') {
      const photoCard = document.getElementById('student-verified-photo-card');
      if (photoCard) {
        document.getElementById('student-official-name').textContent = user.name;
        document.getElementById('student-official-usn').textContent = `USN: ${user.usn}`;
        if (user.facePhotoUrl) {
          document.getElementById('student-official-photo').src = user.facePhotoUrl;
        }
      }
    }

    if (!stats || stats.totalClasses === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><h3>No attendance records yet</h3><p>Your teacher hasn\'t taken attendance yet.</p></div>';
      return;
    }

    container.innerHTML = renderMyAttendance(stats);
  } catch (err) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📡</div><h3>Connection error</h3></div>';
  }
}

function renderMyAttendance(stats) {
  const pctColor = stats.percentage >= 75 ? 'var(--green)' : stats.percentage >= 60 ? 'var(--gold)' : 'var(--accent)';
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (stats.percentage / 100) * circumference;

  // Subject bars
  const subjectBars = (stats.subjectBreakdown || []).map(s => {
    const c = s.percentage >= 75 ? 'var(--green)' : s.percentage >= 60 ? 'var(--gold)' : 'var(--accent)';
    return `
      <div class="att-subj-row">
        <div class="att-subj-name">${escapeHtml(s.subject)}</div>
        <div class="att-subj-bar-track">
          <div class="att-subj-bar-fill" style="width:${s.percentage}%;background:${c}"></div>
        </div>
        <div class="att-subj-pct" style="color:${c}">${s.percentage}%</div>
        <div class="att-subj-count">${s.present}/${s.total}</div>
      </div>`;
  }).join('');

  // Monthly trend SVG
  const trendSVG = renderAttendanceTrend(stats.monthlyTrend || []);

  return `
    <div class="att-overview-grid">
      <div class="att-ring-card">
        <svg viewBox="0 0 100 100" class="att-ring-svg">
          <circle cx="50" cy="50" r="45" fill="none" stroke="var(--cream-2)" stroke-width="8"/>
          <circle cx="50" cy="50" r="45" fill="none" stroke="${pctColor}" stroke-width="8"
            stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
            stroke-linecap="round" transform="rotate(-90 50 50)" style="transition:stroke-dashoffset 1s ease"/>
        </svg>
        <div class="att-ring-text">
          <div class="att-ring-num" style="color:${pctColor}">${stats.percentage}%</div>
          <div class="att-ring-label">Attendance</div>
        </div>
      </div>
      <div class="att-quick-stats">
        <div class="att-quick-stat">
          <div class="att-qs-num">${stats.totalClasses}</div>
          <div class="att-qs-label">Total Classes</div>
        </div>
        <div class="att-quick-stat">
          <div class="att-qs-num" style="color:var(--green)">${stats.attended}</div>
          <div class="att-qs-label">Attended</div>
        </div>
        <div class="att-quick-stat">
          <div class="att-qs-num" style="color:var(--accent)">${stats.totalClasses - stats.attended}</div>
          <div class="att-qs-label">Missed</div>
        </div>
      </div>
    </div>

    ${stats.percentage < 75 ? `<div class="att-warning">⚠️ Your attendance is below 75%. You may face attendance shortage.</div>` : ''}

    <div class="dash-section" style="margin-top:1.5rem">
      <h3 class="section-title">Subject-wise Attendance</h3>
      <div class="att-subj-list">${subjectBars || '<p style="color:var(--text-3);font-size:0.85rem">No subject data yet.</p>'}</div>
    </div>

    <!-- Attendance Heatmap (Data Science visualization) -->
    <div class="dash-section" style="margin-top:1.5rem">
      <h3 class="section-title">📅 Attendance Activity (Last 30 Days)</h3>
      <div class="att-heatmap-wrap">
        ${renderAttendanceHeatmap(stats.dailyActivity || [])}
      </div>
    </div>

    ${trendSVG ? `
    <div class="dash-section" style="margin-top:1.5rem">
      <h3 class="section-title">Monthly Trend</h3>
      ${trendSVG}
    </div>` : ''}`;
}

function renderAttendanceHeatmap(activity) {
  // activity is an array of { date: 'YYYY-MM-DD', status: 'present'|'absent'|'none' }
  const days = 30;
  const today = new Date();
  const heatmap = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const act = activity.find(a => a.date === dateStr) || { status: 'none' };
    heatmap.push({ date: dateStr, status: act.status });
  }

  return `
    <div class="att-heatmap">
      ${heatmap.map(h => `
        <div class="att-heat-square status-${h.status}" title="${h.date}: ${h.status}"></div>
      `).join('')}
    </div>
    <div class="att-heat-legend">
      <div class="att-heat-legend-item"><span class="att-heat-square status-present"></span> Present</div>
      <div class="att-heat-legend-item"><span class="att-heat-square status-absent"></span> Absent</div>
      <div class="att-heat-legend-item"><span class="att-heat-square status-none"></span> No Class</div>
    </div>
  `;
}

function renderAttendanceTrend(trend) {
  if (!trend || trend.length < 2) return '';
  const W = 500, H = 140, pad = 40;
  const xs = trend.map((_, i) => pad + (i / (trend.length - 1)) * (W - 2 * pad));
  const ys = trend.map(t => H - pad - ((t.percentage / 100) * (H - 2 * pad)));

  const pathD = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x},${ys[i]}`).join(' ');
  const areaD = `${pathD} L${xs[xs.length-1]},${H-pad} L${xs[0]},${H-pad} Z`;

  const dots = trend.map((t, i) => `
    <circle cx="${xs[i]}" cy="${ys[i]}" r="4" fill="${t.percentage >= 75 ? 'var(--green)' : 'var(--accent)'}" stroke="white" stroke-width="2"/>
    <text x="${xs[i]}" y="${ys[i]-10}" text-anchor="middle" font-size="10" fill="var(--ink)" font-weight="600">${t.percentage}%</text>
    <text x="${xs[i]}" y="${H-pad+14}" text-anchor="middle" font-size="9" fill="var(--text-3)">${t.month.substring(5)}</text>`).join('');

  const line75 = H - pad - (0.75 * (H - 2 * pad));

  return `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;overflow:visible">
      <defs>
        <linearGradient id="att-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--green)" stop-opacity="0.2"/>
          <stop offset="100%" stop-color="var(--green)" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      <line x1="${pad}" y1="${line75}" x2="${W-pad}" y2="${line75}" stroke="var(--accent)" stroke-width="1" stroke-dasharray="4,4" opacity="0.4"/>
      <text x="${pad-4}" y="${line75+3}" text-anchor="end" font-size="8" fill="var(--accent)">75%</text>
      <path d="${areaD}" fill="url(#att-grad)"/>
      <path d="${pathD}" fill="none" stroke="var(--green)" stroke-width="2.5" stroke-linejoin="round"/>
      ${dots}
    </svg>`;
}
