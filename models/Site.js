import mongoose from "mongoose";
const { Schema } = mongoose;


const SiteSchema = new Schema({
baseUrl: { type: String, required: true, unique: true, index: true },
staffDirectory: { type: String, required: true },
metadata: { type: Schema.Types.Mixed },
lastScrapedAt: { type: Date },
latestSnapshot: { type: Schema.Types.ObjectId, ref: "Snapshot" }
}, { timestamps: true });


export default mongoose.model("Site", SiteSchema);