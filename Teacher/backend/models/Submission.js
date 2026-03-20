const mongoose = require("mongoose");

const submissionSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    problem: { type: mongoose.Schema.Types.ObjectId, ref: "Problem", required: true },
    sourceCode: { type: String, required: true },
    languageId: { type: Number, required: true },
    status: {
      type: String,
      enum: ["passed", "failed"],
      required: true
    },
    passedCount: { type: Number, default: 0 },
    totalCount: { type: Number, default: 0 },
    score: { type: Number, default: 0 }
  },
  { timestamps: true }
);

submissionSchema.index({ student: 1, problem: 1 }, { unique: true });

module.exports = mongoose.model("Submission", submissionSchema);
