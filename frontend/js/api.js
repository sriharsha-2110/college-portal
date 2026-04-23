// API Configuration
const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:5000/api'
  : '/api';

// Storage helpers
const Storage = {
  getToken: () => localStorage.getItem('av_token'),
  setToken: (t) => localStorage.setItem('av_token', t),
  removeToken: () => localStorage.removeItem('av_token'),
  getUser: () => { try { return JSON.parse(localStorage.getItem('av_user')); } catch { return null; } },
  setUser: (u) => localStorage.setItem('av_user', JSON.stringify(u)),
  removeUser: () => localStorage.removeItem('av_user'),
};

// Core fetch wrapper
async function apiFetch(endpoint, options = {}) {
  const token = Storage.getToken();
  const headers = { ...options.headers };

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  const data = await res.json();

  if (res.status === 401) {
    Storage.removeToken();
    Storage.removeUser();
    window.location.reload();
    return;
  }

  return { ok: res.ok, status: res.status, data };
}

// Auth API
const AuthAPI = {
  login: (email, password) =>
    apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  register: (payload) =>
    apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),

  me: () => apiFetch('/auth/me'),
  updateProfile: (payload) =>
    apiFetch('/auth/profile', { method: 'PUT', body: JSON.stringify(payload) }),
  
  getStudent: (usn) => apiFetch(`/auth/student/${usn}`),
};

// Marks API
const MarksAPI = {
  save: (payload) =>
    apiFetch('/marks', { method: 'POST', body: JSON.stringify(payload) }),

  update: (id, payload) =>
    apiFetch(`/marks/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  getByUSN: (usn) => apiFetch(`/marks/usn/${usn}`),

  getMy: () => apiFetch('/marks/my'),

  getClass: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/marks/class?${qs}`);
  },

  getClassStats: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/marks/class/stats?${qs}`);
  },

  delete: (id) => apiFetch(`/marks/${id}`, { method: 'DELETE' }),
};
const NotesAPI = {
  getAll: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/notes?${qs}`);
  },

  getMine: (params = {}) => {
    const qs = new URLSearchParams({ ...params, myNotes: 'true' }).toString();
    return apiFetch(`/notes?${qs}`);
  },

  getStats: () => apiFetch('/notes/stats'),

  getOne: (id) => apiFetch(`/notes/${id}`),

  upload: (formData) =>
    apiFetch('/notes', { method: 'POST', body: formData }),

  update: (id, payload) =>
    apiFetch(`/notes/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  delete: (id) => apiFetch(`/notes/${id}`, { method: 'DELETE' }),

  incrementDownload: (id) => apiFetch(`/notes/${id}/download`, { method: 'POST' }),
};

// Attendance API
const AttendanceAPI = {
  save: (payload) =>
    apiFetch('/attendance', { method: 'POST', body: JSON.stringify(payload) }),

  getClass: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/attendance/class?${qs}`);
  },

  getMy: () => apiFetch('/attendance/my'),

  getStats: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/attendance/stats?${qs}`);
  },

  getFaces: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/attendance/faces?${qs}`);
  },

  update: (id, payload) =>
    apiFetch(`/attendance/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  delete: (id) => apiFetch(`/attendance/${id}`, { method: 'DELETE' }),

  registerStudentFace: (usn, payload) =>
    apiFetch(`/attendance/register-face/${usn}`, { method: 'PUT', body: JSON.stringify(payload) }),
};
