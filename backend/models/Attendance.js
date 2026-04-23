const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: [true, 'Date is required'],
    },
    semester: {
      type: Number,
      required: true,
      min: 1,
      max: 8,
    },
    branch: {
      type: String,
      required: true,
      enum: ['CSE', 'ECE', 'ME', 'CE', 'EEE', 'IT', 'AIDS', 'AIML'],
    },
    section: {
      type: String,
      enum: ['A', 'B', 'C', 'D'],
      required: true,
    },
    subject: {
      type: String,
      trim: true,
      default: 'General',
    },
    duration: {
      type: String,
      trim: true,
      default: '',
    },
    // Students marked present (from face recognition)
    presentStudents: [
      {
        usn: { type: String, uppercase: true, trim: true },
        name: { type: String, trim: true },
        confidence: { type: Number, min: 0, max: 1, default: 1 },
      },
    ],
    // Students who were absent
    absentStudents: [
      {
        usn: { type: String, uppercase: true, trim: true },
        name: { type: String, trim: true },
      },
    ],
    totalPresent: { type: Number, default: 0 },
    totalStrength: { type: Number, default: 0 },
    // Group photo used for recognition
    groupPhotoUrl: { type: String, default: null },
    // Teacher who marked attendance
    markedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    method: {
      type: String,
      enum: ['face_recognition', 'manual'],
      default: 'face_recognition',
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

attendanceSchema.index({ date: 1, semester: 1, branch: 1, section: 1, subject: 1 });
attendanceSchema.index({ 'presentStudents.usn': 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
