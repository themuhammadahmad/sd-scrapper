import mongoose from "mongoose";
const { Schema } = mongoose;


const ChangeSchema = new Schema({
site: { type: Schema.Types.ObjectId, ref: "Site", required: true, index: true },
fromSnapshot: { type: Schema.Types.ObjectId, ref: "Snapshot" },
toSnapshot: { type: Schema.Types.ObjectId, ref: "Snapshot" },
added: [Schema.Types.Mixed],
removed: [Schema.Types.Mixed],
updated: [{
before: Schema.Types.Mixed,
after: Schema.Types.Mixed,
diffs: Schema.Types.Mixed
}]
}, { timestamps: true });


export default mongoose.model("ChangeLog", ChangeSchema);