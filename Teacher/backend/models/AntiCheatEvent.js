const mongoose = require("mongoose");

const antiCheatEventSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    problem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Problem",
      default: null,
      index: true,
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      default: null,
    },
    sessionId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    eventType: {
      type: String,
      required: true,
      enum: [
        "session_started",
        "session_ended",
        "tab_hidden",
        "tab_visible",
        "fullscreen_exit",
        "fullscreen_enter",
        "copy_attempt",
        "paste_attempt",
        "idle_warning",
        "submission_made",
        "run_code",
        "save_code",
        "snapshot_captured",
        "page_blur",
        "page_focus",
      ],
    },
    page: {
      type: String,
      default: "",
      trim: true,
    },
    riskWeight: {
      type: Number,
      default: 0,
      min: 0,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    occurredAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

antiCheatEventSchema.index({ sessionId: 1, occurredAt: -1 });
antiCheatEventSchema.index({ student: 1, occurredAt: -1 });

module.exports = mongoose.model("AntiCheatEvent", antiCheatEventSchema);
