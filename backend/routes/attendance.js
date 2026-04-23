const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

// POST /api/attendance — save attendance record (Teacher only)
router.post('/', protect, authorize('teacher'), async (req, res) => {
  try {
    const { date, semester, branch, section, subject, presentStudents, absentStudents, groupPhotoUrl, method } = req.body;

    if (!date || !semester || !branch || !section) {
      return res.status(400).json({ success: false, message: 'Date, semester, branch, and section are required.' });
    }

    const record = await Attendance.create({
      date: new Date(date),
      semester: parseInt(semester),
      branch,
      section,
      subject: subject || 'General',
      presentStudents: presentStudents || [],
      absentStudents: absentStudents || [],
      totalPresent: (presentStudents || []).length,
      totalStrength: (presentStudents || []).length + (absentStudents || []).length,
      groupPhotoUrl: groupPhotoUrl || null,
      markedBy: req.user.id,
      method: method || 'face_recognition',
    });

    res.status(201).json({ success: true, message: 'Attendance saved!', record });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/attendance/class — get class attendance (Teacher)
router.get('/class', protect, authorize('teacher'), async (req, res) => {
  try {
    const { semester, branch, section, from, to, subject } = req.query;
    const filter = { isActive: true };
    if (semester) filter.semester = parseInt(semester);
    if (branch) filter.branch = branch;
    if (section) filter.section = section;
    if (subject) filter.subject = { $regex: subject, $options: 'i' };
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(to);
    }

    const records = await Attendance.find(filter)
      .populate('markedBy', 'name')
      .sort({ date: -1 })
      .limit(50);

    res.json({ success: true, records });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/attendance/my — student's own attendance
router.get('/my', protect, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ success: false, message: 'Students only.' });
    }
    if (!req.user.usn) {
      return res.status(400).json({ success: false, message: 'USN not set on your profile.' });
    }

    const records = await Attendance.find({
      isActive: true,
      'presentStudents.usn': req.user.usn.toUpperCase(),
    }).sort({ date: -1 }).limit(100);

    // Also find records where student was absent
    const absentRecords = await Attendance.find({
      isActive: true,
      'absentStudents.usn': req.user.usn.toUpperCase(),
    }).sort({ date: -1 }).limit(100);

    // Combine and compute stats
    const allDates = new Set();
    const presentDates = new Set();

    records.forEach(r => {
      allDates.add(r.date.toISOString().split('T')[0]);
      presentDates.add(r.date.toISOString().split('T')[0]);
    });
    absentRecords.forEach(r => {
      allDates.add(r.date.toISOString().split('T')[0]);
    });

    const totalClasses = allDates.size;
    const attended = presentDates.size;
    const percentage = totalClasses > 0 ? Math.round((attended / totalClasses) * 100) : 0;

    // Subject-wise breakdown
    const subjectMap = {};
    records.forEach(r => {
      const subj = r.subject || 'General';
      if (!subjectMap[subj]) subjectMap[subj] = { present: 0, total: 0 };
      subjectMap[subj].present++;
      subjectMap[subj].total++;
    });
    absentRecords.forEach(r => {
      const subj = r.subject || 'General';
      if (!subjectMap[subj]) subjectMap[subj] = { present: 0, total: 0 };
      subjectMap[subj].total++;
    });

    const subjectBreakdown = Object.entries(subjectMap).map(([name, v]) => ({
      subject: name,
      present: v.present,
      total: v.total,
      percentage: v.total > 0 ? Math.round((v.present / v.total) * 100) : 0,
    }));

    // Monthly trend
    const monthMap = {};
    records.forEach(r => {
      const m = r.date.toISOString().substring(0, 7);
      if (!monthMap[m]) monthMap[m] = { present: 0, total: 0 };
      monthMap[m].present++;
      monthMap[m].total++;
    });
    absentRecords.forEach(r => {
      const m = r.date.toISOString().substring(0, 7);
      if (!monthMap[m]) monthMap[m] = { present: 0, total: 0 };
      monthMap[m].total++;
    });
    const monthlyTrend = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({
        month,
        present: v.present,
        total: v.total,
        percentage: v.total > 0 ? Math.round((v.present / v.total) * 100) : 0,
      }));

    res.json({
      success: true,
      stats: { totalClasses, attended, percentage, subjectBreakdown, monthlyTrend },
      presentRecords: records,
      absentRecords,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/attendance/stats — class attendance stats (Teacher)
router.get('/stats', protect, authorize('teacher'), async (req, res) => {
  try {
    const { semester, branch, section } = req.query;
    const filter = { isActive: true };
    if (semester) filter.semester = parseInt(semester);
    if (branch) filter.branch = branch;
    if (section) filter.section = section;

    const records = await Attendance.find(filter).sort({ date: -1 });
    if (!records.length) return res.json({ success: true, stats: null });

    const totalSessions = records.length;
    const avgAttendance = Math.round(
      records.reduce((sum, r) => sum + (r.totalStrength > 0 ? (r.totalPresent / r.totalStrength) * 100 : 0), 0) / totalSessions
    );

    // Student-wise attendance
    const studentMap = {};
    records.forEach(r => {
      r.presentStudents.forEach(s => {
        if (!studentMap[s.usn]) studentMap[s.usn] = { name: s.name, present: 0, total: 0 };
        studentMap[s.usn].present++;
        studentMap[s.usn].total++;
      });
      r.absentStudents.forEach(s => {
        if (!studentMap[s.usn]) studentMap[s.usn] = { name: s.name, present: 0, total: 0 };
        studentMap[s.usn].total++;
      });
    });

    const studentStats = Object.entries(studentMap)
      .map(([usn, v]) => ({
        usn,
        name: v.name,
        present: v.present,
        total: v.total,
        percentage: v.total > 0 ? Math.round((v.present / v.total) * 100) : 0,
      }))
      .sort((a, b) => a.percentage - b.percentage);

    const lowAttendance = studentStats.filter(s => s.percentage < 75);

    res.json({
      success: true,
      stats: { totalSessions, avgAttendance, studentStats, lowAttendance },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/auth/faces — get face descriptors for matching (Teacher)
router.get('/faces', protect, authorize('teacher'), async (req, res) => {
  try {
    const { semester, branch, section } = req.query;
    const filter = { role: 'student', isActive: true, faceDescriptor: { $ne: null, $exists: true, $not: { $size: 0 } } };
    if (semester) filter.semester = parseInt(semester);
    if (branch) filter.branch = branch;
    if (section) filter.section = section;

    const students = await User.find(filter).select('name usn faceDescriptor facePhotoUrl semester branch section');

    res.json({ success: true, students });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/attendance/:id — edit attendance (Teacher)
router.put('/:id', protect, authorize('teacher'), async (req, res) => {
  try {
    const record = await Attendance.findById(req.params.id);
    if (!record || !record.isActive) {
      return res.status(404).json({ success: false, message: 'Record not found.' });
    }

    const { presentStudents, absentStudents, subject } = req.body;
    if (presentStudents) {
      record.presentStudents = presentStudents;
      record.totalPresent = presentStudents.length;
    }
    if (absentStudents) {
      record.absentStudents = absentStudents;
      record.totalStrength = (record.presentStudents?.length || 0) + absentStudents.length;
    }
    if (subject) record.subject = subject;
    await record.save();

    res.json({ success: true, message: 'Attendance updated.', record });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/attendance/:id
router.delete('/:id', protect, authorize('teacher'), async (req, res) => {
  try {
    const record = await Attendance.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: 'Not found.' });
    record.isActive = false;
    await record.save();
    res.json({ success: true, message: 'Deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
