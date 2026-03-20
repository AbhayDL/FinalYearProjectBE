const express = require("express");
const bcrypt = require("bcryptjs");
const { protect, admin } = require("../middleware/auth");
const User = require("../models/User");
const Subject = require("../models/Subject");
const Problem = require("../models/Problem");
const Submission = require("../models/Submission");
const { toSafeUser } = require("../utils/userResponse");

const router = express.Router();

router.get("/users", protect, admin, async (req, res) => {
  const users = await User.find().select("-password").sort({ createdAt: -1 });
  res.json(users);
});

router.post("/users", protect, admin, async (req, res) => {
  try {
    const { name, email, password, role, year, semester, isActive } = req.body || {};

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "name, email, password, and role are required" });
    }

    if (!["student", "teacher", "admin"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "Email already in use" });
    }

    const user = await User.create({
      name: String(name).trim(),
      email: String(email).trim(),
      password,
      role,
      year: year || "",
      semester: semester || "",
      isActive: typeof isActive === "boolean" ? isActive : true,
    });

    res.status(201).json(toSafeUser(user));
  } catch (error) {
    console.error("Create user failed:", error);

    if (error.code === 11000) {
      return res.status(400).json({ message: "Email already in use" });
    }

    if (error.name === "ValidationError") {
      const firstMessage = Object.values(error.errors || {})[0]?.message || "Validation failed";
      return res.status(400).json({ message: firstMessage });
    }

    res.status(500).json({ message: "Server error" });
  }
});

router.get("/users/teacher", protect, admin, async (req, res) => {
  const teachers = await User.find({ role: "teacher" }).select("_id name").sort({ name: 1 });
  res.json(teachers);
});

router.get("/users/:id", protect, admin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/users/:id", protect, admin, async (req, res) => {
  try {
    const { name, email, role, isActive, password, year, semester } = req.body;
    const update = { name, email, role, isActive, year, semester };

    Object.keys(update).forEach((key) => {
      if (update[key] === undefined) delete update[key];
    });

    if (password && password.trim()) {
      const salt = await bcrypt.genSalt(10);
      update.password = await bcrypt.hash(password, salt);
    }

    const user = await User.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
      context: "query",
    }).select("-password");

    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/users/:id", protect, admin, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ message: "Deleted" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/subjects", protect, admin, async (req, res) => {
  try {
    const subjects = await Subject.find()
      .populate("assignedTeacher", "name")
      .sort({ createdAt: -1 })
      .lean();

    const counts = await Problem.aggregate([
      { $group: { _id: "$subject", totalProblems: { $sum: 1 } } },
    ]);
    const countMap = counts.reduce((acc, item) => {
      acc[item._id] = item.totalProblems;
      return acc;
    }, {});

    res.json(
      subjects.map((subject) => ({
        ...subject,
        totalProblems: countMap[subject.name] || 0,
      }))
    );
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/subjects/:id", protect, admin, async (req, res) => {
  try {
    const subject = await Subject.findById(req.params.id);
    if (!subject) return res.status(404).json({ message: "Subject not found" });
    res.json(subject);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/subjects", protect, admin, async (req, res) => {
  try {
    const subject = await Subject.create(req.body);
    res.status(201).json(subject);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/subjects/:id", protect, admin, async (req, res) => {
  try {
    const subject = await Subject.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
      context: "query",
    });
    if (!subject) return res.status(404).json({ message: "Subject not found" });
    res.json(subject);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/subjects/:id", protect, admin, async (req, res) => {
  try {
    const subject = await Subject.findByIdAndDelete(req.params.id);
    if (!subject) return res.status(404).json({ message: "Subject not found" });
    res.json({ message: "Deleted" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/problems", protect, admin, async (req, res) => {
  try {
    const problems = await Problem.find().sort({ createdAt: -1 }).lean();
    const users = await User.find({ email: { $in: problems.map((problem) => problem.createdBy).filter(Boolean) } })
      .select("email name")
      .lean();
    const creatorMap = users.reduce((acc, user) => {
      acc[user.email] = user.name;
      return acc;
    }, {});

    res.json(
      problems.map((problem) => ({
        ...problem,
        createdBy: problem.createdBy
          ? { email: problem.createdBy, name: creatorMap[problem.createdBy] || problem.createdBy }
          : null,
        subject: problem.subject ? { name: problem.subject } : null,
      }))
    );
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/analytics/dashboard", protect, admin, async (req, res) => {
  try {
    const [totalStudents, totalTeachers, totalSubjects, totalProblems] = await Promise.all([
      User.countDocuments({ role: "student" }),
      User.countDocuments({ role: "teacher" }),
      Subject.countDocuments(),
      Problem.countDocuments(),
    ]);

    const recentProblemsRaw = await Problem.find().sort({ createdAt: -1 }).limit(5).lean();
    const creators = await User.find({
      email: { $in: recentProblemsRaw.map((problem) => problem.createdBy).filter(Boolean) },
    })
      .select("email name")
      .lean();
    const creatorMap = creators.reduce((acc, user) => {
      acc[user.email] = user.name;
      return acc;
    }, {});

    const recentProblems = recentProblemsRaw.map((problem) => ({
      ...problem,
      createdBy: problem.createdBy
        ? { name: creatorMap[problem.createdBy] || problem.createdBy }
        : null,
      subject: problem.subject ? { name: problem.subject } : null,
    }));

    res.json({
      summary: { totalStudents, totalTeachers, totalSubjects, totalProblems },
      recentProblems,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/analytics/statistics", protect, admin, async (req, res) => {
  try {
    const [usersByRole, problemsByLanguage, subjectsByYear, subjectsBySemester] = await Promise.all([
      User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
      Problem.aggregate([{ $group: { _id: "$language", count: { $sum: 1 } } }]),
      Subject.aggregate([{ $group: { _id: "$year", count: { $sum: 1 } } }]),
      Subject.aggregate([{ $group: { _id: "$semester", count: { $sum: 1 } } }]),
    ]);

    res.json({ usersByRole, problemsByLanguage, subjectsByYear, subjectsBySemester });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/bootstrap-admin", async (req, res) => {
  try {
    const existingAdmin = await User.findOne({ role: "admin" });
    if (existingAdmin) {
      return res.status(409).json({ message: "Admin already exists" });
    }

    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ message: "name, email, and password are required" });
    }

    const adminUser = await User.create({ name, email, password, role: "admin", isActive: true });
    res.status(201).json({ message: "Admin created", user: toSafeUser(adminUser) });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
