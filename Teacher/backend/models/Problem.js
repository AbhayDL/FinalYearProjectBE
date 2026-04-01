const mongoose = require("mongoose");

const testCaseSchema = new mongoose.Schema({
  input: { type: String, required: true },
  output: { type: String, required: true },
  visibility: {
    type: String,
    enum: ["visible", "hidden"],
    default: "visible"
  }
});

const problemSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },

    inputFormat: String,
    outputFormat: String,
    constraints: String,
    guiReviewRequired: { type: Boolean, default: false },
    guiProblemType: {
      type: String,
      enum: ["standard", "html", "python_graph", "ml_visual", "gui_other"],
      default: "standard"
    },
    allowedLibraries: { type: [String], default: [] },
    teacherVerificationChecklist: { type: [String], default: [] },

    year: String,
    semester: String,
    subject: String,

    difficulty: {
      type: String,
      enum: ["Easy", "Medium", "Hard"]
    },

    language: { type: String, required: true },
    createdBy: { type: String },
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "published"
    },

    testCases: [testCaseSchema]
  },
  { timestamps: true }
);

module.exports = mongoose.model("Problem", problemSchema);
