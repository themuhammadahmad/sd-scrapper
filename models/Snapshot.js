import mongoose from "mongoose";
const { Schema } = mongoose;


const StaffMemberSub = new Schema({
fingerprint: { type: String, index: true },
name: { type: String, index: true },
profileUrl: String,
title: String,
emails: [String],
phones: [String],
socials: Schema.Types.Mixed,
description: String,
category: String,
raw: Schema.Types.Mixed,
sourceHtmlSnippet: String,
extractedAt: Date
}, { _id: false });


const SnapshotSchema = new Schema({
site: { type: Schema.Types.ObjectId, ref: "Site", required: true, index: true },
snapshotDate: { type: Date, required: true, index: true },
runId: String,
hash: { type: String, index: true },
categories: [{
name: String,
members: [StaffMemberSub],
count: Number
}],
totalCount: Number,
rawHtml: String
}, { timestamps: true });


SnapshotSchema.index({ site: 1, snapshotDate: 1 }, { unique: true });


export default mongoose.model("Snapshot", SnapshotSchema);