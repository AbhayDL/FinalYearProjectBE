const express = require("express");
const { protect, teacher } = require("../middleware/auth");
const Subject = require("../models/Subject");
const Problem = require("../models/Problem");
const Submission = require("../models/Submission");
const User = require("../models/User");

const router = express.Router();

function formatSubjectAudienceLabel(item = {}) {
  const parts = [item.subject || item.name || "Unknown"];
  if (item.department) parts.push(item.department);
  if (item.year || item.semester) parts.push([item.year, item.semester].filter(Boolean).join(" / "));
  return parts.join(" | ");
}

function buildAudienceConditions(items) {
  const seen = new Set();
  const conditions = [];

  for (const item of items || []) {
    const department = (item.department || "").trim();
    const year = (item.year || "").trim();
    const semester = (item.semester || "").trim();

    if (!department && !year && !semester) {
      continue;
    }

    const key = `${department}::${year}::${semester}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const condition = {};
    if (department) condition.department = department;
    if (year) condition.year = year;
    if (semester) condition.semester = semester;
    conditions.push(condition);
  }

  return conditions;
}

function normalizeAcademicValue(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

async function getTeacherAudience(req) {
  const [teacherProblems, assignedSubjects] = await Promise.all([
    Problem.find({ createdBy: req.user.email })
      .select("_id department year semester title subject createdAt")
      .lean(),
    Subject.find({ assignedTeacher: req.user._id })
      .select("_id name department year semester")
      .lean()
  ]);

  return {
    teacherProblems,
    assignedSubjects,
    audienceConditions: buildAudienceConditions(assignedSubjects)
  };
}

function isStudentInAudience(student, audienceConditions) {
  return (audienceConditions || []).some((condition) => {
    const departmentOk = !condition.department || normalizeAcademicValue(condition.department) === normalizeAcademicValue(student.department);
    const yearOk = !condition.year || normalizeAcademicValue(condition.year) === normalizeAcademicValue(student.year);
    const semesterOk = !condition.semester || normalizeAcademicValue(condition.semester) === normalizeAcademicValue(student.semester);
    return departmentOk && yearOk && semesterOk;
  });
}

// GET /api/teacher/subjects - subjects assigned to the logged-in teacher
router.get("/subjects", protect, teacher, async (req, res) => {
  try {
    const subjects = await Subject.find({ assignedTeacher: req.user._id })
      .select("name code department year semester")
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
    const { audienceConditions } = await getTeacherAudience(req);
    if (audienceConditions.length === 0) {
      return res.json([]);
    }

    const students = await User.find({
      role: "student",
      $or: audienceConditions
    })
      .select("name email isActive createdAt department year semester")
      .sort({ createdAt: -1 });
    res.json(students);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/students/:id/overview", protect, teacher, async (req, res) => {
  try {
    const { teacherProblems, audienceConditions } = await getTeacherAudience(req);
    if (audienceConditions.length === 0) {
      return res.status(404).json({ message: "No students found for this teacher" });
    }

    const student = await User.findOne({
      _id: req.params.id,
      role: "student",
      $or: audienceConditions
    }).select("name email isActive createdAt updatedAt department year semester");

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const problemIds = teacherProblems.map((problem) => problem._id);
    const submissions = await Submission.find({
      student: student._id,
      problem: { $in: problemIds }
    })
      .populate("problem", "title subject difficulty year semester")
      .sort({ updatedAt: -1 })
      .lean();

    const solvedCount = submissions.filter((submission) => submission.status === "passed").length;
    const queryCount = submissions.filter((submission) => submission.queryPending).length;
    const attemptedCount = submissions.filter((submission) => submission.status !== "passed").length;

    res.json({
      student: {
        id: student._id,
        name: student.name,
        email: student.email,
        isActive: student.isActive,
        createdAt: student.createdAt,
        updatedAt: student.updatedAt,
        department: student.department,
        year: student.year,
        semester: student.semester
      },
      summary: {
        totalTeacherProblems: teacherProblems.length,
        totalSubmissions: submissions.length,
        solvedCount,
        attemptedCount,
        queryCount
      },
      submissions: submissions.map((submission) => ({
        id: submission._id,
        status: submission.status,
        score: submission.score || 0,
        passedCount: submission.passedCount || 0,
        totalCount: submission.totalCount || 0,
        queryPending: Boolean(submission.queryPending),
        queryStatus: submission.queryStatus || "none",
        teacherAnsweredAt: submission.teacherAnsweredAt || null,
        updatedAt: submission.updatedAt,
        createdAt: submission.createdAt,
        problem: submission.problem
          ? {
              id: submission.problem._id,
              title: submission.problem.title,
              subject: submission.problem.subject,
              department: submission.problem.department,
              difficulty: submission.problem.difficulty,
              year: submission.problem.year,
              semester: submission.problem.semester
            }
          : null
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/teacher/students/:id/status - toggle student active status
router.put("/students/:id/status", protect, teacher, async (req, res) => {
  try {
    const { audienceConditions } = await getTeacherAudience(req);
    const student = await User.findById(req.params.id);
    if (!student || student.role !== "student" || !isStudentInAudience(student, audienceConditions)) {
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
    const { teacherProblems, audienceConditions } = await getTeacherAudience(req);
    const problemIds = teacherProblems.map(p => p._id);

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
    let recentQuerySubmissions = [];
    let pendingQueries = 0;

    if (problemIds.length > 0) {
      const [submissionCount, avgAgg, recentSubmissions, pendingQueryCount, recentQueries] = await Promise.all([
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
        Submission.countDocuments({
          problem: { $in: problemIds },
          queryStatus: { $in: ["open", "revised_by_student"] }
        }),
        Submission.find({
          problem: { $in: problemIds },
          queryStatus: { $in: ["open", "revised_by_student"] }
        })
          .sort({ updatedAt: -1 })
          .limit(3)
          .populate("student", "name")
          .populate("problem", "title"),
      ]);
      totalSubmissions = submissionCount;
      averageScore = Math.round(avgAgg[0]?.avgScore || 0);
      recentPassedSubmissions = recentSubmissions;
      pendingQueries = pendingQueryCount;
      recentQuerySubmissions = recentQueries;
    }

    res.json({
      totalStudents,
      activeStudents,
      inactiveStudents: totalStudents - activeStudents,
      totalProblems: teacherProblems.length,
      totalSubmissions,
      pendingQueries,
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
        ...recentQuerySubmissions.map((submission) => ({
          type: "query",
          message: `${submission.student?.name || "A student"} requested review on "${submission.problem?.title || "a problem"}"`,
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
      .populate("problem", "title subject department year semester")
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
      const subject = formatSubjectAudienceLabel({
        subject: submission.problem?.subject,
        department: submission.problem?.department,
        year: submission.problem?.year,
        semester: submission.problem?.semester
      });
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
