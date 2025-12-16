import mongoose from 'mongoose';

const staffDirectorySchema = new mongoose.Schema({
  baseUrl: {
    type: String,
    required: true,
    index: true
  },
  staffDirectory: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // NEW: IPEDS identifier
  ipeds: {
    type: String,
    default: '',
    index: true
  },
  // NEW: School name
  schoolName: {
    type: String,
    default: ''
  },
  // Store which parser worked for this site (no enum - flexible)
  successfulParser: {
    type: String,
    default: null
  },
  // Track if the successful parser failed in the last attempt
  parserFailedLastTime: {
    type: Boolean,
    default: false
  },
  // Track processing stats
  lastProcessedAt: {
    type: Date
  },
  processCount: {
    type: Number,
    default: 0
  },
  lastStaffCount: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

export default mongoose.model('StaffDirectory', staffDirectorySchema);