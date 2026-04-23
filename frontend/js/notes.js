// ===== NOTES MODULE =====

let currentPage = 1;
let myNotesPage = 1;
let searchTimeout = null;
let currentUser = null;

// ===== UTILITY =====
function getFileIcon(fileType = '', fileName = '') {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (fileType.includes('pdf') || ext === 'pdf') return { icon: '📄', cls: 'type-pdf' };
  if (fileType.includes('word') || ['doc','docx'].includes(ext)) return { icon: '📝', cls: 'type-doc' };
  if (fileType.includes('presentation') || ['ppt','pptx'].includes(ext)) return { icon: '📊', cls: 'type-ppt' };
  if (fileType.includes('image') || ['png','jpg','jpeg'].includes(ext)) return { icon: '🖼️', cls: 'type-img' };
  return { icon: '📃', cls: 'type-txt' };
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ===== LOAD NOTES =====
async function loadNotes(page = 1) {
  currentPage = page;
  const grid = document.getElementById('notes-grid');
  grid.innerHTML = `<div class="loading-state"><div class="loading-dots"><span></span><span></span><span></span></div><p>Loading notes...</p></div>`;

  const params = { page, limit: 12 };
  const search = document.getElementById('search-input')?.value.trim();
  if (search) params.search = search;

  if (currentUser?.role === 'teacher') {
    const sem = document.getElementById('filter-sem')?.value;
    const branch = document.getElementById('filter-branch')?.value;
    const section = document.getElementById('filter-section')?.value;
    if (sem) params.semester = sem;
    if (branch) params.branch = branch;
    if (section) params.section = section;
  }

  try {
    const res = await NotesAPI.getAll(params);
    if (res.ok) {
      renderNotesGrid(res.data.notes, 'notes-grid', false);
      renderPagination('pagination', res.data.page, res.data.pages, loadNotes);
    } else {
      grid.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Error loading notes</h3><p>${res.data.message}</p></div>`;
    }
  } catch (err) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">📡</div><h3>Connection error</h3><p>Could not reach the server.</p></div>`;
  }
}

async function loadMyNotes(page = 1) {
  myNotesPage = page;
  const grid = document.getElementById('my-notes-grid');
  grid.innerHTML = `<div class="loading-state"><div class="loading-dots"><span></span><span></span><span></span></div><p>Loading your uploads...</p></div>`;

  try {
    const res = await NotesAPI.getMine({ page, limit: 12 });
    if (res.ok) {
      renderNotesGrid(res.data.notes, 'my-notes-grid', true);
      renderPagination('my-pagination', res.data.pagination.page, res.data.pagination.pages, loadMyNotes);
    } else {
      grid.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Error</h3><p>${res.data.message}</p></div>`;
    }
  } catch (err) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">📡</div><h3>Connection error</h3></div>`;
  }
}

function renderNotesGrid(notes, gridId, showActions = false) {
  const grid = document.getElementById(gridId);
  if (!notes || notes.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><h3>No notes found</h3><p>${showActions ? "You haven't uploaded any notes yet." : "No notes match your criteria."}</p></div>`;
    return;
  }

  grid.innerHTML = notes.map(note => {
    const { icon, cls } = getFileIcon(note.fileType, note.fileName);
    const tags = note.tags?.slice(0, 3).map(t => `<span class="note-tag">${t}</span>`).join('') || '';
    const teacherName = note.uploadedBy?.name || 'Teacher';

    return `
    <div class="note-card" onclick="openNoteModal('${note._id}')">
      <div class="note-type-badge ${cls}">${icon} ${note.fileName?.split('.').pop()?.toUpperCase() || 'FILE'}</div>
      <div class="note-title">${escapeHtml(note.title)}</div>
      <div class="note-subject">📚 ${escapeHtml(note.subject)}</div>
      ${note.description ? `<div class="note-desc">${escapeHtml(note.description)}</div>` : ''}
      ${tags ? `<div class="note-tags">${tags}</div>` : ''}
      <div class="note-meta">
        <div class="note-badges">
          <span class="badge badge-sem">Sem ${note.semester}</span>
          <span class="badge badge-branch">${note.branch}</span>
          <span class="badge badge-sec">${note.section}</span>
        </div>
        <div class="note-stats">
          <span class="note-stat">
            <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            ${note.viewCount || 0}
          </span>
          <span class="note-stat">
            <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            ${note.downloadCount || 0}
          </span>
        </div>
      </div>
      <div style="font-size:0.75rem;color:var(--text-3);margin-top:0.5rem;">
        By ${escapeHtml(teacherName)} · ${formatDate(note.createdAt)}
      </div>
      ${showActions ? `
        <div class="note-actions" onclick="event.stopPropagation()">
          <button class="btn-secondary" onclick="openEditModal('${note._id}')">✏️ Edit</button>
          <button class="btn-secondary danger" onclick="deleteNote('${note._id}')">🗑️ Delete</button>
        </div>` : ''}
    </div>`;
  }).join('');
}

function renderPagination(containerId, page, pages, callback) {
  const el = document.getElementById(containerId);
  if (pages <= 1) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');

  let html = `<button class="page-btn" onclick="${callback.name}(${page - 1})" ${page <= 1 ? 'disabled' : ''}>‹</button>`;
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) {
      html += `<button class="page-btn ${i === page ? 'active' : ''}" onclick="${callback.name}(${i})">${i}</button>`;
    } else if (Math.abs(i - page) === 2) {
      html += `<span style="padding:0 0.25rem;color:var(--text-3)">…</span>`;
    }
  }
  html += `<button class="page-btn" onclick="${callback.name}(${page + 1})" ${page >= pages ? 'disabled' : ''}>›</button>`;
  el.innerHTML = html;
}

// ===== STATS =====
async function loadDashboardStats() {
  try {
    const res = await NotesAPI.getStats();
    if (!res.ok) return;

    const s = res.data.stats;
    const isTeacher = currentUser?.role === 'teacher';

    document.getElementById('stat-num-1').textContent = isTeacher ? s.totalUploaded : s.totalAvailable;
    document.getElementById('stat-label-1').textContent = isTeacher ? 'Notes Uploaded' : 'Notes Available';

    if (isTeacher) {
      document.getElementById('stat-num-2').textContent = s.totalDownloads || 0;
    } else {
      document.getElementById('stat-num-2').textContent = s.subjectBreakdown?.length || 0;
      document.getElementById('stat-label-2').textContent = 'Subjects';
    }

    // Profile stat
    if (isTeacher) {
      document.getElementById('stat-profile').textContent = currentUser.department || 'N/A';
      document.getElementById('stat-profile-label').textContent = 'Department';
    } else {
      document.getElementById('stat-profile').textContent = `S${currentUser.semester}/${currentUser.branch}/${currentUser.section}`;
      document.getElementById('stat-profile-label').textContent = 'Your Class';
    }

    // Recent notes
    const recentEl = document.getElementById('recent-notes-list');
    if (s.recentNotes?.length) {
      recentEl.innerHTML = s.recentNotes.map(n => {
        const { icon } = getFileIcon(n.fileType, n.fileName);
        return `<div class="recent-item" onclick="openNoteModal('${n._id}')">
          <div class="recent-file-icon">${icon}</div>
          <div class="recent-info">
            <div class="recent-title">${escapeHtml(n.title)}</div>
            <div class="recent-meta">${escapeHtml(n.subject)} · ${formatDate(n.createdAt)}</div>
          </div>
        </div>`;
      }).join('');
    } else {
      recentEl.innerHTML = '<p style="font-size:0.85rem;color:var(--text-3);text-align:center;padding:1rem;">No notes yet.</p>';
    }

    // Subject breakdown
    const subjEl = document.getElementById('subject-breakdown');
    if (s.subjectBreakdown?.length) {
      subjEl.innerHTML = s.subjectBreakdown.map(s => `
        <div class="subject-pill">
          <span class="subject-pill-name">${escapeHtml(s._id)}</span>
          <span class="subject-pill-count">${s.count}</span>
        </div>`).join('');
    } else {
      subjEl.innerHTML = '<p style="font-size:0.85rem;color:var(--text-3);text-align:center;padding:1rem;">No data yet.</p>';
    }
  } catch (err) {
    console.error('Stats error:', err);
  }
}

// ===== NOTE MODAL =====
async function openNoteModal(id) {
  const modal = document.getElementById('note-modal');
  const content = document.getElementById('modal-content');
  modal.classList.remove('hidden');
  content.innerHTML = `<div class="loading-state"><div class="loading-dots"><span></span><span></span><span></span></div></div>`;

  try {
    const res = await NotesAPI.getOne(id);
    if (!res.ok) { content.innerHTML = '<p>Error loading note.</p>'; return; }
    const note = res.data.note;
    const { icon, cls } = getFileIcon(note.fileType, note.fileName);
    const teacher = note.uploadedBy;

    content.innerHTML = `
      <span class="note-type-badge ${cls}" style="margin-bottom:1rem;display:inline-flex">${icon} ${note.fileName?.split('.').pop()?.toUpperCase()}</span>
      <div class="modal-title">${escapeHtml(note.title)}</div>
      <div class="modal-subject">📚 ${escapeHtml(note.subject)}</div>
      ${note.description ? `<div class="modal-desc">${escapeHtml(note.description)}</div>` : ''}

      <div class="modal-info-grid">
        <div class="modal-info-item">
          <div class="modal-info-label">Semester</div>
          <div class="modal-info-val">Semester ${note.semester}</div>
        </div>
        <div class="modal-info-item">
          <div class="modal-info-label">Branch</div>
          <div class="modal-info-val">${note.branch}</div>
        </div>
        <div class="modal-info-item">
          <div class="modal-info-label">Section</div>
          <div class="modal-info-val">${note.section}</div>
        </div>
        <div class="modal-info-item">
          <div class="modal-info-label">Uploaded</div>
          <div class="modal-info-val">${formatDate(note.createdAt)}</div>
        </div>
        <div class="modal-info-item">
          <div class="modal-info-label">File Size</div>
          <div class="modal-info-val">${formatFileSize(note.fileSize) || 'N/A'}</div>
        </div>
        <div class="modal-info-item">
          <div class="modal-info-label">Downloads</div>
          <div class="modal-info-val">${note.downloadCount || 0}</div>
        </div>
      </div>

      ${note.tags?.length ? `<div class="note-tags" style="margin-bottom:1rem">${note.tags.map(t => `<span class="note-tag">${t}</span>`).join('')}</div>` : ''}

      <div style="font-size:0.85rem;color:var(--text-2);margin-bottom:1.25rem;">
        <strong>By:</strong> ${escapeHtml(teacher?.name || 'Unknown')}
        ${teacher?.designation ? ` · ${escapeHtml(teacher.designation)}` : ''}
        ${teacher?.department ? ` · Dept. ${teacher.department}` : ''}
      </div>

      <div class="modal-footer">
        <button class="btn-primary" onclick="downloadFile('${note._id}', '${note.fileUrl}', '${escapeHtml(note.fileName)}')">
          <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download File
        </button>
        <button class="btn-secondary" onclick="closeNoteModal()">Close</button>
      </div>`;
  } catch (err) {
    content.innerHTML = '<p>Error loading note details.</p>';
  }
}

async function trackDownload(id) {
  try { await NotesAPI.incrementDownload(id); } catch {}
}

function closeNoteModal() {
  document.getElementById('note-modal').classList.add('hidden');
}
function closeModal(e) {
  if (e.target === document.getElementById('note-modal')) closeNoteModal();
}

// ===== EDIT MODAL =====
async function openEditModal(id) {
  const modal = document.getElementById('edit-modal');
  const content = document.getElementById('edit-modal-content');
  modal.classList.remove('hidden');
  content.innerHTML = `<div class="loading-state"><div class="loading-dots"><span></span><span></span><span></span></div></div>`;

  try {
    const res = await NotesAPI.getOne(id);
    if (!res.ok) return;
    const n = res.data.note;

    content.innerHTML = `
      <div class="form-group"><label>Title</label><input type="text" id="edit-title" value="${escapeHtml(n.title)}" /></div>
      <div class="form-group"><label>Subject</label><input type="text" id="edit-subject" value="${escapeHtml(n.subject)}" /></div>
      <div class="form-group"><label>Description</label><textarea id="edit-desc" rows="3">${escapeHtml(n.description || '')}</textarea></div>
      <div class="form-row three">
        <div class="form-group"><label>Semester</label>
          <select id="edit-semester">${[1,2,3,4,5,6,7,8].map(s=>`<option value="${s}" ${n.semester==s?'selected':''}>Sem ${s}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>Branch</label>
          <select id="edit-branch">
            ${['CSE','ECE','ME','CE','EEE','IT','AIDS','AIML','ALL'].map(b=>`<option value="${b}" ${n.branch===b?'selected':''}>${b}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Section</label>
          <select id="edit-section">
            ${['A','B','C','D','ALL'].map(s=>`<option value="${s}" ${n.section===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group"><label>Tags</label><input type="text" id="edit-tags" value="${(n.tags||[]).join(', ')}" placeholder="comma-separated" /></div>
      <div id="edit-error" class="form-error hidden"></div>
      <div style="display:flex;gap:0.75rem;margin-top:1rem;">
        <button class="btn-primary" onclick="submitEdit('${id}')">Save Changes</button>
        <button class="btn-secondary" onclick="closeEditModalDirect()">Cancel</button>
      </div>`;
  } catch (err) {
    content.innerHTML = '<p>Error loading note.</p>';
  }
}

async function submitEdit(id) {
  const payload = {
    title: document.getElementById('edit-title').value.trim(),
    subject: document.getElementById('edit-subject').value.trim(),
    description: document.getElementById('edit-desc').value.trim(),
    semester: document.getElementById('edit-semester').value,
    branch: document.getElementById('edit-branch').value,
    section: document.getElementById('edit-section').value,
    tags: document.getElementById('edit-tags').value,
  };
  try {
    const res = await NotesAPI.update(id, payload);
    if (res.ok) {
      showToast('Note updated successfully!');
      closeEditModalDirect();
      loadMyNotes(myNotesPage);
    } else {
      document.getElementById('edit-error').textContent = res.data.message;
      document.getElementById('edit-error').classList.remove('hidden');
    }
  } catch (err) {
    showToast('Update failed.', 'error');
  }
}

function closeEditModalDirect() {
  document.getElementById('edit-modal').classList.add('hidden');
}
function closeEditModal(e) {
  if (e.target === document.getElementById('edit-modal')) closeEditModalDirect();
}

// ===== DELETE =====
async function deleteNote(id) {
  if (!confirm('Are you sure you want to delete this note? This action cannot be undone.')) return;
  try {
    const res = await NotesAPI.delete(id);
    if (res.ok) {
      showToast('Note deleted successfully.');
      loadMyNotes(myNotesPage);
      loadDashboardStats();
    } else {
      showToast(res.data.message || 'Delete failed.', 'error');
    }
  } catch (err) {
    showToast('Delete failed.', 'error');
  }
}

// ===== UPLOAD =====
let selectedFile = null;

function handleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;
  selectedFile = file;

  const { icon } = getFileIcon(file.type, file.name);
  const preview = document.getElementById('file-preview');
  preview.innerHTML = `
    <div class="file-preview-icon">${icon}</div>
    <div class="file-preview-info">
      <div class="file-preview-name">${escapeHtml(file.name)}</div>
      <div class="file-preview-size">${formatFileSize(file.size)}</div>
    </div>
    <span class="file-preview-remove" onclick="clearFile()">✕ Remove</span>`;
  preview.classList.remove('hidden');
  document.getElementById('file-drop-zone').style.display = 'none';
}

function clearFile() {
  selectedFile = null;
  document.getElementById('file-input').value = '';
  document.getElementById('file-preview').classList.add('hidden');
  document.getElementById('file-drop-zone').style.display = '';
}

async function handleUpload() {
  const title = document.getElementById('up-title').value.trim();
  const subject = document.getElementById('up-subject').value.trim();
  const semester = document.getElementById('up-semester').value;
  const branch = document.getElementById('up-branch').value;
  const section = document.getElementById('up-section').value;
  const desc = document.getElementById('up-desc').value.trim();
  const tags = document.getElementById('up-tags').value.trim();

  const errEl = document.getElementById('upload-error');
  const succEl = document.getElementById('upload-success');
  errEl.classList.add('hidden');
  succEl.classList.add('hidden');

  if (!title || !subject || !semester || !branch) {
    errEl.textContent = 'Please fill in all required fields.';
    errEl.classList.remove('hidden');
    return;
  }
  if (!selectedFile) {
    errEl.textContent = 'Please select a file to upload.';
    errEl.classList.remove('hidden');
    return;
  }

  const formData = new FormData();
  formData.append('file', selectedFile);
  formData.append('title', title);
  formData.append('subject', subject);
  formData.append('semester', semester);
  formData.append('branch', branch);
  formData.append('section', section);
  if (desc) formData.append('description', desc);
  if (tags) formData.append('tags', tags);

  const uploadBtn = document.getElementById('upload-btn');
  uploadBtn.disabled = true;

  const progressEl = document.getElementById('upload-progress');
  const fillEl = document.getElementById('progress-fill');
  const textEl = document.getElementById('progress-text');
  progressEl.classList.remove('hidden');

  // Simulate progress
  let prog = 0;
  const interval = setInterval(() => {
    prog = Math.min(prog + Math.random() * 15, 85);
    fillEl.style.width = prog + '%';
    textEl.textContent = 'Uploading to Cloudinary...';
  }, 300);

  try {
    const res = await NotesAPI.upload(formData);
    clearInterval(interval);
    fillEl.style.width = '100%';
    textEl.textContent = 'Upload complete!';

    if (res.ok) {
      succEl.textContent = '✅ Note uploaded successfully! Students can now access it.';
      succEl.classList.remove('hidden');
      // Reset form
      document.getElementById('up-title').value = '';
      document.getElementById('up-subject').value = '';
      document.getElementById('up-desc').value = '';
      document.getElementById('up-semester').value = '';
      document.getElementById('up-branch').value = '';
      document.getElementById('up-section').value = 'ALL';
      document.getElementById('up-tags').value = '';
      clearFile();
      loadDashboardStats();
      showToast('Note uploaded!');
    } else {
      errEl.textContent = res.data.message || 'Upload failed.';
      errEl.classList.remove('hidden');
    }
  } catch (err) {
    clearInterval(interval);
    errEl.textContent = 'Upload failed. Check server connection.';
    errEl.classList.remove('hidden');
  } finally {
    uploadBtn.disabled = false;
    setTimeout(() => { progressEl.classList.add('hidden'); fillEl.style.width = '0%'; }, 2000);
  }
}

// ===== SEARCH =====
function debounceSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => loadNotes(1), 400);
}

// ===== HELPERS =====
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Drag & drop
const dropZone = document.getElementById('file-drop-zone');
if (dropZone) {
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) {
      const dt = new DataTransfer();
      dt.items.add(file);
      document.getElementById('file-input').files = dt.files;
      handleFileSelect(document.getElementById('file-input'));
    }
  });
}
async function downloadFile(noteId, fileUrl, fileName) {
  try {
    showToast('Starting download...', 'info');

    // Method 1: Get the proxy download URL
    const proxyUrl = `${API_BASE}/notes/${noteId}/download?token=${Storage.getToken()}`;
    
    // We use window.location.assign because the backend now redirects to the Cloudinary URL 
    // with fl_attachment which triggers a browser download.
    window.location.assign(proxyUrl);
    
    showToast('Download started!');
  } catch (err) {
    console.error('Download error:', err);
    // Fallback — open the original file URL directly
    window.open(fileUrl, '_blank');
    showToast('Opening file in new tab.', 'info');
  }
}
