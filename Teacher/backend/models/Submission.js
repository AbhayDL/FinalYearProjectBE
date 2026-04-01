const mongoose = require("mongoose");

const submissionCommentSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    authorRole: {
      type: String,
      enum: ["student", "teacher"],
      required: true
    },
    text: { type: String, required: true, trim: true }
  },
  { timestamps: true }
);

const submissionSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    problem: { type: mongoose.Schema.Types.ObjectId, ref: "Problem", required: true },
    sourceCode: { type: String, required: true },
    studentSourceCode: { type: String, default: "" },
    teacherReviewedCode: { type: String, default: "" },
    languageId: { type: Number, required: true },
    status: {
      type: String,
      enum: ["saved", "passed", "failed"],
      required: true
    },
    passedCount: { type: Number, default: 0 },
    totalCount: { type: Number, default: 0 },
    score: { type: Number, default: 0 },
    queryPending: { type: Boolean, default: false },
    queryStatus: {
      type: String,
      enum: ["none", "open", "answered", "revised_by_student"],
      default: "none"
    },
    teacherAnsweredAt: { type: Date, default: null },
    lastSavedBy: {
      type: String,
      enum: ["student", "teacher"],
      default: "student"
    },
    teacherOverrideStatus: {
      type: String,
      enum: ["none", "pending", "approved"],
      default: "none"
    },
    guiReview: {
      hasEvidence: { type: Boolean, default: false },
      screenshotDataUrl: { type: String, default: "" },
      htmlPreview: { type: String, default: "" },
      notes: { type: String, default: "" },
      teacherStatus: {
        type: String,
        enum: ["not_required", "pending", "approved", "needs_changes"],
        default: "not_required"
      },
      teacherNote: { type: String, default: "" },
      teacherReviewedAt: { type: Date, default: null }
    },
    comments: { type: [submissionCommentSchema], default: [] }
  },
  { timestamps: true }
);

submissionSchema.index({ student: 1, problem: 1 }, { unique: true });

module.exports = mongoose.model("Submission", submissionSchema);
