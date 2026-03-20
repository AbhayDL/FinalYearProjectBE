const express = require("express");
const { protect, student, teacher } = require("../middleware/auth");
const {
  submitSolution,
  getStudentSubmissions,
  getProblemSubmissionSummary,
  getSubjectCompletionSummary
} = require("../controllers/submissionController");

const router = express.Router();

// Student submit: run hidden testcases and store submission
router.post("/submit", protect, student, submitSolution);
router.get("/me", protect, student, getStudentSubmissions);

// Teacher view: who passed a specific problem
router.get("/teacher/problem/:problemId/summary", protect, teacher, getProblemSubmissionSummary);
// Teacher view: subject-wise completion
router.get("/teacher/subject/:subject/summary", protect, teacher, getSubjectCompletionSummary);

module.exports = router;
