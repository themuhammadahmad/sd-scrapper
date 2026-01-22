// models/ScrapingSession.js
import mongoose from 'mongoose';
const { Schema } = mongoose;

const ScrapingSessionSchema = new Schema({
  sessionId: { 
    type: String, 
    required: true, 
    unique: true,
    default: () => Date.now().toString(36) + Math.random().toString(36).substr(2)
  },
  status: { 
    type: String, 
    enum: ['running', 'paused', 'completed', 'failed', 'stopped'], 
    default: 'running' 
  },
  currentIndex: { type: Number, default: 0 },
  totalDirectories: { type: Number, default: 0 },
  successCount: { type: Number, default: 0 },
  errorCount: { type: Number, default: 0 },
  directories: [{
    baseUrl: String,
    staffDirectory: String,
    status: String,
    processedAt: Date,
    errorMessage: String
  }],
  startTime: { type: Date, default: Date.now },
  lastUpdated: { type: Date, default: Date.now },
  errorLog: [{
    timestamp: Date,
    url: String,
    error: String
  }]
}, { timestamps: true });

// Index for quick lookups
ScrapingSessionSchema.index({ status: 1, lastUpdated: 1 });
ScrapingSessionSchema.index({ sessionId: 1 });

export default mongoose.model('ScrapingSession', ScrapingSessionSchema);