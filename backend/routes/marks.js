const express = require('express');
const router = express.Router();
const Marks = require('../models/Marks');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

// ─── HELPERS ────────────────────────────────────────────────────────────────

function getBestIA(ia1, ia2, ia3) {
  const vals = [ia1, ia2, ia3].filter(v => v !== null && v !== undefined && v !== '');
  if (!vals.length) return null;
  vals.sort((a, b) => b - a);
  // Best 2 of 3 (max 60 → scaled to 30 later if needed; keep raw sum)
  return vals.length >= 2 ? Number(vals[0]) + Number(vals[1]) : Number(vals[0]);
}

function getGrade(percent) {
  if (percent >= 90) return { grade: 'O', points: 10 };
  if (percent >= 80) return { grade: 'A+', points: 9 };
  if (percent >= 70) return { grade: 'A', points: 8 };
  if (percent >= 60) return { grade: 'B+', points: 7 };
  if (percent >= 55) return { grade: 'B', points: 6 };
  if (percent >= 50) return { grade: 'C', points: 5 };
  if (percent >= 40) return { grade: 'P', points: 4 };
  return { grade: 'F', points: 0 };
}

function computeAnalytics(marksDoc) {
  const subjects = marksDoc.subjects || [];
  let totalCredits = 0, earnedCredits = 0, gradePoints = 0;
  let totalPercent = 0, subjectCount = 0;
  const analyzed = [];

  for (const s of subjects) {
    const bestIA = getBestIA(s.ia1, s.ia2, s.ia3); // sum of best 2 (max 60)
    const ia = bestIA !== null ? Math.min(bestIA, 60) : null;
    const see = s.see !== null && s.see !== undefined ? Number(s.see) : null;

    // Total = IA (scaled to 50%) + SEE (50%) → out of 100
    let total = null, percent = null;
    if (ia !== null && see !== null) {
      // IA max 60 → convert to 50; SEE max 100 → convert to 50
      const iaScaled = (ia / 60) * 50;
      const seeScaled = (see / 100) * 50;
      total = Math.round(iaScaled + seeScaled);
      percent = total; // already out of 100
    } else if (see !== null) {
      percent = see;
      total = see;
    } else if (ia !== null) {
      percent = Math.round((ia / 60) * 100);
      total = percent;
    }

    const { grade, points } = percent !== null ? getGrade(percent) : { grade: '—', points: 0 };
    const passed = percent !== null && percent >= 40;
    const credits = s.credits || 4;

    if (percent !== null) {
      totalPercent += percent;
      subjectCount++;
      totalCredits += credits;
      if (passed) {
        earnedCredits += credits;
        gradePoints += points * credits;
      }
    }

    analyzed.push({
      subjectCode: s.subjectCode,
      subjectName: s.subjectName,
      ia1: s.ia1, ia2: s.ia2, ia3: s.ia3,
      bestIA: ia,
      see: s.see,
      total,
      percent,
      grade,
      gradePoints: points,
      credits,
      passed,
      maxIA: s.maxIA || 30,
      maxSEE: s.maxSEE || 100,
    });
  }

  const cgpa = totalCredits > 0 ? (gradePoints / totalCredits).toFixed(2) : null;
  const avgPercent = subjectCount > 0 ? Math.round(totalPercent / subjectCount) : null;
  const passedAll = analyzed.every(s => s.percent === null || s.passed);
  const backlogs = analyzed.filter(s => s.percent !== null && !s.passed).length;

  return { analyzed, cgpa, avgPercent, totalCredits, earnedCredits, passedAll, backlogs };
}

// ─── TEACHER: Add / Update marks for a student ──────────────────────────────

// POST /api/marks  — create new record
router.post('/', protect, authorize('teacher'), async (req, res) => {
  try {
    const { usn, studentName, semester, branch, section, academicYear, subjects, remarks } = req.body;

    if (!usn || !studentName || !semester || !branch || !section || !academicYear) {
      return res.status(400).json({ success: false, message: 'USN, name, semester, branch, section, academicYear are required.' });
    }
    if (!subjects || !subjects.length) {
      return res.status(400).json({ success: false, message: 'At least one subject is required.' });
    }

    // Link to student account if USN matches
    const studentUser = await User.findOne({ usn: usn.toUpperCase(), role: 'student' });

    // Check for existing record
    const existing = await Marks.findOne({ usn: usn.toUpperCase(), semester, academicYear });
    if (existing) {
      return res.status(400).json({ success: false, message: `Marks for ${usn} in Sem ${semester} (${academicYear}) already exist. Use PUT to update.` });
    }

    const marks = await Marks.create({
      usn: usn.toUpperCase(),
      studentId: studentUser?._id || null,
      studentName,
      semester: parseInt(semester),
      branch,
      section,
      academicYear,
      subjects,
      remarks,
      enteredBy: req.user.id,
    });

    res.status(201).json({ success: true, message: 'Marks saved successfully!', marks });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ success: false, message: 'Marks for this USN/Semester/Year already exist.' });
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/marks/:id — update existing record
router.put('/:id', protect, authorize('teacher'), async (req, res) => {
  try {
    const marks = await Marks.findById(req.params.id);
    if (!marks || !marks.isActive) return res.status(404).json({ success: false, message: 'Record not found.' });

    const { subjects, remarks, studentName } = req.body;
    if (subjects) marks.subjects = subjects;
    if (remarks !== undefined) marks.remarks = remarks;
    if (studentName) marks.studentName = studentName;
    marks.enteredBy = req.user.id;
    await marks.save();

    res.json({ success: true, message: 'Marks updated.', marks });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/marks/usn/:usn — update by USN + semester + year
router.put('/usn/:usn', protect, authorize('teacher'), async (req, res) => {
  try {
    const { semester, academicYear, subjects, remarks, studentName } = req.body;
    const marks = await Marks.findOne({ usn: req.params.usn.toUpperCase(), semester, academicYear });
    if (!marks) return res.status(404).json({ success: false, message: 'Record not found.' });

    if (subjects) marks.subjects = subjects;
    if (remarks !== undefined) marks.remarks = remarks;
    if (studentName) marks.studentName = studentName;
    marks.enteredBy = req.user.id;
    await marks.save();

    res.json({ success: true, message: 'Marks updated.', marks });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── TEACHER: Get class marks ────────────────────────────────────────────────

// GET /api/marks/class?semester=&branch=&section=&academicYear=
router.get('/class', protect, authorize('teacher'), async (req, res) => {
  try {
    const { semester, branch, section, academicYear } = req.query;
    const filter = { isActive: true };
    if (semester) filter.semester = parseInt(semester);
    if (branch) filter.branch = branch;
    if (section) filter.section = section;
    if (academicYear) filter.academicYear = academicYear;

    const records = await Marks.find(filter)
      .populate('enteredBy', 'name')
      .sort({ usn: 1 });

    const enriched = records.map(r => {
      const analytics = computeAnalytics(r);
      return { ...r.toObject(), analytics };
    });

    res.json({ success: true, total: records.length, records: enriched });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/marks/class/stats?semester=&branch=&section=&academicYear=
router.get('/class/stats', protect, authorize('teacher'), async (req, res) => {
  try {
    const { semester, branch, section, academicYear } = req.query;
    const filter = { isActive: true };
    if (semester) filter.semester = parseInt(semester);
    if (branch) filter.branch = branch;
    if (section) filter.section = section;
    if (academicYear) filter.academicYear = academicYear;

    const records = await Marks.find(filter);
    if (!records.length) return res.json({ success: true, stats: null });

    const analyticsArr = records.map(r => computeAnalytics(r));
    const cgpas = analyticsArr.map(a => parseFloat(a.cgpa)).filter(Boolean);
    const percents = analyticsArr.map(a => a.avgPercent).filter(Boolean);

    // Subject-wise averages
    const subjectMap = {};
    for (const a of analyticsArr) {
      for (const s of a.analyzed) {
        if (!subjectMap[s.subjectCode]) subjectMap[s.subjectCode] = { name: s.subjectName, percents: [], passes: 0, total: 0 };
        if (s.percent !== null) {
          subjectMap[s.subjectCode].percents.push(s.percent);
          subjectMap[s.subjectCode].total++;
          if (s.passed) subjectMap[s.subjectCode].passes++;
        }
      }
    }

    const subjectStats = Object.entries(subjectMap).map(([code, v]) => ({
      subjectCode: code,
      subjectName: v.name,
      avgPercent: v.percents.length ? Math.round(v.percents.reduce((a, b) => a + b, 0) / v.percents.length) : 0,
      passRate: v.total ? Math.round((v.passes / v.total) * 100) : 0,
      totalStudents: v.total,
    }));

    res.json({
      success: true,
      stats: {
        totalStudents: records.length,
        avgCGPA: cgpas.length ? (cgpas.reduce((a, b) => a + b, 0) / cgpas.length).toFixed(2) : 0,
        avgPercent: percents.length ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length) : 0,
        passedAll: analyticsArr.filter(a => a.passedAll).length,
        withBacklogs: analyticsArr.filter(a => a.backlogs > 0).length,
        gradeDistribution: {
          O: analyticsArr.filter(a => a.avgPercent >= 90).length,
          'A+': analyticsArr.filter(a => a.avgPercent >= 80 && a.avgPercent < 90).length,
          A: analyticsArr.filter(a => a.avgPercent >= 70 && a.avgPercent < 80).length,
          'B+': analyticsArr.filter(a => a.avgPercent >= 60 && a.avgPercent < 70).length,
          B: analyticsArr.filter(a => a.avgPercent >= 50 && a.avgPercent < 60).length,
          others: analyticsArr.filter(a => a.avgPercent < 50).length,
        },
        subjectStats,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── STUDENT: Get own marks by USN ──────────────────────────────────────────

// GET /api/marks/my — student gets all their own marks (matched by USN)
router.get('/my', protect, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ success: false, message: 'Students only.' });
    }
    if (!req.user.usn) {
      return res.status(400).json({ success: false, message: 'USN not set on your profile. Please update your profile.' });
    }

    const records = await Marks.find({ usn: req.user.usn.toUpperCase(), isActive: true })
      .sort({ semester: 1 });

    const enriched = records.map(r => {
      const analytics = computeAnalytics(r);
      return { ...r.toObject(), analytics };
    });

    res.json({ success: true, records: enriched });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/marks/usn/:usn — get marks by USN (teacher or the student themselves)
router.get('/usn/:usn', protect, async (req, res) => {
  try {
    const usn = req.params.usn.toUpperCase();

    // Students can only view their own marks
    if (req.user.role === 'student' && req.user.usn?.toUpperCase() !== usn) {
      return res.status(403).json({ success: false, message: 'You can only view your own marks.' });
    }

    const records = await Marks.find({ usn, isActive: true })
      .populate('enteredBy', 'name designation')
      .sort({ semester: 1 });

    const enriched = records.map(r => {
      const analytics = computeAnalytics(r);
      return { ...r.toObject(), analytics };
    });

    res.json({ success: true, usn, records: enriched });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/marks/:id
router.delete('/:id', protect, authorize('teacher'), async (req, res) => {
  try {
    const marks = await Marks.findById(req.params.id);
    if (!marks) return res.status(404).json({ success: false, message: 'Record not found.' });
    marks.isActive = false;
    await marks.save();
    res.json({ success: true, message: 'Record deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
