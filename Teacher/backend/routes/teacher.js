const express = require("express");
const { protect, teacher } = require("../middleware/auth");
const Subject = require("../models/Subject");
const Problem = require("../models/Problem");
const Submission = require("../models/Submission");
const User = require("../models/User");

const router = express.Router();

function buildAudienceConditions(problems) {
  const seen = new Set();
  const conditions = [];

  for (const problem of problems || []) {
    const year = (problem.year || "").trim();
    const semester = (problem.semester || "").trim();

    if (!year && !semester) {
      continue;
    }

    const key = `${year}::${semester}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const condition = {};
    if (year) condition.year = year;
    if (semester) condition.semester = semester;
    conditions.push(condition);
  }

  return conditions;
}

// GET /api/teacher/subjects - subjects assigned to the logged-in teacher
router.get("/subjects", protect, teacher, async (req, res) => {
  try {
    const subjects = await Subject.find({ assignedTeacher: req.user._id })
      .select("name code year semester")
      .sort({ name: 1 });
    res.json(subjects);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/teacher/students - get all students created by admin
router.get("/students", protect, teacher, async (req, res) => {
  try {
    const teacherProblems = await Problem.find({ createdBy: req.user.email })
      .select("year semester")
      .lean();

    const audienceConditions = buildAudienceConditions(teacherProblems);
    if (audienceConditions.length === 0) {
      return res.json([]);
    }

    const students = await User.find({
      role: "student",
      $or: audienceConditions
    })
      .select("name email isActive createdAt year semester")
      .sort({ createdAt: -1 });
    res.json(students);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/teacher/students/:id/status - toggle student active status
router.put("/students/:id/status", protect, teacher, async (req, res) => {
  try {
    const student = await User.findById(req.params.id);
    if (!student || student.role !== "student") {
      return res.status(404).json({ message: "Student not found" });
    }

    student.isActive = !student.isActive;
    await student.save();

    res.json({
      message: `Student ${student.isActive ? 'activated' : 'deactivated'} successfully`,
      student: {
        id: student._id,
        name: student.name,
        email: student.email,
        isActive: student.isActive
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/teacher/analytics - get basic analytics for teacher dashboard
router.get("/analytics", protect, teacher, async (req, res) => {
  try {
    const teacherProblems = await Problem.find({ createdBy: req.user.email })
      .select("_id title createdAt year semester")
      .sort({ createdAt: -1 });
    const problemIds = teacherProblems.map(p => p._id);
    const audienceConditions = buildAudienceConditions(teacherProblems);

    const [totalStudents, activeStudents] = await Promise.all([
      audienceConditions.length
        ? User.countDocuments({ role: "student", $or: audienceConditions })
        : 0,
      audienceConditions.length
        ? User.countDocuments({ role: "student", isActive: true, $or: audienceConditions })
        : 0,
    ]);

    let totalSubmissions = 0;
    let averageScore = 0;
    let recentPassedSubmissions = [];

    if (problemIds.length > 0) {
      const [submissionCount, avgAgg, recentSubmissions] = await Promise.all([
        Submission.countDocuments({ problem: { $in: problemIds } }),
        Submission.aggregate([
          { $match: { problem: { $in: problemIds } } },
          { $group: { _id: null, avgScore: { $avg: "$score" } } }
        ]),
        Submission.find({ problem: { $in: problemIds }, status: "passed" })
          .sort({ updatedAt: -1 })
          .limit(5)
          .populate("student", "name")
          .populate("problem", "title"),
      ]);
      totalSubmissions = submissionCount;
      averageScore = Math.round(avgAgg[0]?.avgScore || 0);
      recentPassedSubmissions = recentSubmissions;
    }

    res.json({
      totalStudents,
      activeStudents,
      inactiveStudents: totalStudents - activeStudents,
      totalProblems: teacherProblems.length,
      totalSubmissions,
      averageScore,
      recentActivity: [
        ...teacherProblems.slice(0, 3).map((problem) => ({
          type: "problem",
          message: `Problem "${problem.title}" created`,
          createdAt: problem.createdAt,
        })),
        ...recentPassedSubmissions.map((submission) => ({
          type: "submission",
          message: `${submission.student?.name || "A student"} solved "${submission.problem?.title || "a problem"}"`,
          createdAt: submission.updatedAt,
        })),
      ]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/reports-summary", protect, teacher, async (req, res) => {
  try {
    const teacherProblems = await Problem.find({ createdBy: req.user.email })
      .select("_id title subject difficulty createdAt")
      .lean();

    const problemIds = teacherProblems.map((problem) => problem._id);
    if (problemIds.length === 0) {
      return res.json({
        totalProblems: 0,
        totalSubmissions: 0,
        successRate: 0,
        averageScore: 0,
        weeklyGrowth: 0,
        topPerformer: "No data",
        mostAttempted: "No data",
        bestSubject: "No data",
        needsImprovement: "No data",
        difficultyBreakdown: { Easy: 0, Medium: 0, Hard: 0, Unknown: 0 },
        subjectBreakdown: [],
        recentSubmissions: [],
      });
    }

    const submissions = await Submission.find({ problem: { $in: problemIds } })
      .populate("student", "name")
      .populate("problem", "title subject")
      .sort({ updatedAt: -1 })
      .lean();

    const totalSubmissions = submissions.length;
    const passedSubmissions = submissions.filter((submission) => submission.status === "passed");
    const successRate = totalSubmissions ? Math.round((passedSubmissions.length / totalSubmissions) * 100) : 0;
    const averageScore = totalSubmissions
      ? Math.round(submissions.reduce((sum, submission) => sum + (submission.score || 0), 0) / totalSubmissions)
      : 0;

    const difficultyBreakdown = teacherProblems.reduce((acc, problem) => {
      const difficulty = problem.difficulty || "Unknown";
      acc[difficulty] = (acc[difficulty] || 0) + 1;
      return acc;
    }, { Easy: 0, Medium: 0, Hard: 0, Unknown: 0 });

    const attemptsByProblem = {};
    const performerMap = {};
    const subjectMap = {};
    submissions.forEach((submission) => {
      const problemTitle = submission.problem?.title || "Unknown";
      const subject = submission.problem?.subject || "Unknown";
      const studentName = submission.student?.name || "Unknown";

      attemptsByProblem[problemTitle] = (attemptsByProblem[problemTitle] || 0) + 1;

      if (!performerMap[studentName]) {
        performerMap[studentName] = { scoreTotal: 0, attempts: 0, passed: 0 };
      }
      performerMap[studentName].scoreTotal += submission.score || 0;
      performerMap[studentName].attempts += 1;
      if (submission.status === "passed") performerMap[studentName].passed += 1;

      if (!subjectMap[subject]) {
        subjectMap[subject] = { scoreTotal: 0, attempts: 0, passed: 0 };
      }
      subjectMap[subject].scoreTotal += submission.score || 0;
      subjectMap[subject].attempts += 1;
      if (submission.status === "passed") subjectMap[subject].passed += 1;
    });

    const performerEntries = Object.entries(performerMap).map(([name, stats]) => ({
      name,
      averageScore: stats.attempts ? stats.scoreTotal / stats.attempts : 0,
      passed: stats.passed,
    }));
    performerEntries.sort((a, b) => (b.averageScore - a.averageScore) || (b.passed - a.passed));

    const topPerformer = performerEntries[0]?.name || "No data";
    const mostAttempted = Object.entries(attemptsByProblem)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || "No data";

    const subjectBreakdown = Object.entries(subjectMap).map(([subject, stats]) => ({
      subject,
      attempts: stats.attempts,
      averageScore: stats.attempts ? Math.round(stats.scoreTotal / stats.attempts) : 0,
      successRate: stats.attempts ? Math.round((stats.passed / stats.attempts) * 100) : 0,
    })).sort((a, b) => b.averageScore - a.averageScore);

    const bestSubject = subjectBreakdown[0]?.subject || "No data";
    const needsImprovement = subjectBreakdown[subjectBreakdown.length - 1]?.subject || "No data";

    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);
    const fourteenDaysAgo = new Date(now);
    fourteenDaysAgo.setDate(now.getDate() - 14);

    const currentWeek = submissions.filter((submission) => new Date(submission.updatedAt) >= sevenDaysAgo).length;
    const previousWeek = submissions.filter((submission) => {
      const updatedAt = new Date(submission.updatedAt);
      return updatedAt >= fourteenDaysAgo && updatedAt < sevenDaysAgo;
    }).length;

    const weeklyGrowth = previousWeek === 0
      ? (currentWeek > 0 ? 100 : 0)
      : Math.round(((currentWeek - previousWeek) / previousWeek) * 100);

    const recentSubmissions = submissions.slice(0, 5).map((submission) => ({
      studentName: submission.student?.name || "Unknown",
      problemTitle: submission.problem?.title || "Unknown",
      status: submission.status,
      score: submission.score || 0,
      updatedAt: submission.updatedAt,
    }));

    res.json({
      totalProblems: teacherProblems.length,
      totalSubmissions,
      successRate,
      averageScore,
      weeklyGrowth,
      topPerformer,
      mostAttempted,
      bestSubject,
      needsImprovement,
      difficultyBreakdown,
      subjectBreakdown,
      recentSubmissions,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
