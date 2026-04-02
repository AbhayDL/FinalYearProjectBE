const Problem = require("../models/Problem");
const Subject = require("../models/Subject");
const Submission = require("../models/Submission");
const AntiCheatEvent = require("../models/AntiCheatEvent");
const Discussion = require("../models/Discussion");

function normalizeAcademicValue(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function matchesStudentAudience(problem, student) {
  if (!student || student.role !== "student") return true;

  const departmentOk =
    !problem?.department ||
    normalizeAcademicValue(problem.department) === normalizeAcademicValue(student.department);
  const yearOk =
    !problem?.year ||
    normalizeAcademicValue(problem.year) === normalizeAcademicValue(student.year);
  const semesterOk =
    !problem?.semester ||
    normalizeAcademicValue(problem.semester) === normalizeAcademicValue(student.semester);

  return departmentOk && yearOk && semesterOk;
}

function normalizeProblemPayload(body = {}) {
  const normalized = { ...body };
  normalized.guiReviewRequired = Boolean(body.guiReviewRequired) || String(body.language || "") === "1001";

  const rawLibraries = Array.isArray(body.allowedLibraries)
    ? body.allowedLibraries
    : String(body.allowedLibraries || "").split(",");
  normalized.allowedLibraries = rawLibraries
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  const rawChecklist = Array.isArray(body.teacherVerificationChecklist)
    ? body.teacherVerificationChecklist
    : String(body.teacherVerificationChecklist || "").split(/\r?\n/);
  normalized.teacherVerificationChecklist = rawChecklist
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  if (!normalized.guiProblemType) {
    normalized.guiProblemType = normalized.guiReviewRequired
      ? (String(body.language || "") === "1001" ? "html" : "gui_other")
      : "standard";
  }

  if (!normalized.guiReviewRequired) {
    normalized.guiProblemType = "standard";
  }

  if (normalized.guiReviewRequired) {
    normalized.testCases = [];
  }

  return normalized;
}

// ADD Problem
exports.addProblem = async (req, res) => {
  try {
    const { title, description, language, subject, subjectId } = req.body;

    if (!title || !description || !language) {
      return res.status(400).json({
        message: "Title, description, and language are required"
      });
    }

    if (!subject && !subjectId) {
      return res.status(400).json({ message: "Subject is required" });
    }

    const assigned = await Subject.findOne({
      ...(subjectId ? { _id: subjectId } : { name: subject }),
      assignedTeacher: req.user._id,
    }).select("_id name year semester department");

    if (!assigned) {
      return res.status(403).json({ message: "Subject not assigned to this teacher" });
    }

    const normalized = normalizeProblemPayload(req.body);
    const problem = new Problem({
      ...normalized,
      subjectId: assigned._id,
      subject: assigned.name,
      year: assigned.year || normalized.year || "",
      semester: assigned.semester || normalized.semester || "",
      department: assigned.department || "",
      createdBy: req.user.email
    });
    const savedProblem = await problem.save();

    res.status(201).json({
      message: "Problem Added Successfully",
      data: savedProblem
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET All Problems (Student List)
exports.getProblems = async (req, res) => {
  try {
    const filter = { status: "published" };
    if (req.user?.role === "student") {
      if (req.user.department) filter.department = req.user.department;
      if (req.user.year) filter.year = req.user.year;
      if (req.user.semester) filter.semester = req.user.semester;
    } else {
      if (req.query.department) filter.department = req.query.department;
      if (req.query.year) filter.year = req.query.year;
      if (req.query.semester) filter.semester = req.query.semester;
    }
    if (req.query.subject) filter.subject = req.query.subject;

    const problems = await Problem.find(
      filter,
      "title description difficulty semester subject year department language"
    ).sort({ createdAt: -1 });

    res.json(problems);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET Single Problem (IDE)
exports.getProblemById = async (req, res) => {
  try {
    const problem = await Problem.findById(req.params.id).lean();

    if (!problem) {
      return res.status(404).json({ message: "Problem not found" });
    }

    if (req.user?.role === "student" && !matchesStudentAudience(problem, req.user)) {
      return res.status(403).json({ message: "Not allowed to view this problem" });
    }

    // IMPORTANT: hidden test cases are only visible to admins or the owning teacher
    const includeHidden = req.query.includeHidden === 'true';
    const canViewHidden = Boolean(
      req.user &&
      req.user.isActive !== false &&
      (req.user.role === "admin" || (req.user.role === "teacher" && problem.createdBy === req.user.email))
    );

    if (includeHidden && !canViewHidden) {
      return res.status(403).json({ message: "Not allowed to view hidden test cases" });
    }

    if ((!includeHidden || !canViewHidden) && problem.testCases && problem.testCases.length > 0) {
      problem.testCases = problem.testCases.filter(tc => tc.visibility === "visible");
    }

    res.json(problem);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET problems created by a teacher (by email or identifier)
exports.getProblemsByTeacher = async (req, res) => {
  try {
    const email = req.user ? req.user.email : req.params.email;
    const filter = { createdBy: email };

    if (req.query.includeArchived !== "true") {
      filter.status = { $ne: "archived" };
    }

    const problems = await Problem.find(
      filter,
      "title description difficulty semester subject year department status createdAt"
    ).sort({ createdAt: -1 });

    res.json(problems);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// UPDATE problem (teacher)
exports.updateProblem = async (req, res) => {
  try {
    const id = req.params.id;
    const existing = await Problem.findById(id);
    if (!existing) return res.status(404).json({ message: "Problem not found" });
    if (existing.createdBy !== req.user.email) {
      return res.status(403).json({ message: "Not allowed to update this problem" });
    }

    if (req.body.subject || req.body.subjectId) {
      const assigned = await Subject.findOne({
        ...(req.body.subjectId ? { _id: req.body.subjectId } : { name: req.body.subject }),
        assignedTeacher: req.user._id,
      }).select("_id name year semester department");
      if (!assigned) {
        return res.status(403).json({ message: "Subject not assigned to this teacher" });
      }
      req.body.subjectId = assigned._id;
      req.body.subject = assigned.name;
      req.body.year = assigned.year || "";
      req.body.semester = assigned.semester || "";
      req.body.department = assigned.department || "";
    }

    const update = normalizeProblemPayload(req.body);
    delete update.createdBy;

    const updated = await Problem.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true
    });

    if (!updated) return res.status(404).json({ message: "Problem not found" });

    res.json({ message: "Problem updated", data: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// DELETE problem (teacher)
exports.deleteProblem = async (req, res) => {
  try {
    const id = req.params.id;
    const mode = String(req.query.mode || "soft").toLowerCase();
    const existing = await Problem.findById(id);
    if (!existing) return res.status(404).json({ message: "Problem not found" });
    if (existing.createdBy !== req.user.email) {
      return res.status(403).json({ message: "Not allowed to delete this problem" });
    }

    if (mode === "hard") {
      await Promise.all([
        Problem.findByIdAndDelete(id),
        Submission.deleteMany({ problem: id }),
        AntiCheatEvent.deleteMany({ problem: id }),
        Discussion.deleteMany({ problem: id })
      ]);

      return res.json({
        message: "Problem and all related records deleted permanently",
        mode: "hard"
      });
    }

    const archived = await Problem.findByIdAndUpdate(
      id,
      { status: "archived" },
      { new: true, runValidators: true }
    );

    return res.json({
      message: "Problem archived successfully",
      mode: "soft",
      data: archived
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

