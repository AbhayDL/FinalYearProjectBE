const express = require("express");
const Subject = require("../models/Subject");

const router = express.Router();

// Public: list subjects (optionally filtered by year/semester)
router.get("/", async (req, res) => {
  try {
    const filter = {};
    if (req.query.year) filter.year = req.query.year;
    if (req.query.semester) filter.semester = req.query.semester;

    const subjects = await Subject.find(filter)
      .select("name code year semester")
      .sort({ name: 1 });
    res.json(subjects);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
