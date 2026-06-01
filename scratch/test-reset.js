import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import Site from "../models/Site.js";
import Snapshot from "../models/Snapshot.js";
import FailedDirectory from "../models/FailedDirectory.js";
import ChangeLog from "../models/ChangeLog.js";
import StaffDirectory from "../models/StaffDirectory.js";
import StaffProfile from "../models/StaffProfile.js";

const MONGODB_URI = "mongodb+srv://learnFirstAdmin:mT4aOUQ8IeZlGqf6@khareedofrokht.h4nje.mongodb.net/universities?retryWrites=true&w=majority&appName=khareedofrokht";

async function main() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  console.log("Connected!");

  try {
    // Find one site
    const site = await Site.findOne();
    if (!site) {
      console.log("No site found in database.");
      return;
    }

    console.log(`Found site: ${site.baseUrl} (${site._id})`);
    
    // Check Snapshot count
    const snapshotCount = await Snapshot.countDocuments({ site: site._id });
    console.log(`Snapshots count: ${snapshotCount}`);

    // Check StaffProfile count
    const profileCount = await StaffProfile.countDocuments({ site: site._id });
    console.log(`StaffProfile count: ${profileCount}`);

    // Check ChangeLog count
    const changeLogCount = await ChangeLog.countDocuments({ site: site._id });
    console.log(`ChangeLog count: ${changeLogCount}`);

    // Check StaffDirectory
    const staffDir = await StaffDirectory.findOne({
      $or: [
        { baseUrl: site.baseUrl },
        { staffDirectory: site.staffDirectory }
      ]
    });
    
    if (staffDir) {
      console.log(`Found StaffDirectory: ${staffDir.baseUrl}, successfulParser: ${staffDir.successfulParser}`);
    } else {
      console.log("No StaffDirectory found for this site.");
    }

  } catch (error) {
    console.error("Test failed with error:", error);
  } finally {
    await mongoose.connection.close();
    console.log("Connection closed.");
  }
}

main();
