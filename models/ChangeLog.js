import mongoose from "mongoose";
const { Schema } = mongoose;


const ChangeSchema = new Schema({
    site: { type: Schema.Types.ObjectId, ref: "Site", required: true, index: true },
    fromSnapshot: { type: Schema.Types.ObjectId, ref: "Snapshot" },
    toSnapshot: { type: Schema.Types.ObjectId, ref: "Snapshot" },
    date: { type: Date, index: true },
    addedCount: { type: Number, default: 0 },
    removedCount: { type: Number, default: 0 },
    updatedCount: { type: Number, default: 0 },
    // Standard fields (top-level for compatibility)
    added: [Schema.Types.Mixed],
    removed: [Schema.Types.Mixed],
    updated: [Schema.Types.Mixed],
    // New detailed structure
    details: {
        added: [Schema.Types.Mixed],
        removed: [Schema.Types.Mixed],
        updated: [Schema.Types.Mixed]
    }
}, { timestamps: true });


export default mongoose.model("ChangeLog", ChangeSchema);