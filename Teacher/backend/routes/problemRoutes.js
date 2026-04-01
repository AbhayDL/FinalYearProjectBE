const express = require("express");
const router = express.Router();
const { protect, teacher, attachUserIfPresent } = require("../middleware/auth");

const {
  addProblem,
  getProblems,
  getProblemById,
  getProblemsByTeacher,
  updateProblem,
  deleteProblem
} = require("../controllers/problemController");

// Teacher upload
router.post("/add", protect, teacher, addProblem);

// Student problem list
router.get("/", attachUserIfPresent, getProblems);

// (Optional) backward compatibility
router.get("/all", attachUserIfPresent, getProblems);

// Teacher - list problems created by teacher
router.get("/teacher", protect, teacher, getProblemsByTeacher);
router.get("/teacher/:email", protect, teacher, getProblemsByTeacher);

// Student IDE - fetch single problem
router.get("/:id", attachUserIfPresent, getProblemById);

// Teacher - update and delete
router.put("/:id", protect, teacher, updateProblem);
router.delete("/:id", protect, teacher, deleteProblem);

module.exports = router;
