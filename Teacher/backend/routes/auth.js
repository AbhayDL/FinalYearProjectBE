const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { protect } = require("../middleware/auth");
const { toSafeUser } = require("../utils/userResponse");

const router = express.Router();

router.post("/register", protect, async (req, res) => {
  const { name, email, password, semester, year, role } = req.body;
  const requestedRole = role || "student";
  const canCreateAsAdmin = req.user.role === "admin";
  const canCreateAsTeacher = req.user.role === "teacher" && requestedRole === "student";

  if (!canCreateAsAdmin && !canCreateAsTeacher) {
    return res.status(403).json({ message: "You are not allowed to create this user" });
  }

  try {
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "Email already in use" });

    const user = new User({
      name,
      email,
      password,
      role: requestedRole,
      semester: semester || "",
      year: year || ""
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

// PUT /api/auth/me - update student profile (year/semester)
router.put("/me", protect, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authorized" });
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Student access required" });
    }

    const { year, semester } = req.body || {};
    const update = {};
    if (typeof year === "string") update.year = year;
    if (typeof semester === "string") update.semester = semester;

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
