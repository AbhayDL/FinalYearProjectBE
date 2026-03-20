const Problem = require("../models/Problem");
const Submission = require("../models/Submission");
const Subject = require("../models/Subject");
const User = require("../models/User");
const { executeCode } = require("../services/executor");

function buildStudentAccessFilter(access = {}) {
  const filter = { role: "student" };

  if (access.year) {
    filter.year = access.year;
  }

  if (access.semester) {
    filter.semester = access.semester;
  }

  return filter;
}

// Student submit: run hidden test cases and store submission
exports.submitSolution = async (req, res) => {
  try {
    const { problemId, source_code, language_id } = req.body;

    if (!problemId || !source_code || !language_id) {
      return res.status(400).json({
        message: "problemId, source_code, and language_id are required"
      });
    }

    const parsedLanguageId = Number(language_id);
    if (!Number.isFinite(parsedLanguageId)) {
      return res.status(400).json({ message: "language_id must be a number" });
    }

    const problem = await Problem.findById(problemId).lean();
    if (!problem) {
      return res.status(404).json({ message: "Problem not found" });
    }

    const hiddenTestCases = (problem.testCases || []).filter(
      tc => tc.visibility === "hidden"
    );

    let passedCount = 0;
    const totalCount = hiddenTestCases.length;
    for (let i = 0; i < hiddenTestCases.length; i += 1) {
      const testCase = hiddenTestCases[i];
      try {
        const data = await executeCode(source_code, parsedLanguageId, testCase.input);

        const output = (data.stdout || "").trim();
        const expected = (testCase.output || "").trim();
        const passed = !data.stderr && output === expected;
        if (passed) passedCount += 1;

      } catch (err) {
        // Count as failed if any test execution errors out
      }
    }

    const status = passedCount === totalCount ? "passed" : "failed";
    const score = totalCount === 0 ? 100 : Math.round((passedCount / totalCount) * 100);

    const now = new Date();
    const submission = await Submission.findOneAndUpdate(
      { student: req.user._id, problem: problem._id },
      {
        $set: {
          sourceCode: source_code,
          languageId: parsedLanguageId,
          status,
          passedCount,
          totalCount,
          score,
          updatedAt: now
        },
        $setOnInsert: { createdAt: now }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({
      message:
        status === "passed"
          ? "All hidden test cases passed."
          : "Hidden test cases failed.",
      status,
      passedCount,
      totalCount,
      score,
      submissionId: submission._id
    });
  } catch (error) {
    console.error("Submit failed:", error.message);
    res.status(500).json({ message: "Submission failed" });
  }
};

// Teacher summary: who passed a specific problem
exports.getProblemSubmissionSummary = async (req, res) => {
  try {
    const { problemId } = req.params;
    const problem = await Problem.findById(problemId).select("title subject");
    if (!problem) {
      return res.status(404).json({ message: "Problem not found" });
    }

    const assignedSubject = await Subject.findOne({
      name: problem.subject,
      assignedTeacher: req.user._id
    }).select("_id year semester");

    if (!assignedSubject) {
      return res.status(403).json({ message: "Not allowed to assess this subject" });
    }

    const accessFilter = buildStudentAccessFilter({
      year: problem.year || assignedSubject.year,
      semester: problem.semester || assignedSubject.semester
    });

    const students = await User.find(accessFilter)
      .select("name email isActive year semester")
      .sort({ name: 1 });

    const submissions = await Submission.find({
      problem: problemId,
      status: "passed"
    })
      .sort({ createdAt: -1 })
      .select("student score createdAt");

    const latestByStudent = new Map();
    for (const sub of submissions) {
      const key = sub.student.toString();
      if (!latestByStudent.has(key)) latestByStudent.set(key, sub);
    }

    const summary = students.map(student => {
      const latest = latestByStudent.get(student._id.toString());
      return {
        id: student._id,
        name: student.name,
        email: student.email,
        isActive: student.isActive,
        hasPassed: Boolean(latest),
        score: latest ? latest.score : 0,
        submittedAt: latest ? latest.createdAt : null
      };
    });

    const passedCount = summary.filter(s => s.hasPassed).length;

    res.json({
      problem: { id: problem._id, title: problem.title },
      totalStudents: summary.length,
      passedCount,
      students: summary
    });
  } catch (error) {
    console.error("Summary failed:", error.message);
    res.status(500).json({ message: "Failed to load submission summary" });
  }
};

// Teacher summary: subject-wise completion (all tasks in subject)
exports.getSubjectCompletionSummary = async (req, res) => {
  try {
    const subject = req.params.subject || req.query.subject;
    if (!subject) {
      return res.status(400).json({ message: "Subject is required" });
    }

    const assignedSubject = await Subject.findOne({
      name: subject,
      assignedTeacher: req.user._id
    }).select("_id year semester");

    if (!assignedSubject) {
      return res.status(403).json({ message: "Not allowed to assess this subject" });
    }

    const problems = await Problem.find({
      subject,
      createdBy: req.user.email
    }).select("_id title");

    if (!problems || problems.length === 0) {
      return res.json({
        subject,
        problems: [],
        totalStudents: 0,
        students: []
      });
    }

    const problemIds = problems.map(p => p._id);
    const students = await User.find(
      buildStudentAccessFilter({
        year: assignedSubject.year,
        semester: assignedSubject.semester
      })
    )
      .select("name email isActive year semester")
      .sort({ name: 1 });

    const submissions = await Submission.find({
      problem: { $in: problemIds }
    }).select("student problem status score updatedAt");

    const byStudent = new Map();
    for (const sub of submissions) {
      const studentId = sub.student.toString();
      if (!byStudent.has(studentId)) byStudent.set(studentId, new Map());
      byStudent.get(studentId).set(sub.problem.toString(), sub);
    }

    const studentsSummary = students.map(student => {
      const taskMap = byStudent.get(student._id.toString()) || new Map();
      const tasks = {};
      let solvedCount = 0;

      for (const p of problems) {
        const sub = taskMap.get(p._id.toString());
        const passed = sub && sub.status === "passed";
        if (passed) solvedCount += 1;
        tasks[p._id.toString()] = {
          status: passed ? "passed" : "pending",
          score: sub ? sub.score : 0,
          submittedAt: sub ? sub.updatedAt : null
        };
      }

      return {
        id: student._id,
        name: student.name,
        email: student.email,
        isActive: student.isActive,
        allSolved: solvedCount === problems.length,
        solvedCount,
        totalTasks: problems.length,
        tasks
      };
    });

    res.json({
      subject,
      problems: problems.map(p => ({ id: p._id, title: p.title })),
      totalStudents: studentsSummary.length,
      students: studentsSummary
    });
  } catch (error) {
    console.error("Subject summary failed:", error.message);
    res.status(500).json({ message: "Failed to load subject summary" });
  }
};

exports.getStudentSubmissions = async (req, res) => {
  try {
    const submissions = await Submission.find({ student: req.user._id })
      .populate("problem", "title subject difficulty year semester")
      .sort({ updatedAt: -1 });

    const solvedCount = submissions.filter((submission) => submission.status === "passed").length;
    const pendingCount = submissions.filter((submission) => submission.status !== "passed").length;

    res.json({
      solvedCount,
      pendingCount,
      submissions: submissions.map((submission) => ({
        id: submission._id,
        status: submission.status,
        score: submission.score,
        passedCount: submission.passedCount,
        totalCount: submission.totalCount,
        updatedAt: submission.updatedAt,
        createdAt: submission.createdAt,
        problem: submission.problem,
      })),
    });
  } catch (error) {
    console.error("Student submission list failed:", error.message);
    res.status(500).json({ message: "Failed to load submissions" });
  }
};
