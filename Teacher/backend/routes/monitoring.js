const express = require("express");
const mongoose = require("mongoose");
const { protect, teacher, student } = require("../middleware/auth");
const AntiCheatEvent = require("../models/AntiCheatEvent");
const Subject = require("../models/Subject");
const User = require("../models/User");

const router = express.Router();

const RISK_WEIGHTS = {
  session_started: 0,
  session_ended: 0,
  tab_hidden: 1,
  tab_visible: 0,
  fullscreen_exit: 3,
  fullscreen_enter: 0,
  copy_attempt: 3,
  paste_attempt: 2,
  idle_warning: 1,
  submission_made: 0,
  run_code: 0,
  save_code: 0,
  snapshot_captured: 0,
  page_blur: 1,
  page_focus: 0,
};

function normalizeAcademicValue(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function buildAudienceConditions(items) {
  const seen = new Set();
  const conditions = [];

  for (const item of items || []) {
    const department = (item.department || "").trim();
    const year = (item.year || "").trim();
    const semester = (item.semester || "").trim();

    if (!department && !year && !semester) continue;

    const key = `${department}::${year}::${semester}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const condition = {};
    if (department) condition.department = department;
    if (year) condition.year = year;
    if (semester) condition.semester = semester;
    conditions.push(condition);
  }

  return conditions;
}

function isStudentInAudience(studentRecord, audienceConditions) {
  return (audienceConditions || []).some((condition) => {
    const departmentOk = !condition.department || normalizeAcademicValue(condition.department) === normalizeAcademicValue(studentRecord.department);
    const yearOk = !condition.year || normalizeAcademicValue(condition.year) === normalizeAcademicValue(studentRecord.year);
    const semesterOk = !condition.semester || normalizeAcademicValue(condition.semester) === normalizeAcademicValue(studentRecord.semester);
    return departmentOk && yearOk && semesterOk;
  });
}

async function getTeacherAudience(req) {
  const assignedSubjects = await Subject.find({ assignedTeacher: req.user._id })
    .select("department year semester")
    .lean();

  return {
    audienceConditions: buildAudienceConditions(assignedSubjects),
  };
}

function computeRiskWeight(eventType, metadata = {}) {
  let weight = RISK_WEIGHTS[eventType] || 0;
  if (eventType === "tab_hidden" && Number(metadata.durationMs || 0) >= 60000) {
    weight += 1;
  }
  return weight;
}

function computeRiskLabel(score, suspiciousCount) {
  if (score >= 6 || suspiciousCount >= 5) return "high";
  if (score >= 3 || suspiciousCount >= 2) return "watch";
  return "low";
}

function summarizeSession(events = []) {
  const sorted = [...events].sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));
  const firstEvent = sorted[0] || {};
  const lastEvent = sorted[sorted.length - 1] || {};
  const suspiciousEvents = sorted.filter((event) => Number(event.riskWeight || 0) > 0);
  const riskScore = suspiciousEvents.reduce((sum, event) => sum + Number(event.riskWeight || 0), 0);
  const countsByType = sorted.reduce((acc, event) => {
    acc[event.eventType] = (acc[event.eventType] || 0) + 1;
    return acc;
  }, {});

  const hasEnded = sorted.some((event) => event.eventType === "session_ended");
  const lastSeen = lastEvent.occurredAt ? new Date(lastEvent.occurredAt) : null;
  const isActive = !hasEnded && lastSeen && (Date.now() - lastSeen.getTime() <= 15 * 60 * 1000);
  const studentRecord = lastEvent.student || firstEvent.student || {};
  const problemRecord = [...sorted].reverse().find((event) => event.problem)?.problem || null;

  return {
    sessionId: firstEvent.sessionId,
    student: studentRecord
      ? {
          id: String(studentRecord._id || ""),
          name: studentRecord.name || "Unknown",
          email: studentRecord.email || "",
          department: studentRecord.department || "",
          year: studentRecord.year || "",
          semester: studentRecord.semester || "",
          isActive: studentRecord.isActive !== false,
        }
      : null,
    problem: problemRecord
      ? {
          id: String(problemRecord._id || ""),
          title: problemRecord.title || "Unknown problem",
          subject: problemRecord.subject || "",
          year: problemRecord.year || "",
          semester: problemRecord.semester || "",
        }
      : null,
    startedAt: firstEvent.occurredAt || null,
    lastEventAt: lastEvent.occurredAt || null,
    latestEventType: lastEvent.eventType || "",
    eventCount: sorted.length,
    suspiciousEventCount: suspiciousEvents.length,
    riskScore,
    riskLabel: computeRiskLabel(riskScore, suspiciousEvents.length),
    status: isActive ? "active" : "inactive",
    countsByType,
  };
}

router.post("/events", protect, student, async (req, res) => {
  try {
    const { sessionId, problemId, subjectId, eventType, page, metadata, occurredAt } = req.body || {};

    if (!sessionId || !String(sessionId).trim()) {
      return res.status(400).json({ message: "sessionId is required" });
    }
    if (!eventType || !Object.prototype.hasOwnProperty.call(RISK_WEIGHTS, eventType)) {
      return res.status(400).json({ message: "Valid eventType is required" });
    }

    const payload = {
      student: req.user._id,
      sessionId: String(sessionId).trim(),
      eventType,
      page: String(page || "").trim(),
      metadata: metadata && typeof metadata === "object" ? metadata : {},
      riskWeight: computeRiskWeight(eventType, metadata),
      occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
    };

    if (problemId && mongoose.Types.ObjectId.isValid(problemId)) {
      payload.problem = problemId;
    }
    if (subjectId && mongoose.Types.ObjectId.isValid(subjectId)) {
      payload.subject = subjectId;
    }

    const created = await AntiCheatEvent.create(payload);
    return res.status(201).json({
      message: "Monitoring event recorded",
      eventId: created._id,
    });
  } catch (error) {
    console.error("Monitoring event create failed:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/teacher/sessions", protect, teacher, async (req, res) => {
  try {
    const { audienceConditions } = await getTeacherAudience(req);
    if (!audienceConditions.length) {
      return res.json({
        summary: {
          totalSessions: 0,
          activeSessions: 0,
          flaggedSessions: 0,
          highRiskSessions: 0,
          averageRiskScore: 0,
        },
        sessions: [],
      });
    }

    const students = await User.find({ role: "student", $or: audienceConditions })
      .select("name email department year semester isActive")
      .lean();
    const studentIds = students.map((entry) => entry._id);

    const events = await AntiCheatEvent.find({ student: { $in: studentIds } })
      .populate("student", "name email department year semester isActive")
      .populate("problem", "title subject year semester")
      .sort({ occurredAt: -1 })
      .limit(3000)
      .lean();

    const grouped = new Map();
    events.forEach((event) => {
      if (!grouped.has(event.sessionId)) grouped.set(event.sessionId, []);
      grouped.get(event.sessionId).push(event);
    });

    const sessions = Array.from(grouped.values())
      .map((group) => summarizeSession(group))
      .sort((a, b) => new Date(b.lastEventAt || 0) - new Date(a.lastEventAt || 0));

    const flaggedSessions = sessions.filter((session) => session.riskLabel !== "low").length;
    const highRiskSessions = sessions.filter((session) => session.riskLabel === "high").length;
    const activeSessions = sessions.filter((session) => session.status === "active").length;
    const totalScore = sessions.reduce((sum, session) => sum + session.riskScore, 0);

    return res.json({
      summary: {
        totalSessions: sessions.length,
        activeSessions,
        flaggedSessions,
        highRiskSessions,
        averageRiskScore: sessions.length ? Number((totalScore / sessions.length).toFixed(1)) : 0,
      },
      sessions,
    });
  } catch (error) {
    console.error("Monitoring sessions load failed:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/teacher/sessions/:sessionId", protect, teacher, async (req, res) => {
  try {
    const { audienceConditions } = await getTeacherAudience(req);
    if (!audienceConditions.length) {
      return res.status(404).json({ message: "No monitoring sessions available for this teacher" });
    }

    const events = await AntiCheatEvent.find({ sessionId: req.params.sessionId })
      .populate("student", "name email department year semester isActive")
      .populate("problem", "title subject year semester")
      .sort({ occurredAt: 1 })
      .lean();

    if (!events.length) {
      return res.status(404).json({ message: "Monitoring session not found" });
    }

    const studentRecord = events[0].student;
    if (!studentRecord || !isStudentInAudience(studentRecord, audienceConditions)) {
      return res.status(404).json({ message: "Monitoring session not found" });
    }

    const session = summarizeSession(events);
    return res.json({
      session,
      timeline: events.map((event) => ({
        id: String(event._id),
        eventType: event.eventType,
        page: event.page || "",
        riskWeight: Number(event.riskWeight || 0),
        occurredAt: event.occurredAt,
        metadata: event.metadata || {},
      })),
    });
  } catch (error) {
    console.error("Monitoring session detail failed:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
