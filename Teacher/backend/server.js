const express = require("express");
const cors = require("cors");
require("dotenv").config();

const connectDB = require("./config/db");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connect
connectDB();

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/teacher", require("./routes/teacher"));
app.use("/api/problems", require("./routes/problemRoutes"));
app.use("/api/subjects", require("./routes/subjectRoutes"));
app.use("/api/submissions", require("./routes/submissionRoutes"));
app.use("/api/execute", require("./routes/executeRoutes"));
app.use("/api/languages", require("./routes/languages"));

app.get("/", (req, res) => {
  res.json({ message: "CodeAssPlat shared backend running" });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Shared backend running on port ${PORT}`);
});
