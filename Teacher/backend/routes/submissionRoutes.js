const express = require("express");
const { protect, student, teacher } = require("../middleware/auth");
const {
  saveSolution,
  submitSolution,
  getStudentSubmissions,
  getStudentSubmissionForProblem,
  getProblemSubmissionSummary,
  getSubjectCompletionSummary,
  getLatestSubmissionForTeacher,
  getSubmissionByIdForTeacher,
  addTeacherComment,
  updateSubmissionCodeByTeacher
} = require("../controllers/submissionController");

const router = express.Router();

// Student submit: run hidden testcases and store submission
router.post("/save", protect, student, saveSolution);
router.post("/submit", protect, student, submitSolution);
router.get("/me", protect, student, getStudentSubmissions);
router.get("/me/problem/:problemId", protect, student, getStudentSubmissionForProblem);

// Teacher view: who passed a specific problem
router.get("/teacher/problem/:problemId/summary", protect, teacher, getProblemSubmissionSummary);
router.get("/teacher/problem/:problemId/student/:studentId/latest", protect, teacher, getLatestSubmissionForTeacher);
router.get("/teacher/submission/:submissionId/latest", protect, teacher, getSubmissionByIdForTeacher);
router.post("/teacher/:submissionId/comment", protect, teacher, addTeacherComment);
router.put("/teacher/:submissionId/code", protect, teacher, updateSubmissionCodeByTeacher);
// Teacher view: subject-wise completion
router.get("/teacher/subject/:subject/summary", protect, teacher, getSubjectCompletionSummary);
router.get("/teacher/subject-id/:subjectId/summary", protect, teacher, getSubjectCompletionSummary);

module.exports = router;
