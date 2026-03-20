const express = require("express");
const { executeCode } = require("../services/executor");

const router = express.Router();

router.post("/", async (req, res) => {
  const { source_code, language_id, stdin } = req.body || {};
  const result = await executeCode(source_code || "", Number(language_id), stdin || "");
  res.json(result);
});

module.exports = router;
