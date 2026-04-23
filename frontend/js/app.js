// ===== APP ENTRY POINT =====

document.addEventListener('DOMContentLoaded', () => {
  const token = Storage.getToken();
  const user = Storage.getUser();

  if (token && user) {
    initDashboard(user);
    
    // Silently refresh user data to catch updates like face registration
    if (typeof AuthAPI !== 'undefined' && AuthAPI.me) {
      AuthAPI.me().then(res => {
        if (res && res.ok && res.data && res.data.user) {
          Storage.setUser(res.data.user);
          checkProfileCompleteness(res.data.user);
        }
      }).catch(err => console.error('Silent user refresh failed:', err));
    }
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
  checkProfileCompleteness(user);
  switchView('dashboard');
}

function checkProfileCompleteness(user) {
  const banner = document.getElementById('dash-status-banner');
  if (!banner) return;

  let show = false;
  let title = '';
  let text = '';
  let btnText = 'Fix Now';
  let action = () => {};

  if (user.role === 'student') {
    if (!user.usn) {
      show = true;
      title = 'USN Required';
      text = 'Please set your USN so teachers can link your marks and attendance.';
      action = () => switchView('performance');
    } else if (!user.facePhotoUrl) {
      show = true;
      title = 'Face Verification Pending';
      text = 'Your official attendance photo is not set. Please visit your teacher to register.';
      btnText = 'View Status';
      action = () => switchView('my-attendance');
    }
  } else if (user.role === 'teacher') {
    if (!user.designation) {
      show = true;
      title = 'Profile Incomplete';
      text = 'Please set your designation in your profile settings.';
      action = () => showToast('Update profile in settings (coming soon)');
    }
  }

  if (show) {
    banner.classList.remove('hidden');
    document.getElementById('status-banner-title').textContent = title;
    document.getElementById('status-banner-text').textContent = text;
    const btn = document.getElementById('status-banner-btn');
    btn.textContent = btnText;
    btn.onclick = action;
  } else {
    banner.classList.add('hidden');
  }
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
  if (viewName === 'my-attendance') loadMyAttendance();
}
