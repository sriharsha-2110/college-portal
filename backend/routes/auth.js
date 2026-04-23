const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// Helper: generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, semester, branch, section, department, designation, usn } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already registered.' });
    }

    // Validate student fields
    if (role === 'student' && (!semester || !branch || !section)) {
      return res.status(400).json({
        success: false,
        message: 'Students must provide semester, branch, and section.',
      });
    }

    const userData = { name, email, password, role };
    if (role === 'student') {
      userData.semester = semester;
      userData.branch = branch;
      userData.section = section;
      if (usn) userData.usn = usn.toUpperCase();
    } else if (role === 'teacher') {
      userData.department = department || 'GENERAL';
      userData.designation = designation;
    }

    const user = await User.create(userData);
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'Registration successful!',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        semester: user.semester,
        branch: user.branch,
        section: user.section,
        department: user.department,
        designation: user.designation,
      },
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Server error during registration.' });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password.' });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    if (!user.isActive) {
      return res.status(401).json({ success: false, message: 'Account has been deactivated.' });
    }

    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Login successful!',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        usn: user.usn,
        semester: user.semester,
        branch: user.branch,
        section: user.section,
        department: user.department,
        designation: user.designation,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
});

// @route   GET /api/auth/me
// @desc    Get current logged-in user
// @access  Private
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', protect, async (req, res) => {
  try {
    const { name, designation, usn, faceDescriptor, facePhotoUrl } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (designation && req.user.role === 'teacher') updates.designation = designation;
    if (usn && req.user.role === 'student') updates.usn = usn.toUpperCase();
    if (faceDescriptor && req.user.role === 'student') updates.faceDescriptor = faceDescriptor;
    if (facePhotoUrl && req.user.role === 'student') updates.facePhotoUrl = facePhotoUrl;

    const user = await User.findByIdAndUpdate(req.user.id, updates, {
      new: true,
      runValidators: true,
    });

    res.json({ success: true, message: 'Profile updated.', user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// @route   GET /api/auth/student/:usn
// @desc    Get student profile by USN (Teacher only)
router.get('/student/:usn', protect, async (req, res) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }
    const student = await User.findOne({ usn: req.params.usn.toUpperCase(), role: 'student' });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
    res.json({ success: true, student });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
