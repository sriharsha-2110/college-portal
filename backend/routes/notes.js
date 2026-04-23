const express = require('express');
const router = express.Router();
const Note = require('../models/Note');
const { protect, authorize } = require('../middleware/auth');
const { upload, cloudinary } = require('../config/cloudinary');

// @route   POST /api/notes
// @desc    Upload a note (Teacher only)
// @access  Private/Teacher
router.post('/', protect, authorize('teacher'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload a file.' });
    }

    const { title, description, subject, semester, branch, section, tags } = req.body;

    if (!title || !subject || !semester || !branch) {
      // Clean up uploaded file if validation fails
      if (req.file.public_id) {
        await cloudinary.uploader.destroy(req.file.public_id, { resource_type: 'raw' });
      }
      return res.status(400).json({
        success: false,
        message: 'Title, subject, semester, and branch are required.',
      });
    }

    const note = await Note.create({
      title,
      description,
      subject,
      semester: parseInt(semester),
      branch,
      section: section || 'ALL',
      fileUrl: req.file.path,
      filePublicId: req.file.filename || req.file.public_id,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      fileType: req.file.mimetype,
      uploadedBy: req.user.id,
      tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    });

    await note.populate('uploadedBy', 'name email department designation');

    res.status(201).json({
      success: true,
      message: 'Note uploaded successfully!',
      note,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error during upload.' });
  }
});

// @route   GET /api/notes
// @desc    Get notes (filtered by semester, branch, section for students)
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const { semester, branch, section, subject, search, page = 1, limit = 12 } = req.query;

    let filter = { isActive: true };

    // Students can only see notes matching their profile
    if (req.user.role === 'student') {
      filter.$and = [
        { semester: req.user.semester },
        { branch: { $in: [req.user.branch, 'ALL'] } },
        { section: { $in: [req.user.section, 'ALL'] } },
      ];
    } else {
      // Teachers can filter or see their own notes / all notes
      if (semester) filter.semester = parseInt(semester);
      if (branch) filter.branch = branch;
      if (section) filter.section = section;
    }

    if (subject) filter.subject = { $regex: subject, $options: 'i' };
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Note.countDocuments(filter);

    const notes = await Note.find(filter)
      .populate('uploadedBy', 'name email department designation')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      success: true,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      notes,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error fetching notes.' });
  }
});

// @route   GET /api/notes/my
// @desc    Get notes uploaded by logged-in teacher
// @access  Private/Teacher
router.get('/my', protect, authorize('teacher'), async (req, res) => {
  try {
    const { page = 1, limit = 12 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const total = await Note.countDocuments({ uploadedBy: req.user.id, isActive: true });
    const notes = await Note.find({ uploadedBy: req.user.id, isActive: true })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({ success: true, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)), notes });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// @route   GET /api/notes/stats
// @desc    Get dashboard stats
// @access  Private
router.get('/stats', protect, async (req, res) => {
  try {
    if (req.user.role === 'teacher') {
      const totalUploaded = await Note.countDocuments({ uploadedBy: req.user.id, isActive: true });
      const totalDownloads = await Note.aggregate([
        { $match: { uploadedBy: req.user._id, isActive: true } },
        { $group: { _id: null, total: { $sum: '$downloadCount' } } },
      ]);
      const subjectBreakdown = await Note.aggregate([
        { $match: { uploadedBy: req.user._id, isActive: true } },
        { $group: { _id: '$subject', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]);
      const recentNotes = await Note.find({ uploadedBy: req.user.id, isActive: true })
        .sort({ createdAt: -1 })
        .limit(5);

      return res.json({
        success: true,
        stats: {
          totalUploaded,
          totalDownloads: totalDownloads[0]?.total || 0,
          subjectBreakdown,
          recentNotes,
        },
      });
    }

    // Student stats
    const filter = {
      isActive: true,
      semester: req.user.semester,
      branch: { $in: [req.user.branch, 'ALL'] },
      section: { $in: [req.user.section, 'ALL'] },
    };
    const totalAvailable = await Note.countDocuments(filter);
    const subjectBreakdown = await Note.aggregate([
      { $match: filter },
      { $group: { _id: '$subject', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const recentNotes = await Note.find(filter)
      .populate('uploadedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      success: true,
      stats: { totalAvailable, subjectBreakdown, recentNotes },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// @route   GET /api/notes/:id
// @desc    Get single note (increments view count)
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const note = await Note.findByIdAndUpdate(
      req.params.id,
      { $inc: { viewCount: 1 } },
      { new: true }
    ).populate('uploadedBy', 'name email department designation');

    if (!note || !note.isActive) {
      return res.status(404).json({ success: false, message: 'Note not found.' });
    }

    res.json({ success: true, note });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// @route   POST /api/notes/:id/download
// @desc    Increment download count
// @access  Private
router.post('/:id/download', protect, async (req, res) => {
  try {
    const note = await Note.findByIdAndUpdate(
      req.params.id,
      { $inc: { downloadCount: 1 } },
      { new: true }
    );
    if (!note) return res.status(404).json({ success: false, message: 'Note not found.' });
    res.json({ success: true, downloadCount: note.downloadCount });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// @route   PUT /api/notes/:id
// @desc    Update note details (Teacher who uploaded only)
// @access  Private/Teacher
router.put('/:id', protect, authorize('teacher'), async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note || !note.isActive) {
      return res.status(404).json({ success: false, message: 'Note not found.' });
    }
    if (note.uploadedBy.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to edit this note.' });
    }

    const { title, description, subject, semester, branch, section, tags } = req.body;
    const updates = {};
    if (title) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (subject) updates.subject = subject;
    if (semester) updates.semester = parseInt(semester);
    if (branch) updates.branch = branch;
    if (section) updates.section = section;
    if (tags !== undefined) updates.tags = tags.split(',').map((t) => t.trim()).filter(Boolean);

    const updated = await Note.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
      .populate('uploadedBy', 'name email department');

    res.json({ success: true, message: 'Note updated successfully.', note: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// @route   DELETE /api/notes/:id
// @desc    Delete a note (Teacher who uploaded only)
// @access  Private/Teacher
router.delete('/:id', protect, authorize('teacher'), async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note || !note.isActive) {
      return res.status(404).json({ success: false, message: 'Note not found.' });
    }
    if (note.uploadedBy.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this note.' });
    }

    // Delete from Cloudinary
    if (note.filePublicId) {
      try {
        await cloudinary.uploader.destroy(note.filePublicId, { resource_type: 'raw' });
      } catch (cloudErr) {
        console.warn('Cloudinary deletion failed:', cloudErr.message);
      }
    }

    note.isActive = false;
    await note.save();

    res.json({ success: true, message: 'Note deleted successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});
// @route   GET /api/notes/:id/file
// @desc    Get download URL for a note file (JSON)
// @access  Private
router.get('/:id/file', protect, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note || !note.isActive) {
      return res.status(404).json({ success: false, message: 'Note not found.' });
    }

    // Increment download count
    note.downloadCount += 1;
    await note.save();

    const fileUrl = note.fileUrl;
    res.json({ success: true, url: fileUrl, fileName: note.fileName });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Download failed.' });
  }
});

const https = require('https');
const http = require('http');

// Helper to follow redirects and stream
const streamFile = (url, res, fileName, retryCount = 0) => {
  if (retryCount > 5) {
    return res.status(500).send('Too many redirects');
  }

  const client = url.startsWith('https') ? https : http;
  
  const options = {
    headers: {
      'User-Agent': 'College-Portal-Backend/1.0'
    }
  };

  client.get(url, options, (proxyRes) => {
    // Handle redirects
    if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
      let redirectUrl = proxyRes.headers.location;
      if (!redirectUrl.startsWith('http')) {
        const origin = new URL(url).origin;
        redirectUrl = origin + redirectUrl;
      }
      return streamFile(redirectUrl, res, fileName, retryCount + 1);
    }

    if (proxyRes.statusCode !== 200) {
      console.error(`Cloudinary Error: Status ${proxyRes.statusCode} for URL ${url}`);
      // Send more info if possible
      return res.status(proxyRes.statusCode).send(`Error fetching file: Storage returned ${proxyRes.statusCode}`);
    }

    // Set headers
    const safeFileName = encodeURIComponent(fileName).replace(/['()]/g, escape).replace(/\*/g, '%2A');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/"/g, '')}"; filename*=UTF-8''${safeFileName}`);
    
    if (proxyRes.headers['content-type']) {
      res.setHeader('Content-Type', proxyRes.headers['content-type']);
    }
    if (proxyRes.headers['content-length']) {
      res.setHeader('Content-Length', proxyRes.headers['content-length']);
    }

    proxyRes.pipe(res);
  }).on('error', (err) => {
    console.error('Streaming error:', err);
    if (!res.headersSent) res.status(500).send('Download failed');
  });
};

// @route   GET /api/notes/:id/download
// @desc    Direct download stream
// @access  Private
router.get('/:id/download', protect, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note || !note.isActive) return res.status(404).send('Note not found');

    note.downloadCount += 1;
    await note.save();

    // Determine resource type for Cloudinary
    let resourceType = 'raw';
    if (note.fileType && (note.fileType.startsWith('image/') || note.fileType === 'application/pdf')) {
      // Cloudinary treats PDFs as images for transformations/signing sometimes, 
      // but 'auto' or 'raw' is safer for documents.
      resourceType = note.fileUrl.includes('/raw/') ? 'raw' : 'image';
    }

    // Generate a SIGNED URL using the SDK - this fixes the 401 Unauthorized issue
    // We use the public ID to generate a fresh, authenticated link
    const signedUrl = cloudinary.url(note.filePublicId, {
      resource_type: resourceType,
      sign_url: true,
      secure: true
    });

    console.log(`Starting signed download stream for: ${note.fileName}`);
    console.log(`Signed URL generated successfully.`);
    
    streamFile(signedUrl, res, note.fileName || 'file');

  } catch (error) {
    console.error('Download error:', error);
    if (!res.headersSent) res.status(500).send('Server error during download');
  }
});

module.exports = router;
