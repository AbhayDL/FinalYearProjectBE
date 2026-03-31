const mongoose = require("mongoose");

const discussionSchema = new mongoose.Schema(
  {
    problem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Problem",
      required: true
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    question: {
      type: String,
      required: true,
      trim: true
    },
    answer: {
      type: String,
      default: "",
      trim: true
    },
    status: {
      type: String,
      enum: ["open", "answered"],
      default: "open"
    }
  },
  { timestamps: true }
);

discussionSchema.index({ problem: 1, student: 1, createdAt: -1 });

module.exports = mongoose.model("Discussion", discussionSchema);
