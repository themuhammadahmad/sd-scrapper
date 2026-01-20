// models/ExportFile.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const ExportFileSchema = new Schema({
  filename: { 
    type: String, 
    required: true,
    unique: true 
  },
  filePath: { 
    type: String, 
    required: true 
  },
  fileType: { 
    type: String, 
    enum: ['full', 'university', 'changes'], 
    required: true 
  },
  universityId: { 
    type: Schema.Types.ObjectId, 
    ref: "Site",
    default: null 
  },
  universityName: { 
    type: String 
  },
  recordCount: { 
    type: Number, 
    required: true 
  },
  fileSize: { 
    type: Number, // in bytes
    required: true 
  },
  generatedAt: { 
    type: Date, 
    default: Date.now 
  },
  expiresAt: { 
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  },
  downloadCount: { 
    type: Number, 
    default: 0 
  },
  lastDownloadedAt: { 
    type: Date 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  metadata: { 
    type: Schema.Types.Mixed 
  }
}, { 
  timestamps: true 
});

// Indexes for faster queries
ExportFileSchema.index({ fileType: 1, universityId: 1 });
ExportFileSchema.index({ generatedAt: -1 });
ExportFileSchema.index({ expiresAt: 1 });
ExportFileSchema.index({ isActive: 1 });

export default mongoose.model("ExportFile", ExportFileSchema);