const express = require("express");
const { SUPPORTED_LANGUAGES } = require("../services/executor");

const router = express.Router();

router.get("/", (req, res) => {
  res.json(SUPPORTED_LANGUAGES);
});

module.exports = router;
