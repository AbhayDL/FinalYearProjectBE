const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const User = require("../models/User");

const ADMIN_NAME = "Admin";
const ADMIN_EMAIL = "admin@adm.com";
const ADMIN_PASSWORD = "Admin@123";

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is missing in .env");
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  const existingUser = await User.findOne({ email: ADMIN_EMAIL });

  if (existingUser) {
    existingUser.name = ADMIN_NAME;
    existingUser.password = ADMIN_PASSWORD;
    existingUser.role = "admin";
    existingUser.isActive = true;
    existingUser.department = "";
    existingUser.year = "";
    existingUser.semester = "";
    existingUser.academicEditEnabled = false;
    existingUser.academicEditUsed = false;
    existingUser.academicEditEnabledAt = null;
    existingUser.academicEditUsedAt = null;
    await existingUser.save();

    console.log(`Updated admin user: ${ADMIN_EMAIL}`);
  } else {
    await User.create({
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: "admin",
      isActive: true,
      department: "",
      year: "",
      semester: "",
      academicEditEnabled: false,
      academicEditUsed: false,
      academicEditEnabledAt: null,
      academicEditUsedAt: null
    });

    console.log(`Created admin user: ${ADMIN_EMAIL}`);
  }
}

main()
  .catch((error) => {
    console.error("Create admin failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
