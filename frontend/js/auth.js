// ===== AUTH MODULE =====

function toggleRoleFields() {
  const role = document.getElementById('reg-role').value;
  document.getElementById('student-fields').classList.toggle('hidden', role !== 'student');
  document.getElementById('teacher-fields').classList.toggle('hidden', role !== 'teacher');
}

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.querySelectorAll('.auth-form').forEach(f => {
    f.classList.toggle('active', f.id === `${tab}-form`);
  });
  clearErrors();
}

function clearErrors() {
  document.querySelectorAll('.form-error').forEach(el => el.classList.add('hidden'));
}

function showAuthError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.remove('hidden');
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  const span = btn.querySelector('span');
  const loader = btn.querySelector('.btn-loader');
  btn.disabled = loading;
  span.style.display = loading ? 'none' : '';
  loader.classList.toggle('hidden', !loading);
}

async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  document.getElementById('login-error').classList.add('hidden');

  if (!email || !password) {
    showAuthError('login-error', 'Please enter your email and password.');
    return;
  }

  setLoading('login-btn', true);

  try {
    const res = await AuthAPI.login(email, password);
    if (res.ok) {
      Storage.setToken(res.data.token);
      Storage.setUser(res.data.user);
      initDashboard(res.data.user);
    } else {
      showAuthError('login-error', res.data.message || 'Login failed.');
    }
  } catch (err) {
    showAuthError('login-error', 'Network error. Is the server running?');
  } finally {
    setLoading('login-btn', false);
  }
}

async function handleRegister() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const role = document.getElementById('reg-role').value;

  document.getElementById('register-error').classList.add('hidden');

  if (!name || !email || !password || !role) {
    showAuthError('register-error', 'Please fill all required fields.');
    return;
  }

  const payload = { name, email, password, role };

  if (role === 'student') {
    const semester = document.getElementById('reg-semester').value;
    const branch = document.getElementById('reg-branch').value;
    const section = document.getElementById('reg-section').value;
    const usn = document.getElementById('reg-usn')?.value.trim().toUpperCase();
    if (!semester || !branch || !section) {
      showAuthError('register-error', 'Students must select semester, branch, and section.');
      return;
    }
    payload.semester = parseInt(semester);
    payload.branch = branch;
    payload.section = section;
    if (usn) payload.usn = usn;
  } else {
    payload.department = document.getElementById('reg-dept').value;
    payload.designation = document.getElementById('reg-designation').value.trim();
  }

  setLoading('register-btn', true);

  try {
    const res = await AuthAPI.register(payload);
    if (res.ok) {
      Storage.setToken(res.data.token);
      Storage.setUser(res.data.user);
      initDashboard(res.data.user);
    } else {
      showAuthError('register-error', res.data.message || 'Registration failed.');
    }
  } catch (err) {
    showAuthError('register-error', 'Network error. Is the server running?');
  } finally {
    setLoading('register-btn', false);
  }
}

function handleLogout() {
  Storage.removeToken();
  Storage.removeUser();
  document.getElementById('auth-page').classList.add('active');
  document.getElementById('dashboard-page').classList.remove('active');
  switchTab('login');
}

function togglePass(id) {
  const input = document.getElementById(id);
  input.type = input.type === 'password' ? 'text' : 'password';
}

// Tab click handlers
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});
