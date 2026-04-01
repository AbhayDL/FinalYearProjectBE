const express = require("express");
const bcrypt = require("bcryptjs");
const { protect, admin } = require("../middleware/auth");
const User = require("../models/User");
const Subject = require("../models/Subject");
const Department = require("../models/Department");
const Problem = require("../models/Problem");
const Submission = require("../models/Submission");
const { toSafeUser } = require("../utils/userResponse");
const XLSX = require("xlsx");

const router = express.Router();

function normalizeAcademicFields(role, payload = {}) {
  if (role === "student") {
    return {
      department: payload.department || "",
      year: payload.year || "",
      semester: payload.semester || "",
    };
  }

  return {
    department: "",
    year: "",
    semester: "",
  };
}

function normalizeStudentPayload(payload = {}) {
  return {
    name: String(payload.name || "").trim(),
    email: String(payload.email || "").trim(),
    password: String(payload.password || "").trim(),
    role: "student",
    ...normalizeAcademicFields("student", payload),
  };
}

function parseWorkbookStudents(fileBase64) {
  const buffer = Buffer.from(String(fileBase64 || ""), "base64");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return [];
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  return rows.map((row) => ({
    name: row.Name || row.name || row.StudentName || row.studentName || "",
    email: row.Email || row.email || "",
    password: row.Password || row.password || ""
  }));
}

async function createBulkStudents(payload = {}) {
  const { students, department, year, semester, defaultPassword } = payload || {};
  if (!Array.isArray(students) || students.length === 0) {
    return { error: { status: 400, message: "students array is required" } };
  }

  if (!String(department || "").trim() || !String(year || "").trim()) {
    return { error: { status: 400, message: "Department and year are required for bulk student creation" } };
  }

  const prepared = [];
  const invalid = [];

  students.forEach((student, index) => {
    const normalized = normalizeStudentPayload({
      ...student,
      department,
      year,
      semester: semester || "",
      password: student?.password || defaultPassword
    });

    if (!normalized.name || !normalized.email || !normalized.password) {
      invalid.push({
        index,
        email: normalized.email,
        reason: "Name, email, and password are required"
      });
      return;
    }

    prepared.push(normalized);
  });

  const emails = prepared.map((student) => student.email);
  const existingUsers = await User.find({ email: { $in: emails } }).select("email").lean();
  const existingEmailSet = new Set(existingUsers.map((user) => user.email));

  const created = [];
  const skipped = [...invalid];

  for (const student of prepared) {
    if (existingEmailSet.has(student.email)) {
      skipped.push({ email: student.email, reason: "Email already in use" });
      continue;
    }

    const createdStudent = await User.create({
      ...student,
      isActive: true,
      academicEditEnabled: false,
      academicEditUsed: false,
      academicEditEnabledAt: null,
      academicEditUsedAt: null
    });

    created.push(toSafeUser(createdStudent));
    existingEmailSet.add(student.email);
  }

  return {
    status: 201,
    body: {
      message: `Created ${created.length} student(s).`,
      createdCount: created.length,
      skippedCount: skipped.length,
      created,
      skipped
    }
  };
}

router.get("/users", protect, admin, async (req, res) => {
  const users = await User.find().select("-password").sort({ createdAt: -1 });
  res.json(users);
});

router.post("/users", protect, admin, async (req, res) => {
  try {
    const { name, email, password, role, isActive } = req.body || {};

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

    const academic = normalizeAcademicFields(role, req.body || {});
    const user = await User.create({
      name: String(name).trim(),
      email: String(email).trim(),
      password,
      role,
      department: academic.department,
      year: academic.year,
      semester: academic.semester,
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

router.post("/users/bulk-students", protect, admin, async (req, res) => {
  try {
    const result = await createBulkStudents(req.body || {});
    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }
    res.status(result.status).json(result.body);
  } catch (error) {
    console.error("Bulk student creation failed:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/users/bulk-students/import-excel", protect, admin, async (req, res) => {
  try {
    const { fileBase64, department, year, semester, defaultPassword } = req.body || {};
    if (!String(fileBase64 || "").trim()) {
      return res.status(400).json({ message: "Excel file is required" });
    }

    const students = parseWorkbookStudents(fileBase64);
    if (!students.length) {
      return res.status(400).json({ message: "No student rows found in the Excel file" });
    }

    const result = await createBulkStudents({ students, department, year, semester, defaultPassword });
    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("Excel student import failed:", error);
    res.status(400).json({ message: "Failed to read Excel file. Use columns: Name, Email, Password(optional)." });
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
    const { name, email, role, isActive, password } = req.body;
    const nextRole = role || undefined;
    const academic = normalizeAcademicFields(nextRole, req.body || {});
    const update = {
      name,
      email,
      role,
      isActive,
      department: academic.department,
      year: academic.year,
      semester: academic.semester,
    };

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

router.post("/students/academic-edit/unlock", protect, admin, async (req, res) => {
  try {
    const { department, year, semester } = req.body || {};
    const filter = { role: "student" };

    if (String(department || "").trim()) filter.department = String(department).trim();
    if (String(year || "").trim()) filter.year = String(year).trim();
    if (String(semester || "").trim()) filter.semester = String(semester).trim();

    if (!filter.department && !filter.year && !filter.semester) {
      return res.status(400).json({ message: "At least one filter is required" });
    }

    const result = await User.updateMany(filter, {
      $set: {
        academicEditEnabled: true,
        academicEditUsed: false,
        academicEditEnabledAt: new Date(),
        academicEditUsedAt: null
      }
    });

    res.json({
      message: `Academic update unlocked for ${result.modifiedCount} student(s).`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error("Bulk academic unlock failed:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/students/:id/academic-edit/unlock", protect, admin, async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, role: "student" },
      {
        $set: {
          academicEditEnabled: true,
          academicEditUsed: false,
          academicEditEnabledAt: new Date(),
          academicEditUsedAt: null
        }
      },
      { new: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ message: "Student not found" });
    }

    res.json({
      message: "Academic edit enabled for this student.",
      user
    });
  } catch (error) {
    console.error("Single academic unlock failed:", error);
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

router.get("/departments", protect, admin, async (req, res) => {
  try {
    const departments = await Department.find().sort({ name: 1 });
    res.json(departments);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/departments", protect, admin, async (req, res) => {
  try {
    const { name, code, description } = req.body || {};
    if (!String(name || "").trim()) {
      return res.status(400).json({ message: "Department name is required" });
    }

    const department = await Department.create({
      name: String(name).trim(),
      code: String(code || "").trim(),
      description: String(description || "").trim()
    });
    res.status(201).json(department);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "Department already exists" });
    }
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/departments/:id", protect, admin, async (req, res) => {
  try {
    const department = await Department.findById(req.params.id);
    if (!department) return res.status(404).json({ message: "Department not found" });

    const inUse = await Promise.all([
      Subject.countDocuments({ department: department.name }),
      User.countDocuments({ department: department.name }),
      Problem.countDocuments({ department: department.name })
    ]);
    if (inUse.some((count) => count > 0)) {
      return res.status(400).json({ message: "Department is in use and cannot be deleted" });
    }

    await Department.findByIdAndDelete(req.params.id);
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
      { $group: { _id: { subject: "$subject", department: "$department", year: "$year", semester: "$semester" }, totalProblems: { $sum: 1 } } },
    ]);
    const countMap = counts.reduce((acc, item) => {
      acc[`${item._id.subject}::${item._id.department || ""}::${item._id.year || ""}::${item._id.semester || ""}`] = item.totalProblems;
      return acc;
    }, {});

    res.json(
      subjects.map((subject) => ({
        ...subject,
        totalProblems: countMap[`${subject.name}::${subject.department || ""}::${subject.year || ""}::${subject.semester || ""}`] || 0,
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
    if (!String(req.body?.department || "").trim()) {
      return res.status(400).json({ message: "Department is required" });
    }
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
        subject: problem.subject ? { name: problem.subject, department: problem.department || "" } : null,
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
    const [usersByRole, problemsByLanguage, subjectsByYear, subjectsBySemester, subjectsByDepartment] = await Promise.all([
      User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
      Problem.aggregate([{ $group: { _id: "$language", count: { $sum: 1 } } }]),
      Subject.aggregate([{ $group: { _id: "$year", count: { $sum: 1 } } }]),
      Subject.aggregate([{ $group: { _id: "$semester", count: { $sum: 1 } } }]),
      Subject.aggregate([{ $group: { _id: "$department", count: { $sum: 1 } } }]),
    ]);

    res.json({ usersByRole, problemsByLanguage, subjectsByYear, subjectsBySemester, subjectsByDepartment });
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
