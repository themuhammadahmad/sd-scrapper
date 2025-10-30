// models/FailedDirectory.js
import mongoose from 'mongoose';

const failedDirectorySchema = new mongoose.Schema({
  baseUrl: {
    type: String,
    required: true
  },
  staffDirectory: {
    type: String,
    required: true,
    unique: true
  },
  failureType: {
    type: String,
    enum: ['no_data', 'fetch_failed', 'parsing_failed'],
    required: true
  },
  errorMessage: {
    type: String
  },
  
  lastAttempt: {
    type: Date,
    default: Date.now
  },
  attemptCount: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true
});

export default mongoose.model('FailedDirectory', failedDirectorySchema);