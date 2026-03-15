// ===== APP ENTRY POINT =====

document.addEventListener('DOMContentLoaded', () => {
  const token = Storage.getToken();
  const user = Storage.getUser();

  if (token && user) {
    initDashboard(user);
  } else {
    document.getElementById('auth-page').classList.add('active');
    document.getElementById('dashboard-page').classList.remove('active');
  }
});

function initDashboard(user) {
  currentUser = user;

  // Hide auth page, show dashboard
  document.getElementById('auth-page').classList.remove('active');
  document.getElementById('dashboard-page').classList.add('active');

  // Update navbar
  document.getElementById('nav-name').textContent = user.name;
  document.getElementById('nav-avatar').textContent = user.name.charAt(0).toUpperCase();

  const roleBadge = document.getElementById('nav-role');
  roleBadge.textContent = user.role;
  roleBadge.className = `role-badge ${user.role}`;

  // Show/hide teacher-only and student-only elements
  const isTeacher = user.role === 'teacher';
  document.querySelectorAll('.teacher-only').forEach(el => {
    el.style.display = isTeacher ? '' : 'none';
  });
  document.querySelectorAll('.student-only').forEach(el => {
    el.style.display = !isTeacher ? '' : 'none';
  });

  // Hide teacher filters for students (they auto-filter by profile)
  const teacherFilters = document.getElementById('teacher-filters');
  if (teacherFilters) {
    teacherFilters.style.display = isTeacher ? '' : 'none';
  }

  // Set greeting
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('dash-greeting').textContent = `${greet}, ${user.name.split(' ')[0]}!`;

  const subtitleMap = {
    student: `Semester ${user.semester} · ${user.branch} · Section ${user.section}`,
    teacher: `${user.designation || 'Faculty'} · ${user.department || 'General'} Dept.`,
  };
  document.getElementById('dash-subtitle').textContent = subtitleMap[user.role] || '';

  // Notes subtitle
  if (user.role === 'student') {
    document.getElementById('notes-subtitle').textContent =
      `Showing notes for Sem ${user.semester} · ${user.branch} · Section ${user.section}`;
  }

  // Load initial data
  loadDashboardStats();
  switchView('dashboard');
}

// ===== VIEW SWITCHING =====
function switchView(viewName) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  const view = document.getElementById(`view-${viewName}`);
  if (view) view.classList.add('active');

  const btn = document.querySelector(`[data-view="${viewName}"]`);
  if (btn) btn.classList.add('active');

  // Lazy-load data on view switch
  if (viewName === 'notes') loadNotes(1);
  if (viewName === 'my-notes') loadMyNotes(1);
  if (viewName === 'dashboard') loadDashboardStats();
  if (viewName === 'marks-entry') initMarksForm();
  if (viewName === 'performance') loadPerformance();
}
