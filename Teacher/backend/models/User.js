const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["admin", "teacher", "student"], default: "student" },
    isActive: { type: Boolean, default: true },
    department: { type: String, default: "" },
    semester: { type: String },
    year: { type: String },
    preferences: {
      emailNotifications: { type: Boolean, default: false },
      studentActivity: { type: Boolean, default: false },
      darkMode: { type: Boolean, default: false },
      compactView: { type: Boolean, default: false }
    },
    academicEditEnabled: { type: Boolean, default: false },
    academicEditUsed: { type: Boolean, default: false },
    academicEditEnabledAt: { type: Date, default: null },
    academicEditUsedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
