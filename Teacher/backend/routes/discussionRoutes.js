const express = require("express");
const { protect, teacher, student } = require("../middleware/auth");
const Discussion = require("../models/Discussion");
const Problem = require("../models/Problem");
const Subject = require("../models/Subject");

const router = express.Router();

function normalizeAcademicValue(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

async function getTeacherProblemAccess(problemId, user) {
  const problem = await Problem.findById(problemId).select("title subject createdBy");
  if (!problem) {
    return { error: { status: 404, message: "Problem not found" } };
  }

  if (problem.createdBy !== user.email) {
    return { error: { status: 403, message: "Not allowed to access this problem" } };
  }

  const assignedSubject = await Subject.findOne({
    name: problem.subject,
    assignedTeacher: user._id
  }).select("_id");

  if (!assignedSubject) {
    return { error: { status: 403, message: "Not allowed to access this subject" } };
  }

  return { problem };
}

async function getStudentProblemAccess(problemId, user) {
  const problem = await Problem.findById(problemId).select("title subject year semester createdBy");
  if (!problem) {
    return { error: { status: 404, message: "Problem not found" } };
  }

  if (
    problem.year &&
    user.year &&
    normalizeAcademicValue(problem.year) !== normalizeAcademicValue(user.year)
  ) {
    return { error: { status: 403, message: "Problem not available for your year" } };
  }

  if (
    problem.semester &&
    user.semester &&
    normalizeAcademicValue(problem.semester) !== normalizeAcademicValue(user.semester)
  ) {
    return { error: { status: 403, message: "Problem not available for your semester" } };
  }

  const teacherUser = await Subject.findOne({ name: problem.subject })
    .populate("assignedTeacher", "name email role isActive")
    .select("assignedTeacher");

  const assignedTeacher = teacherUser?.assignedTeacher;
  if (!assignedTeacher || assignedTeacher.role !== "teacher" || assignedTeacher.isActive === false) {
    return { error: { status: 404, message: "Assigned teacher not found for this problem" } };
  }

  return { problem, assignedTeacher };
}

function mapDiscussion(discussion) {
  return {
    id: discussion._id,
    question: discussion.question,
    answer: discussion.answer || "",
    status: discussion.status,
    createdAt: discussion.createdAt,
    updatedAt: discussion.updatedAt,
    problem: discussion.problem
      ? {
          id: discussion.problem._id,
          title: discussion.problem.title,
          subject: discussion.problem.subject
        }
      : null,
    student: discussion.student
      ? {
          id: discussion.student._id,
          name: discussion.student.name,
          email: discussion.student.email
        }
      : null,
    teacher: discussion.teacher
      ? {
          id: discussion.teacher._id,
          name: discussion.teacher.name,
          email: discussion.teacher.email
        }
      : null
  };
}

router.get("/student/problem/:problemId", protect, student, async (req, res) => {
  try {
    const access = await getStudentProblemAccess(req.params.problemId, req.user);
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message });
    }

    const discussions = await Discussion.find({
      problem: req.params.problemId,
      student: req.user._id
    })
      .populate("teacher", "name email")
      .sort({ createdAt: -1 });

    res.json({
      problem: {
        id: access.problem._id,
        title: access.problem.title,
        subject: access.problem.subject
      },
      discussions: discussions.map(mapDiscussion)
    });
  } catch (error) {
    console.error("Load student discussions failed:", error.message);
    res.status(500).json({ message: "Failed to load discussion thread" });
  }
});

router.post("/student/problem/:problemId", protect, student, async (req, res) => {
  try {
    const access = await getStudentProblemAccess(req.params.problemId, req.user);
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message });
    }

    const question = String(req.body.question || "").trim();
    if (!question) {
      return res.status(400).json({ message: "Question is required" });
    }

    const discussion = await Discussion.create({
      problem: access.problem._id,
      student: req.user._id,
      teacher: access.assignedTeacher._id,
      question,
      status: "open"
    });

    await discussion.populate("teacher", "name email");

    res.status(201).json({
      message: "Question sent to teacher",
      discussion: mapDiscussion(discussion)
    });
  } catch (error) {
    console.error("Create student discussion failed:", error.message);
    res.status(500).json({ message: "Failed to send question" });
  }
});

router.get("/teacher/problem/:problemId", protect, teacher, async (req, res) => {
  try {
    const access = await getTeacherProblemAccess(req.params.problemId, req.user);
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message });
    }

    const discussions = await Discussion.find({ problem: req.params.problemId })
      .populate("problem", "title subject")
      .populate("student", "name email")
      .populate("teacher", "name email")
      .sort({ updatedAt: -1, createdAt: -1 });

    res.json({
      problem: {
        id: access.problem._id,
        title: access.problem.title,
        subject: access.problem.subject
      },
      discussions: discussions.map(mapDiscussion)
    });
  } catch (error) {
    console.error("Load teacher discussions failed:", error.message);
    res.status(500).json({ message: "Failed to load discussion thread" });
  }
});

router.post("/teacher/:discussionId/reply", protect, teacher, async (req, res) => {
  try {
    const answer = String(req.body.answer || "").trim();
    if (!answer) {
      return res.status(400).json({ message: "Answer is required" });
    }

    const discussion = await Discussion.findById(req.params.discussionId)
      .populate("problem", "title subject createdBy")
      .populate("student", "name email")
      .populate("teacher", "name email");

    if (!discussion) {
      return res.status(404).json({ message: "Discussion not found" });
    }

    if (discussion.problem?.createdBy !== req.user.email || String(discussion.teacher?._id) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not allowed to reply to this discussion" });
    }

    discussion.answer = answer;
    discussion.status = "answered";
    await discussion.save();

    res.json({
      message: "Reply sent to student",
      discussion: mapDiscussion(discussion)
    });
  } catch (error) {
    console.error("Reply discussion failed:", error.message);
    res.status(500).json({ message: "Failed to send reply" });
  }
});

module.exports = router;
