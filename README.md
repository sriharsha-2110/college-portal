# 🎓 AcadVault — College Academic Portal

A full-stack academic portal where **teachers upload notes** and **students access them** filtered by their **semester, branch, and section**.

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express.js |
| Database | MongoDB (Mongoose) |
| File Storage | Cloudinary |
| Frontend | HTML + CSS + Vanilla JavaScript |
| Auth | JWT (JSON Web Tokens) |
| File Upload | Multer + multer-storage-cloudinary |

---

## 📁 Project Structure

```
college-portal/
├── backend/
│   ├── config/
│   │   ├── db.js              # MongoDB connection
│   │   └── cloudinary.js      # Cloudinary + Multer config
│   ├── middleware/
│   │   └── auth.js            # JWT protect + authorize middleware
│   ├── models/
│   │   ├── User.js            # User schema (Student & Teacher)
│   │   └── Note.js            # Note/file schema
│   ├── routes/
│   │   ├── auth.js            # Register, Login, Me, Profile
│   │   └── notes.js           # CRUD, upload, stats, download
│   ├── server.js              # Express app entry point
│   ├── package.json
│   └── .env.example           # ← Copy to .env and fill in values
│
└── frontend/
    ├── index.html             # Single-page app shell
    ├── css/
    │   └── style.css          # Full design system
    └── js/
        ├── api.js             # Fetch wrapper + API modules
        ├── auth.js            # Login/register logic
        ├── notes.js           # Notes CRUD, upload, modal
        └── app.js             # App initialization + view routing
```

---

## ⚡ Quick Setup

### 1. Prerequisites

- **Node.js** v18+ 
- **MongoDB** (local or Atlas)
- **Cloudinary** account (free tier works!)

### 2. Cloudinary Setup

1. Go to [cloudinary.com](https://cloudinary.com) → Sign up free
2. Dashboard → Copy your **Cloud Name**, **API Key**, **API Secret**

### 3. MongoDB Setup

**Option A — Local MongoDB:**
```bash
# Install MongoDB locally and start it
mongod --dbpath /data/db
```

**Option B — MongoDB Atlas (free cloud):**
1. Go to [mongodb.com/atlas](https://mongodb.com/atlas) → Create free cluster
2. Get connection string: `mongodb+srv://user:pass@cluster.mongodb.net/college_portal`

### 4. Backend Installation

```bash
cd backend

# Copy env template
cp .env.example .env

# Edit .env with your values:
# MONGODB_URI=your_mongodb_uri
# JWT_SECRET=your_random_secret_string
# CLOUDINARY_CLOUD_NAME=your_cloud_name
# CLOUDINARY_API_KEY=your_api_key
# CLOUDINARY_API_SECRET=your_api_secret

# Install dependencies
npm install

# Start development server
npm run dev
# OR for production:
npm start
```

Server runs on **http://localhost:5000**

### 5. Frontend

The frontend is **served automatically** by the backend (Express serves static files). Just open:

```
http://localhost:5000
```

For standalone development, you can also open `frontend/index.html` directly in a browser. Update `API_BASE` in `frontend/js/api.js` if needed.

---

## 🔑 Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port | `5000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/college_portal` |
| `JWT_SECRET` | Secret key for JWT signing | `my_super_secret_key_123` |
| `JWT_EXPIRE` | Token expiry duration | `7d` |
| `CLOUDINARY_CLOUD_NAME` | Your Cloudinary cloud name | `my-cloud` |
| `CLOUDINARY_API_KEY` | Cloudinary API key | `123456789012345` |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | `abc123xyz...` |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:5000` |

---

## 📡 API Endpoints

### Auth
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/api/auth/register` | Register new user | Public |
| POST | `/api/auth/login` | Login | Public |
| GET | `/api/auth/me` | Get current user | Private |
| PUT | `/api/auth/profile` | Update profile | Private |

### Notes
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/api/notes` | Upload a note with file | Teacher |
| GET | `/api/notes` | Get notes (filtered) | Private |
| GET | `/api/notes/my` | Get teacher's own notes | Teacher |
| GET | `/api/notes/stats` | Dashboard statistics | Private |
| GET | `/api/notes/:id` | Get single note (+ view++) | Private |
| POST | `/api/notes/:id/download` | Increment download count | Private |
| PUT | `/api/notes/:id` | Update note metadata | Teacher (own) |
| DELETE | `/api/notes/:id` | Soft delete note | Teacher (own) |

---

## 🎨 Features

### For Teachers
- ✅ Register with department & designation
- ✅ Upload notes (PDF, DOC, DOCX, PPT, PPTX, TXT, Images)
- ✅ Target by semester, branch, and section
- ✅ Add tags for searchability
- ✅ Drag & drop file upload
- ✅ View upload statistics (total uploads, downloads)
- ✅ Edit or delete their uploaded notes
- ✅ Browse & search all notes with filters

### For Students
- ✅ Register with semester, branch, and section
- ✅ Auto-filtered notes based on their profile
- ✅ Search by title, subject, description, tags
- ✅ View note details (teacher info, file size, dates)
- ✅ One-click download from Cloudinary
- ✅ Dashboard with subject breakdown
- ✅ Download tracking per note

### System
- ✅ JWT authentication with 7-day expiry
- ✅ Password hashing with bcrypt
- ✅ File type validation (frontend + backend)
- ✅ 25MB file size limit
- ✅ Cloudinary cleanup on note deletion
- ✅ Pagination on all note listings
- ✅ View & download count tracking
- ✅ Soft delete (notes remain in DB but are inactive)
- ✅ Responsive design (mobile-friendly)

---

## 🎓 User Roles

### Student Profile
- Semester: 1–8
- Branch: CSE / ECE / ME / CE / EEE / IT / AIDS / AIML
- Section: A / B / C / D

Students **only see notes** matching their exact semester + branch + section (or notes marked for ALL).

### Teacher Profile
- Department: CSE / ECE / etc.
- Designation: e.g., "Assistant Professor"

Teachers can **upload, edit, delete** their own notes and **browse all notes** with filters.

---

## 🔒 Security

- Passwords hashed with **bcrypt** (salt rounds: 12)
- **JWT** tokens expire in 7 days
- Role-based access control (`protect` + `authorize` middleware)
- Teachers can only **edit/delete their own notes**
- File type whitelist enforced on both client and server
- Mongoose schema validation on all inputs
- CORS configured for specific frontend origin

---

## 🚀 Deployment

### Backend (Railway / Render / Heroku)
```bash
# Set environment variables on your platform
# Deploy the /backend folder
# Start command: node server.js
```

### Full Stack (same server)
The backend serves the frontend static files. Just deploy the entire project and set `FRONTEND_URL` to your production domain.

### MongoDB Atlas
Use a free M0 cluster for up to 512MB of storage.

### Cloudinary Free Tier
25 GB storage + 25 GB monthly bandwidth — plenty for academic notes.
