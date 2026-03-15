const mongoose = require('mongoose');

const subjectMarkSchema = new mongoose.Schema({
  subjectCode: { type: String, required: true, trim: true, uppercase: true },
  subjectName: { type: String, required: true, trim: true },
  // Internal Assessment (IA)
  ia1: { type: Number, min: 0, max: 30, default: null },
  ia2: { type: Number, min: 0, max: 30, default: null },
  ia3: { type: Number, min: 0, max: 30, default: null },
  // Semester End Exam
  see: { type: Number, min: 0, max: 100, default: null },
  // Max marks
  maxIA: { type: Number, default: 30 },
  maxSEE: { type: Number, default: 100 },
  credits: { type: Number, default: 4 },
});

const marksSchema = new mongoose.Schema(
  {
    // Identify student by USN
    usn: {
      type: String,
      required: [true, 'USN is required'],
      trim: true,
      uppercase: true,
    },
    // Also link to User if they have an account
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    studentName: {
      type: String,
      required: [true, 'Student name is required'],
      trim: true,
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
    academicYear: {
      type: String,
      required: true,
      trim: true, // e.g. "2024-25"
    },
    subjects: [subjectMarkSchema],
    // Who entered these marks
    enteredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    remarks: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Indexes
marksSchema.index({ usn: 1, semester: 1, academicYear: 1 }, { unique: true });
marksSchema.index({ semester: 1, branch: 1, section: 1 });
marksSchema.index({ studentId: 1 });

// Virtual: compute best IA (top 2 of 3)
marksSchema.methods.getBestIA = function (subject) {
  const ias = [subject.ia1, subject.ia2, subject.ia3].filter(v => v !== null && v !== undefined);
  if (ias.length === 0) return null;
  ias.sort((a, b) => b - a);
  if (ias.length >= 2) return ias[0] + ias[1]; // sum of best 2, max 60
  return ias[0];
};

module.exports = mongoose.model('Marks', marksSchema);
