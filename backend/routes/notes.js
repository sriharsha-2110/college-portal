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
      notes,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Fetch notes error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching notes.' });
  }
});

// @route   GET /api/notes/stats
// @desc    Get notes stats
// @access  Private
router.get('/stats', protect, async (req, res) => {
  try {
    const totalNotes = await Note.countDocuments({ isActive: true });
    const userNotes = await Note.countDocuments({ uploadedBy: req.user.id, isActive: true });
    
    // Get recent notes
    const recentNotes = await Note.find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('title subject fileName fileType createdAt');

    res.json({
      success: true,
      stats: {
        totalNotes,
        userNotes,
        recentNotes
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Stats error.' });
  }
});

// @route   GET /api/notes/:id
// @desc    Get single note details
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id).populate('uploadedBy', 'name email department designation');
    if (!note || !note.isActive) {
      return res.status(404).json({ success: false, message: 'Note not found.' });
    }

    note.viewCount += 1;
    await note.save();

    res.json({ success: true, note });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// @route   DELETE /api/notes/:id
// @desc    Delete a note
// @access  Private/Teacher
router.delete('/:id', protect, authorize('teacher'), async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ success: false, message: 'Note not found.' });

    // Only allow uploader or admin to delete
    if (note.uploadedBy.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this note.' });
    }

    // Delete from Cloudinary if public ID exists
    if (note.filePublicId) {
      // Determine resource type from URL if not stored
      const resourceType = note.fileUrl.includes('/raw/') ? 'raw' : 'image';
      await cloudinary.uploader.destroy(note.filePublicId, { resource_type: resourceType });
    }

    await Note.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: 'Note deleted successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Delete failed.' });
  }
});

const https = require('https');
const http = require('http');

// Universal streaming helper with redirect support
const streamFile = (url, res, fileName, retryCount = 0) => {
  if (retryCount > 5) return res.status(500).send('Too many redirects');

  const client = url.startsWith('https') ? https : http;
  const options = { headers: { 'User-Agent': 'College-Portal-Backend/1.0' } };

  client.get(url, options, (proxyRes) => {
    // Handle Redirects
    if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
      let redirectUrl = proxyRes.headers.location;
      if (!redirectUrl.startsWith('http')) {
        const origin = new URL(url).origin;
        redirectUrl = origin + redirectUrl;
      }
      return streamFile(redirectUrl, res, fileName, retryCount + 1);
    }

    if (proxyRes.statusCode !== 200) {
      console.error(`Fetch failed: ${proxyRes.statusCode} for ${url}`);
      return res.status(proxyRes.statusCode).send(`Storage error: ${proxyRes.statusCode}`);
    }

    // Set headers for download
    const safeFileName = encodeURIComponent(fileName).replace(/['()]/g, escape).replace(/\*/g, '%2A');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/"/g, '')}"; filename*=UTF-8''${safeFileName}`);
    if (proxyRes.headers['content-type']) res.setHeader('Content-Type', proxyRes.headers['content-type']);
    if (proxyRes.headers['content-length']) res.setHeader('Content-Length', proxyRes.headers['content-length']);
    
    proxyRes.pipe(res);
  }).on('error', (err) => {
    console.error('Streaming error:', err);
    if (!res.headersSent) res.status(500).send('Download failed');
  });
};

// @route   GET /api/notes/:id/download
// @desc    Direct download stream with fail-safe redirect fallback
// @access  Private
router.get('/:id/download', protect, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note || !note.isActive) return res.status(404).send('Note not found');

    // Update download count
    note.downloadCount += 1;
    await note.save();

    // Determine the correct resource type and version for signing
    const resourceType = note.fileUrl.includes('/raw/') ? 'raw' : 'image';
    const versionMatch = note.fileUrl.match(/\/v(\d+)\//);
    const version = versionMatch ? versionMatch[1] : null;

    // Generate a SIGNED URL to bypass the 401 Unauthorized error
    const signedUrl = cloudinary.url(note.filePublicId, {
      resource_type: resourceType,
      type: 'upload',
      version: version,
      sign_url: true,
      secure: true
    });

    console.log(`[v6-Final] Streaming attempt: ${note.fileName} (${resourceType})`);
    const targetUrl = signedUrl;

    // Try to stream first
    const client = targetUrl.startsWith('https') ? https : http;
    client.get(targetUrl, { headers: { 'User-Agent': 'College-Portal-Backend/1.0' } }, (proxyRes) => {
      // If streaming is possible, do it
      if (proxyRes.statusCode === 200) {
        return streamFile(targetUrl, res, note.fileName);
      } 
      
      // If server-side fetch fails (404/401/etc), redirect the browser to the file directly
      console.log(`Streaming fetch failed with ${proxyRes.statusCode}, using browser redirect fallback.`);
      res.redirect(targetUrl);
    }).on('error', (err) => {
      console.error('Streaming connection error, falling back to redirect:', err);
      if (!res.headersSent) res.redirect(targetUrl);
    });

  } catch (error) {
    console.error('Download route error:', error);
    if (!res.headersSent) res.status(500).send('Server error during download');
  }
});

module.exports = router;
