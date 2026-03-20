const Problem = require("../models/Problem");
const Subject = require("../models/Subject");

// ADD Problem
exports.addProblem = async (req, res) => {
  try {
    const { title, description, language, subject } = req.body;

    if (!title || !description || !language) {
      return res.status(400).json({
        message: "Title, description, and language are required"
      });
    }

    if (!subject) {
      return res.status(400).json({ message: "Subject is required" });
    }

    const assigned = await Subject.findOne({
      name: subject,
      assignedTeacher: req.user._id,
    }).select("_id");

    if (!assigned) {
      return res.status(403).json({ message: "Subject not assigned to this teacher" });
    }

    const problem = new Problem({ ...req.body, createdBy: req.user.email });
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
    if (req.query.year) filter.year = req.query.year;
    if (req.query.semester) filter.semester = req.query.semester;
    if (req.query.subject) filter.subject = req.query.subject;

    const problems = await Problem.find(
      filter,
      "title description difficulty semester subject year"
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
    const problems = await Problem.find(
      { createdBy: email },
      "title description difficulty semester subject year status createdAt"
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

    if (req.body.subject) {
      const assigned = await Subject.findOne({
        name: req.body.subject,
        assignedTeacher: req.user._id,
      }).select("_id");
      if (!assigned) {
        return res.status(403).json({ message: "Subject not assigned to this teacher" });
      }
    }

    const update = { ...req.body };
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
    const existing = await Problem.findById(id);
    if (!existing) return res.status(404).json({ message: "Problem not found" });
    if (existing.createdBy !== req.user.email) {
      return res.status(403).json({ message: "Not allowed to delete this problem" });
    }
    const deleted = await Problem.findByIdAndDelete(id);
    res.json({ message: "Problem deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

