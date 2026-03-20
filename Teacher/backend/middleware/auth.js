const jwt = require("jsonwebtoken");
const User = require("../models/User");

const getTokenFromRequest = (req) => {
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    return req.headers.authorization.split(" ")[1];
  }
  return null;
};

const protect = async (req, res, next) => {
  const token = getTokenFromRequest(req);
  if (!token) return res.status(401).json({ message: "Not authorized, no token" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
    req.user = await User.findById(decoded.id).select("-password");
    return next();
  } catch (err) {
    console.error("JWT verify failed:", err.message);
    return res.status(401).json({ message: "Not authorized, token failed" });
  }
};

const attachUserIfPresent = async (req, res, next) => {
  const token = getTokenFromRequest(req);
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
    req.user = await User.findById(decoded.id).select("-password");
  } catch (err) {
    req.user = null;
  }

  return next();
};

const admin = (req, res, next) => {
  if (req.user && req.user.role === "admin" && req.user.isActive !== false) {
    return next();
  }
  return res.status(403).json({ message: "Admin access required" });
};

const teacher = (req, res, next) => {
  if (req.user && req.user.role === "teacher" && req.user.isActive !== false) {
    return next();
  }
  return res.status(403).json({ message: "Teacher access required" });
};

const student = (req, res, next) => {
  if (req.user && req.user.role === "student" && req.user.isActive !== false) {
    return next();
  }
  return res.status(403).json({ message: "Student access required" });
};

module.exports = { protect, attachUserIfPresent, admin, teacher, student };
