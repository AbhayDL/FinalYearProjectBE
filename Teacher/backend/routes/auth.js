const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { protect } = require("../middleware/auth");
const { toSafeUser } = require("../utils/userResponse");

const router = express.Router();

function sanitizeBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

router.post("/register", protect, async (req, res) => {
  const { name, email, password, semester, year, department, role } = req.body;
  const requestedRole = role || "student";
  const canCreateAsAdmin = req.user.role === "admin";
  const canCreateAsTeacher = req.user.role === "teacher" && requestedRole === "student";

  if (!canCreateAsAdmin && !canCreateAsTeacher) {
    return res.status(403).json({ message: "You are not allowed to create this user" });
  }

  try {
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "Email already in use" });

    const academic =
      requestedRole === "student"
        ? {
            department: department || "",
            semester: semester || "",
            year: year || ""
          }
        : {
            department: "",
            semester: "",
            year: ""
          };

    const user = new User({
      name,
      email,
      password,
      role: requestedRole,
      department: academic.department,
      semester: academic.semester,
      year: academic.year
    });
    await user.save();

    res.status(201).json({
      message: `${requestedRole[0].toUpperCase()}${requestedRole.slice(1)} created successfully`,
      user: toSafeUser(user)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });
    if (user.isActive === false) return res.status(403).json({ message: "Account is inactive" });
    const isMatch = await user.matchPassword(password);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || "secret", {
      expiresIn: "7d",
    });
    res.json({ token, user: toSafeUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/auth/me
router.get("/me", protect, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authorized" });
    res.json(req.user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/auth/me/profile - update teacher/student/admin basic profile details
router.put("/me/profile", protect, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authorized" });

    const { name, email } = req.body || {};
    const updates = {};

    if (typeof name === "string" && name.trim()) {
      updates.name = name.trim();
    }

    if (typeof email === "string" && email.trim()) {
      const normalizedEmail = email.trim().toLowerCase();
      const existing = await User.findOne({
        email: normalizedEmail,
        _id: { $ne: req.user._id }
      }).select("_id");

      if (existing) {
        return res.status(400).json({ message: "Email already in use" });
      }

      updates.email = normalizedEmail;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No profile changes provided" });
    }

    const updated = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true
    }).select("-password");

    res.json({
      message: "Profile updated successfully",
      user: toSafeUser(updated)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/auth/me/preferences - update persisted teacher preferences
router.put("/me/preferences", protect, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authorized" });
    if (req.user.role !== "teacher") {
      return res.status(403).json({ message: "Teacher access required" });
    }

    const preferences = req.body || {};
    const updated = await User.findByIdAndUpdate(
      req.user._id,
      {
        preferences: {
          emailNotifications: sanitizeBoolean(preferences.emailNotifications, false),
          studentActivity: sanitizeBoolean(preferences.studentActivity, false),
          darkMode: sanitizeBoolean(preferences.darkMode, false),
          compactView: sanitizeBoolean(preferences.compactView, false)
        }
      },
      {
        new: true,
        runValidators: true
      }
    ).select("-password");

    res.json({
      message: "Preferences saved successfully",
      preferences: updated.preferences || {},
      user: toSafeUser(updated)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/auth/me/password - update current user's password
router.put("/me/password", protect, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authorized" });

    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current password and new password are required" });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters long" });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/auth/me - update student academic profile when admin has unlocked one-time editing
router.put("/me", protect, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authorized" });
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Student access required" });
    }

    if (!req.user.academicEditEnabled || req.user.academicEditUsed) {
      return res.status(403).json({ message: "Academic update is not enabled. Please contact admin." });
    }

    const { year, semester } = req.body || {};
    const update = {};
    if (typeof year === "string") update.year = year;
    if (typeof semester === "string") update.semester = semester;
    update.academicEditEnabled = false;
    update.academicEditUsed = true;
    update.academicEditUsedAt = new Date();

    const updated = await User.findByIdAndUpdate(req.user._id, update, {
      new: true,
      runValidators: true
    }).select("-password");

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
