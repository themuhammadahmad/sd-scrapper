import mongoose from "mongoose";
const { Schema } = mongoose;


const StaffProfileSchema = new Schema({
site: { type: Schema.Types.ObjectId, ref: "Site", required: true, index: true },
fingerprint: { type: String, required: true, unique: true, index: true },
profileUrl: String,
canonicalName: String,
emails: [String],
phones: [String],
lastSeenAt: Date,
firstSeenAt: Date,
lastSnapshot: { type: Schema.Types.ObjectId, ref: "Snapshot" },
raw: Schema.Types.Mixed,
 // NEW: Add categories array
  categories: [{
    type: String,
    index: true
  }]
}, { timestamps: true });


export default mongoose.model("StaffProfile", StaffProfileSchema);