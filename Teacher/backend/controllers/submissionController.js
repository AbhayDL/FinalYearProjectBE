const Problem = require("../models/Problem");
const Submission = require("../models/Submission");
const Subject = require("../models/Subject");
const User = require("../models/User");
const { executeCode } = require("../services/executor");

function buildStudentAccessFilter(access = {}) {
  const filter = { role: "student" };

  if (access.department) {
    filter.department = access.department;
  }

  if (access.year) {
    filter.year = access.year;
  }

  if (access.semester) {
    filter.semester = access.semester;
  }

  return filter;
}

function normalizeAcademicValue(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function mapSubmissionComments(comments = []) {
  return comments.map((comment) => ({
    id: comment._id,
    authorRole: comment.authorRole,
    text: comment.text,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    author: comment.author
      ? {
          id: comment.author._id,
          name: comment.author.name,
          email: comment.author.email
        }
      : null
  }));
}

function normalizeGuiReviewPayload(guiEvidence = {}, previousGuiReview = {}) {
  const screenshotDataUrl = String(guiEvidence?.screenshotDataUrl || "").trim();
  const htmlPreview = String(guiEvidence?.htmlPreview || "").trim();
  const notes = String(guiEvidence?.notes || "").trim();
  const hasEvidence = Boolean(guiEvidence?.hasEvidence) || Boolean(screenshotDataUrl) || Boolean(htmlPreview) || Boolean(notes);

  return {
    hasEvidence,
    screenshotDataUrl,
    htmlPreview,
    notes,
    teacherStatus: hasEvidence ? "pending" : "not_required",
    teacherNote: hasEvidence ? "" : previousGuiReview?.teacherNote || "",
    teacherReviewedAt: hasEvidence ? null : previousGuiReview?.teacherReviewedAt || null
  };
}

function mapGuiReview(guiReview = {}) {
  return {
    hasEvidence: Boolean(guiReview?.hasEvidence),
    screenshotDataUrl: guiReview?.screenshotDataUrl || "",
    htmlPreview: guiReview?.htmlPreview || "",
    notes: guiReview?.notes || "",
    teacherStatus: guiReview?.teacherStatus || "not_required",
    teacherNote: guiReview?.teacherNote || "",
    teacherReviewedAt: guiReview?.teacherReviewedAt || null
  };
}

function getDisplaySourceCode(submission) {
  if (submission.teacherReviewedCode) return submission.teacherReviewedCode;
  if (submission.studentSourceCode) return submission.studentSourceCode;
  return submission.sourceCode || "";
}

function getNextQueryStatus(previousSubmission, hasQuery) {
  if (!hasQuery) return "none";
  if (previousSubmission?.queryStatus === "answered" || previousSubmission?.teacherAnsweredAt) {
    return "revised_by_student";
  }
  return "open";
}

function isGuiReviewProblem(problem = {}) {
  return Boolean(problem?.guiReviewRequired) || String(problem?.language || "") === "1001";
}

async function verifyTeacherProblemAccess(problemId, teacherUser) {
  const problem = await Problem.findById(problemId).select("title subject subjectId department year semester createdBy");
  if (!problem) {
    return { error: { status: 404, message: "Problem not found" } };
  }

  if (problem.createdBy !== teacherUser.email) {
    return { error: { status: 403, message: "Not allowed to assess this problem" } };
  }

  const assignedSubject = await Subject.findOne({
    ...(problem.subjectId ? { _id: problem.subjectId } : { name: problem.subject }),
    assignedTeacher: teacherUser._id
  }).select("_id department year semester");

  if (!assignedSubject) {
    return { error: { status: 403, message: "Not allowed to assess this subject" } };
  }

  return { problem, assignedSubject };
}

function ensureStudentMatchesAccess(student, access = {}) {
  if (!student) {
    return { ok: false, status: 404, message: "Student not found" };
  }

  if (student.role !== "student") {
    return { ok: false, status: 404, message: "Student not found" };
  }

  if (access.year && normalizeAcademicValue(student.year) !== normalizeAcademicValue(access.year)) {
    return { ok: false, status: 403, message: "Student is outside this teacher's assigned year" };
  }

  if (access.semester && normalizeAcademicValue(student.semester) !== normalizeAcademicValue(access.semester)) {
    return { ok: false, status: 403, message: "Student is outside this teacher's assigned semester" };
  }

  if (access.department && normalizeAcademicValue(student.department) !== normalizeAcademicValue(access.department)) {
    return { ok: false, status: 403, message: "Student is outside this teacher's assigned department" };
  }

  return { ok: true };
}

// Student submit: run hidden test cases and store submission
exports.saveSolution = async (req, res) => {
  try {
    const { problemId, source_code, language_id, hasQuery, guiEvidence } = req.body;

    if (!problemId || !source_code || !language_id) {
      return res.status(400).json({
        message: "problemId, source_code, and language_id are required"
      });
    }

    const parsedLanguageId = Number(language_id);
    if (!Number.isFinite(parsedLanguageId)) {
      return res.status(400).json({ message: "language_id must be a number" });
    }

    const problem = await Problem.findById(problemId).lean();
    if (!problem) {
      return res.status(404).json({ message: "Problem not found" });
    }

    const existingSubmission = await Submission.findOne({
      student: req.user._id,
      problem: problem._id
    }).select("status passedCount totalCount score teacherAnsweredAt queryStatus teacherReviewedCode guiReview");

    const nextQueryStatus = getNextQueryStatus(existingSubmission, Boolean(hasQuery));
    const nextGuiReview = normalizeGuiReviewPayload(guiEvidence, existingSubmission?.guiReview || {});

    const update = {
      $set: {
        sourceCode: source_code,
        studentSourceCode: source_code,
        teacherReviewedCode: existingSubmission?.teacherReviewedCode || "",
        languageId: parsedLanguageId,
        status: existingSubmission?.status || "saved",
        passedCount: existingSubmission?.passedCount || 0,
        totalCount: existingSubmission?.totalCount || 0,
        score: existingSubmission?.score || 0,
        queryPending: Boolean(hasQuery),
        queryStatus: nextQueryStatus,
        teacherAnsweredAt: hasQuery ? null : existingSubmission?.teacherAnsweredAt || null,
        lastSavedBy: "student",
        guiReview: nextGuiReview
      }
    };

    const submission = await Submission.findOneAndUpdate(
      { student: req.user._id, problem: problem._id },
      update,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({
      message: hasQuery
        ? "Code saved and marked with query for teacher review."
        : "Code saved successfully.",
      submissionId: submission._id,
      queryPending: submission.queryPending,
      queryStatus: submission.queryStatus,
      guiReview: mapGuiReview(submission.guiReview)
    });
  } catch (error) {
    console.error("Save failed:", error.message);
    res.status(500).json({ message: "Failed to save code" });
  }
};

exports.submitSolution = async (req, res) => {
  try {
    const { problemId, source_code, language_id, guiEvidence } = req.body;

    if (!problemId || !source_code || !language_id) {
      return res.status(400).json({
        message: "problemId, source_code, and language_id are required"
      });
    }

    const parsedLanguageId = Number(language_id);
    if (!Number.isFinite(parsedLanguageId)) {
      return res.status(400).json({ message: "language_id must be a number" });
    }

    const problem = await Problem.findById(problemId).lean();
    if (!problem) {
      return res.status(404).json({ message: "Problem not found" });
    }

    const guiReviewMode = isGuiReviewProblem(problem);
    const nextGuiReview = guiReviewMode
      ? normalizeGuiReviewPayload(guiEvidence, {})
      : {
          hasEvidence: false,
          screenshotDataUrl: "",
          htmlPreview: "",
          notes: "",
          teacherStatus: "not_required",
          teacherNote: "",
          teacherReviewedAt: null
        };

    if (guiReviewMode) {
      const now = new Date();
      const submission = await Submission.findOneAndUpdate(
        { student: req.user._id, problem: problem._id },
        {
          $set: {
            sourceCode: source_code,
            studentSourceCode: source_code,
            teacherReviewedCode: "",
            languageId: parsedLanguageId,
            status: "saved",
            passedCount: 0,
            totalCount: 0,
            score: 0,
            queryPending: false,
            queryStatus: "none",
            teacherAnsweredAt: null,
            lastSavedBy: "student",
            guiReview: {
              ...nextGuiReview,
              teacherStatus: "pending",
              teacherNote: "",
              teacherReviewedAt: null
            },
            updatedAt: now
          },
          $setOnInsert: { createdAt: now }
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      return res.json({
        message: "GUI-based submission sent directly to teacher review.",
        status: "pending_teacher_review",
        passedCount: 0,
        totalCount: 0,
        score: 0,
        submissionId: submission._id,
        guiReview: mapGuiReview(submission.guiReview)
      });
    }

    const hiddenTestCases = (problem.testCases || []).filter(
      tc => tc.visibility === "hidden"
    );

    let passedCount = 0;
    const totalCount = hiddenTestCases.length;
    for (let i = 0; i < hiddenTestCases.length; i += 1) {
      const testCase = hiddenTestCases[i];
      try {
        const data = await executeCode(source_code, parsedLanguageId, testCase.input);

        const output = (data.stdout || "").trim();
        const expected = (testCase.output || "").trim();
        const passed = !data.stderr && output === expected;
        if (passed) passedCount += 1;

      } catch (err) {
        // Count as failed if any test execution errors out
      }
    }

    const status = passedCount === totalCount ? "passed" : "failed";
    const score = totalCount === 0 ? 100 : Math.round((passedCount / totalCount) * 100);

    const now = new Date();
    const submission = await Submission.findOneAndUpdate(
      { student: req.user._id, problem: problem._id },
      {
        $set: {
          sourceCode: source_code,
          studentSourceCode: source_code,
          teacherReviewedCode: "",
          languageId: parsedLanguageId,
          status,
          passedCount,
          totalCount,
          score,
          queryPending: false,
          queryStatus: "none",
          teacherAnsweredAt: null,
          lastSavedBy: "student",
          guiReview: {
            hasEvidence: false,
            screenshotDataUrl: "",
            htmlPreview: "",
            notes: "",
            teacherStatus: "not_required",
            teacherNote: "",
            teacherReviewedAt: null
          },
          updatedAt: now
        },
        $setOnInsert: { createdAt: now }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({
      message:
        status === "passed"
          ? "All hidden test cases passed."
          : "Hidden test cases failed.",
      status,
      passedCount,
      totalCount,
      score,
      submissionId: submission._id
    });
  } catch (error) {
    console.error("Submit failed:", error.message);
    res.status(500).json({ message: "Submission failed" });
  }
};

// Teacher summary: who passed a specific problem
exports.getProblemSubmissionSummary = async (req, res) => {
  try {
    const { problemId } = req.params;
    const access = await verifyTeacherProblemAccess(problemId, req.user);
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message });
    }
    const { problem, assignedSubject } = access;

    const accessFilter = buildStudentAccessFilter({
      department: problem.department || assignedSubject.department,
      year: problem.year || assignedSubject.year,
      semester: problem.semester || assignedSubject.semester
    });

    const students = await User.find(accessFilter)
      .select("name email isActive year semester")
      .sort({ name: 1 });

    const submissions = await Submission.find({ problem: problemId })
      .sort({ updatedAt: -1 })
      .select("student status score queryPending queryStatus teacherAnsweredAt createdAt updatedAt guiReview");

    const latestByStudent = new Map();
    for (const sub of submissions) {
      const key = sub.student.toString();
      if (!latestByStudent.has(key)) latestByStudent.set(key, sub);
    }

    const summary = students.map(student => {
      const latest = latestByStudent.get(student._id.toString());
      return {
        id: student._id,
        submissionId: latest ? latest._id : null,
        name: student.name,
        email: student.email,
        isActive: student.isActive,
        hasSubmitted: Boolean(latest),
        queryPending: latest ? Boolean(latest.queryPending) : false,
        queryStatus: latest ? latest.queryStatus : "none",
        hasGuiEvidence: latest ? Boolean(latest.guiReview?.hasEvidence) : false,
        guiReviewStatus: latest ? latest.guiReview?.teacherStatus || "not_required" : "not_required",
        teacherAnsweredAt: latest ? latest.teacherAnsweredAt : null,
        hasPassed: latest ? latest.status === "passed" : false,
        submissionStatus: latest ? latest.status : "pending",
        score: latest ? latest.score : 0,
        submittedAt: latest ? latest.updatedAt || latest.createdAt : null
      };
    });

    const passedCount = summary.filter(s => s.hasPassed).length;

    res.json({
      problem: { id: problem._id, title: problem.title },
      totalStudents: summary.length,
      passedCount,
      students: summary
    });
  } catch (error) {
    console.error("Summary failed:", error.message);
    res.status(500).json({ message: "Failed to load submission summary" });
  }
};

exports.getSubmissionByIdForTeacher = async (req, res) => {
  try {
    const { submissionId } = req.params;

    const submission = await Submission.findById(submissionId)
      .populate("problem", "title subject year semester createdBy description inputFormat outputFormat language")
      .populate("student", "name email year semester isActive role")
      .populate("comments.author", "name email")
      .lean();

    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    const access = await verifyTeacherProblemAccess(submission.problem?._id, req.user);
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message });
    }

    const studentId = submission.student?._id || submission.student;
    const populatedStudent =
      submission.student && typeof submission.student === "object" && submission.student.role === "student"
        ? submission.student
        : null;

    let student = populatedStudent;
    if (!student && studentId) {
      student = await User.findOne({
        _id: studentId,
        role: "student"
      }).select("name email year semester isActive");
    }

    if (student) {
      const studentAccess = ensureStudentMatchesAccess(student, {
        department: submission.problem?.department || access.assignedSubject.department,
        year: submission.problem?.year || access.assignedSubject.year,
        semester: submission.problem?.semester || access.assignedSubject.semester
      });
      if (!studentAccess.ok) {
        return res.status(studentAccess.status).json({ message: studentAccess.message });
      }
    }

    res.json({
      problem: {
        id: submission.problem?._id,
        title: submission.problem?.title,
        subject: submission.problem?.subject,
        description: submission.problem?.description || "",
        inputFormat: submission.problem?.inputFormat || "",
        outputFormat: submission.problem?.outputFormat || "",
        language: submission.problem?.language
      },
      student: student || {
        _id: String(studentId || ""),
        name: "Unknown Student",
        email: "",
        year: "",
        semester: "",
        isActive: false
      },
      submission: {
        id: submission._id,
        sourceCode: getDisplaySourceCode(submission),
        studentSourceCode: submission.studentSourceCode || submission.sourceCode,
        teacherReviewedCode: submission.teacherReviewedCode || "",
        languageId: submission.languageId,
        status: submission.status,
        score: submission.score,
        passedCount: submission.passedCount,
        totalCount: submission.totalCount,
        queryPending: Boolean(submission.queryPending),
        queryStatus: submission.queryStatus || "none",
        teacherAnsweredAt: submission.teacherAnsweredAt,
        lastSavedBy: submission.lastSavedBy || "student",
        guiReview: mapGuiReview(submission.guiReview),
        comments: mapSubmissionComments(submission.comments),
        createdAt: submission.createdAt,
        updatedAt: submission.updatedAt
      }
    });
  } catch (error) {
    console.error("Teacher submission by id fetch failed:", error.message);
    res.status(500).json({ message: "Failed to load submission code" });
  }
};

exports.getLatestSubmissionForTeacher = async (req, res) => {
  try {
    const { problemId, studentId } = req.params;
    const access = await verifyTeacherProblemAccess(problemId, req.user);
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message });
    }

    let submission = null;
    let student = null;

    // Preferred lookup: use the actual submission document for this problem and student.
    submission = await Submission.findOne({
      problem: problemId,
      student: studentId
    })
      .sort({ updatedAt: -1 })
      .populate("student", "name email year semester isActive role")
      .populate("comments.author", "name email")
      .populate("problem", "title subject year semester createdBy description inputFormat outputFormat language")
      .lean();

    // Fallback: some deep links may pass a submission id instead of a student id.
    if (!submission) {
      submission = await Submission.findOne({
        _id: studentId,
        problem: problemId
      })
      .sort({ updatedAt: -1 })
      .populate("student", "name email year semester isActive role")
      .populate("comments.author", "name email")
      .populate("problem", "title subject year semester createdBy description inputFormat outputFormat language")
      .lean();
    }

    if (!submission) {
      const directStudent = await User.findOne({
        _id: studentId,
        role: "student"
      }).select("name email year semester isActive");

      if (!directStudent) {
        return res.status(404).json({ message: "Student not found" });
      }

      submission = await Submission.findOne({
        problem: problemId,
        student: directStudent._id
      })
        .sort({ updatedAt: -1 })
        .populate("student", "name email year semester isActive role")
        .populate("comments.author", "name email")
        .populate("problem", "title subject year semester createdBy description inputFormat outputFormat language")
        .lean();

      if (!submission) {
        return res.status(404).json({ message: "No submission found for this student and problem" });
      }
    }

    const submissionStudentId = submission.student?._id || submission.student;
    const populatedStudent =
      submission.student && typeof submission.student === "object" && submission.student.role === "student"
        ? submission.student
        : null;

    student = populatedStudent;
    if (!student && submissionStudentId) {
      student = await User.findOne({
        _id: submissionStudentId,
        role: "student"
      }).select("name email year semester isActive");
    }

    if (student) {
      const studentAccess = ensureStudentMatchesAccess(student, {
        department: access.problem.department || access.assignedSubject.department,
        year: access.problem.year || access.assignedSubject.year,
        semester: access.problem.semester || access.assignedSubject.semester
      });
      if (!studentAccess.ok) {
        return res.status(studentAccess.status).json({ message: studentAccess.message });
      }
    }

    res.json({
      problem: {
        id: submission.problem?._id || access.problem._id,
        title: submission.problem?.title || access.problem.title,
        subject: submission.problem?.subject || access.problem.subject,
        description: submission.problem?.description || "",
        inputFormat: submission.problem?.inputFormat || "",
        outputFormat: submission.problem?.outputFormat || "",
        language: submission.problem?.language
      },
      student: student || {
        _id: String(submissionStudentId || studentId || ""),
        name: "Unknown Student",
        email: "",
        year: "",
        semester: "",
        isActive: false
      },
      submission: {
        id: submission._id,
        sourceCode: getDisplaySourceCode(submission),
        studentSourceCode: submission.studentSourceCode || submission.sourceCode,
        teacherReviewedCode: submission.teacherReviewedCode || "",
        languageId: submission.languageId,
        status: submission.status,
        score: submission.score,
        passedCount: submission.passedCount,
        totalCount: submission.totalCount,
        queryPending: Boolean(submission.queryPending),
        queryStatus: submission.queryStatus || "none",
        teacherAnsweredAt: submission.teacherAnsweredAt,
        lastSavedBy: submission.lastSavedBy || "student",
        guiReview: mapGuiReview(submission.guiReview),
        comments: mapSubmissionComments(submission.comments),
        createdAt: submission.createdAt,
        updatedAt: submission.updatedAt
      }
    });
  } catch (error) {
    console.error("Teacher submission fetch failed:", error.message);
    res.status(500).json({ message: "Failed to load submission code" });
  }
};

exports.getStudentSubmissionForProblem = async (req, res) => {
  try {
    const { problemId } = req.params;
    const submission = await Submission.findOne({
      student: req.user._id,
      problem: problemId
    })
      .populate("comments.author", "name email")
      .lean();

    if (!submission) {
      return res.json({ submission: null });
    }

    res.json({
      submission: {
        id: submission._id,
        sourceCode: getDisplaySourceCode(submission),
        studentSourceCode: submission.studentSourceCode || submission.sourceCode,
        teacherReviewedCode: submission.teacherReviewedCode || "",
        languageId: submission.languageId,
        status: submission.status,
        score: submission.score,
        passedCount: submission.passedCount,
        totalCount: submission.totalCount,
        queryPending: Boolean(submission.queryPending),
        queryStatus: submission.queryStatus || "none",
        teacherAnsweredAt: submission.teacherAnsweredAt,
        lastSavedBy: submission.lastSavedBy || "student",
        guiReview: mapGuiReview(submission.guiReview),
        comments: mapSubmissionComments(submission.comments),
        createdAt: submission.createdAt,
        updatedAt: submission.updatedAt
      }
    });
  } catch (error) {
    console.error("Student submission fetch failed:", error.message);
    res.status(500).json({ message: "Failed to load saved code" });
  }
};

exports.addTeacherComment = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const commentText = String(req.body.comment || "").trim();
    if (!commentText) {
      return res.status(400).json({ message: "Comment is required" });
    }

    const submission = await Submission.findById(submissionId).populate("problem", "_id title subject year semester createdBy");
    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    const access = await verifyTeacherProblemAccess(submission.problem?._id, req.user);
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message });
    }

    submission.comments.push({
      author: req.user._id,
      authorRole: "teacher",
      text: commentText
    });
    submission.queryPending = false;
    submission.queryStatus = "answered";
    submission.teacherAnsweredAt = new Date();
    submission.lastSavedBy = "teacher";
    await submission.save();
    await submission.populate("comments.author", "name email");

    res.json({
      message: "Comment added successfully.",
      submission: {
        id: submission._id,
        queryPending: Boolean(submission.queryPending),
        comments: mapSubmissionComments(submission.comments)
      }
    });
  } catch (error) {
    console.error("Teacher comment failed:", error.message);
    res.status(500).json({ message: "Failed to add comment" });
  }
};

exports.updateSubmissionCodeByTeacher = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { sourceCode, languageId, resolveQuery, guiTeacherStatus, guiTeacherNote } = req.body;

    if (!String(sourceCode || "").trim()) {
      return res.status(400).json({ message: "sourceCode is required" });
    }

    const submission = await Submission.findById(submissionId).populate("problem", "_id title subject year semester createdBy");
    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    const access = await verifyTeacherProblemAccess(submission.problem?._id, req.user);
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message });
    }

    submission.teacherReviewedCode = sourceCode;
    submission.sourceCode = sourceCode;
    if (languageId !== undefined && languageId !== null && Number.isFinite(Number(languageId))) {
      submission.languageId = Number(languageId);
    }
    if (resolveQuery) {
      submission.queryPending = false;
      submission.queryStatus = "answered";
      submission.teacherAnsweredAt = new Date();
    }
    const allowedGuiStatuses = ["not_required", "pending", "approved", "needs_changes"];
    submission.guiReview = {
      hasEvidence: Boolean(submission.guiReview?.hasEvidence),
      screenshotDataUrl: submission.guiReview?.screenshotDataUrl || "",
      htmlPreview: submission.guiReview?.htmlPreview || "",
      notes: submission.guiReview?.notes || "",
      teacherStatus: allowedGuiStatuses.includes(guiTeacherStatus)
        ? guiTeacherStatus
        : submission.guiReview?.teacherStatus || "not_required",
      teacherNote: String(guiTeacherNote || "").trim(),
      teacherReviewedAt:
        guiTeacherStatus === "approved" || guiTeacherStatus === "needs_changes"
          ? new Date()
          : null
    };
    if (submission.guiReview.teacherStatus === "approved") {
      submission.status = "passed";
      submission.score = 100;
    } else if (submission.guiReview.teacherStatus === "needs_changes") {
      submission.status = "failed";
      submission.score = 0;
    } else if (submission.guiReview.teacherStatus === "pending" && submission.guiReview.hasEvidence) {
      submission.status = "saved";
      submission.score = 0;
    }
    submission.lastSavedBy = "teacher";

    await submission.save();

    res.json({
      message: "Submission code updated successfully.",
      submission: {
        id: submission._id,
        sourceCode: submission.sourceCode,
        studentSourceCode: submission.studentSourceCode,
        teacherReviewedCode: submission.teacherReviewedCode,
        languageId: submission.languageId,
        queryPending: Boolean(submission.queryPending),
        queryStatus: submission.queryStatus || "none",
        teacherAnsweredAt: submission.teacherAnsweredAt,
        lastSavedBy: submission.lastSavedBy || "student",
        guiReview: mapGuiReview(submission.guiReview),
        updatedAt: submission.updatedAt
      }
    });
  } catch (error) {
    console.error("Teacher submission code update failed:", error.message);
    res.status(500).json({ message: "Failed to update submission code" });
  }
};

// Teacher summary: subject-wise completion (all tasks in subject)
exports.getSubjectCompletionSummary = async (req, res) => {
  try {
    const subjectId = req.params.subjectId || req.query.subjectId;
    const subjectName = req.params.subject || req.query.subject;

    if (!subjectId && !subjectName) {
      return res.status(400).json({ message: "Subject is required" });
    }

    const assignedSubject = await Subject.findOne({
      ...(subjectId ? { _id: subjectId } : { name: subjectName }),
      assignedTeacher: req.user._id
    }).select("_id name department year semester");

    if (!assignedSubject) {
      return res.status(403).json({ message: "Not allowed to assess this subject" });
    }

    const problems = await Problem.find({
      $or: [
        { subjectId: assignedSubject._id },
        {
          subject: assignedSubject.name,
          department: assignedSubject.department || "",
          year: assignedSubject.year || "",
          semester: assignedSubject.semester || ""
        }
      ],
      createdBy: req.user.email
    }).select("_id title");

    if (!problems || problems.length === 0) {
      return res.json({
        subject,
        problems: [],
        totalStudents: 0,
        students: []
      });
    }

    const problemIds = problems.map(p => p._id);
    const students = await User.find(
      buildStudentAccessFilter({
        department: assignedSubject.department,
        year: assignedSubject.year,
        semester: assignedSubject.semester
      })
    )
      .select("name email isActive year semester")
      .sort({ name: 1 });

    const submissions = await Submission.find({
      problem: { $in: problemIds }
    }).select("student problem status score updatedAt guiReview");

    const byStudent = new Map();
    for (const sub of submissions) {
      const studentId = sub.student.toString();
      if (!byStudent.has(studentId)) byStudent.set(studentId, new Map());
      byStudent.get(studentId).set(sub.problem.toString(), sub);
    }

    const studentsSummary = students.map(student => {
      const taskMap = byStudent.get(student._id.toString()) || new Map();
      const tasks = {};
      let solvedCount = 0;

      for (const p of problems) {
        const sub = taskMap.get(p._id.toString());
        const passed = Boolean(sub) && (sub.status === "passed" || sub.guiReview?.teacherStatus === "approved");
        if (passed) solvedCount += 1;
        tasks[p._id.toString()] = {
          status: passed ? "passed" : "pending",
          score: sub ? sub.score : 0,
          submittedAt: sub ? sub.updatedAt : null
        };
      }

      return {
        id: student._id,
        name: student.name,
        email: student.email,
        isActive: student.isActive,
        allSolved: solvedCount === problems.length,
        solvedCount,
        totalTasks: problems.length,
        tasks
      };
    });

    res.json({
      subject: assignedSubject.name,
      subjectId: assignedSubject._id,
      department: assignedSubject.department || "",
      year: assignedSubject.year || "",
      semester: assignedSubject.semester || "",
      problems: problems.map(p => ({ id: p._id, title: p.title })),
      totalStudents: studentsSummary.length,
      students: studentsSummary
    });
  } catch (error) {
    console.error("Subject summary failed:", error.message);
    res.status(500).json({ message: "Failed to load subject summary" });
  }
};

exports.getStudentSubmissions = async (req, res) => {
  try {
    const submissions = await Submission.find({ student: req.user._id })
      .populate("problem", "title subject difficulty year semester")
      .sort({ updatedAt: -1 });

    const solvedCount = submissions.filter((submission) => submission.status === "passed").length;
    const pendingCount = submissions.filter((submission) => submission.status !== "passed").length;
    const pendingQueryCount = submissions.filter((submission) => submission.queryStatus === "open" || submission.queryStatus === "revised_by_student").length;
    const answeredQueryCount = submissions.filter((submission) => submission.queryStatus === "answered").length;

    res.json({
      solvedCount,
      pendingCount,
      pendingQueryCount,
      answeredQueryCount,
      submissions: submissions.map((submission) => ({
        id: submission._id,
        status: submission.status,
        score: submission.score,
        passedCount: submission.passedCount,
        totalCount: submission.totalCount,
        queryPending: Boolean(submission.queryPending),
        queryStatus: submission.queryStatus || "none",
        teacherAnsweredAt: submission.teacherAnsweredAt,
        lastSavedBy: submission.lastSavedBy || "student",
        guiReview: mapGuiReview(submission.guiReview),
        updatedAt: submission.updatedAt,
        createdAt: submission.createdAt,
        problem: submission.problem,
      })),
    });
  } catch (error) {
    console.error("Student submission list failed:", error.message);
    res.status(500).json({ message: "Failed to load submissions" });
  }
};
