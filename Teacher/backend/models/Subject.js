const mongoose = require("mongoose");

const subjectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    code: String,
    description: String,
    department: { type: String, required: true },
    assignedTeacher: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    year: String,
    semester: String,
    totalProblems: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Subject", subjectSchema);
