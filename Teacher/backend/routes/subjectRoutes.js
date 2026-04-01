const express = require("express");
const Subject = require("../models/Subject");
const { attachUserIfPresent } = require("../middleware/auth");

const router = express.Router();

// Public: list subjects (optionally filtered by year/semester)
router.get("/", attachUserIfPresent, async (req, res) => {
  try {
    const filter = {};
    if (req.user?.role === "student") {
      if (req.user.department) filter.department = req.user.department;
      if (req.user.year) filter.year = req.user.year;
      if (req.user.semester) filter.semester = req.user.semester;
    } else {
      if (req.query.department) filter.department = req.query.department;
      if (req.query.year) filter.year = req.query.year;
      if (req.query.semester) filter.semester = req.query.semester;
    }

    const subjects = await Subject.find(filter)
      .select("name code department year semester")
      .sort({ name: 1 });
    res.json(subjects);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
