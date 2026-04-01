const { spawn } = require("child_process");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

const LANGUAGE_CONFIG = {
  50: {
    extension: ".c",
    command: ["gcc:latest", "/bin/sh", "-lc", ({ fileName, outputName }) => `gcc ${fileName} -O2 -std=c11 -o ${outputName} && ./${outputName}`],
    cleanupOutput: true,
    outputBase: "a.out",
  },
  62: {
    extension: ".java",
    sourceFileName: "Main.java",
    images: ["codeassplat-java-academic:latest", "eclipse-temurin:17-jdk-jammy"],
    command: [
      ({ image }) => image,
      "/bin/sh",
      "-lc",
      ({ image }) =>
        image === "codeassplat-java-academic:latest"
          ? "javac -cp '/opt/java-libs/*:.' Main.java && java -cp '/opt/java-libs/*:.' Main"
          : "javac Main.java && java Main"
    ],
  },
  63: {
    extension: ".js",
    command: ["node:20-alpine", "node", ({ fileName }) => fileName],
  },
  54: {
    extension: ".cpp",
    command: ["gcc:latest", "/bin/sh", "-lc", ({ fileName, outputName }) => `g++ ${fileName} -O2 -std=c++17 -o ${outputName} && ./${outputName}`],
    cleanupOutput: true,
    outputBase: "a.out",
  },
  71: {
    extension: ".py",
    images: ["codeassplat-python-ml:latest", "python:3.10"],
    command: [({ image }) => image, "python", ({ fileName }) => fileName],
  },
  72: {
    extension: ".rb",
    command: ["ruby:3.2-alpine", "ruby", ({ fileName }) => fileName],
  },
  73: {
    extension: ".rs",
    command: ["rust:latest", "/bin/sh", "-lc", ({ fileName, outputName }) => `rustc ${fileName} -O -o ${outputName} && ./${outputName}`],
    cleanupOutput: true,
    outputBase: "main",
  },
};

const SUPPORTED_LANGUAGES = [
  { id: 71, name: "Python 3" },
  { id: 62, name: "Java" },
  { id: 63, name: "JavaScript" },
  { id: 50, name: "C" },
  { id: 54, name: "C++" },
  { id: 73, name: "Rust" },
  { id: 72, name: "Ruby" },
  { id: 1001, name: "HTML/CSS/JS", mode: "web" },
];

function buildDockerArgs(config, tmpDir, fileName, image) {
  const outputName = config.outputName || "";
  const mount = `${tmpDir}:/workspace`;
  const command = config.command.map((part) =>
    typeof part === "function" ? part({ fileName, outputName, image }) : part
  );

  return [
    "run",
    "--rm",
    "-i",
    "--network",
    "none",
    "--memory",
    "128m",
    "--cpus",
    "0.5",
    "-v",
    mount,
    "-w",
    "/workspace",
    ...command,
  ];
}

function getArtifactMimeType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

async function collectArtifacts(workDir) {
  try {
    const entries = await fs.readdir(workDir, { withFileTypes: true });
    const artifactFiles = entries
      .filter((entry) => entry.isFile() && /\.(png|jpe?g|gif|svg)$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));

    const artifacts = [];
    for (const fileName of artifactFiles) {
      const filePath = path.join(workDir, fileName);
      const buffer = await fs.readFile(filePath);
      artifacts.push({
        type: "image",
        name: fileName,
        mimeType: getArtifactMimeType(fileName),
        dataUrl: `data:${getArtifactMimeType(fileName)};base64,${buffer.toString("base64")}`
      });
    }
    return artifacts;
  } catch (error) {
    return [];
  }
}

function buildPythonSource(sourceCode = "") {
  return `import os
try:
    import matplotlib
    matplotlib.use("Agg")
except Exception:
    pass

${sourceCode}

try:
    import matplotlib.pyplot as plt
    figure_numbers = list(plt.get_fignums())
    for index, figure_number in enumerate(figure_numbers, start=1):
        figure = plt.figure(figure_number)
        figure.savefig(os.path.join(os.getcwd(), f"plot-{index}.png"))
except Exception:
    pass
`;
}

async function executeCode(sourceCode, languageId, stdin = "") {
  const baseConfig = LANGUAGE_CONFIG[Number(languageId)];
  if (!baseConfig) {
    return { stdout: null, stderr: `Language id ${languageId} is not supported yet.`, exitCode: 1, artifacts: [] };
  }
  if (Number(languageId) === 1001) {
    return {
      stdout: null,
      stderr: "HTML/CSS/JS problems use the Web IDE preview and teacher review flow instead of console execution.",
      exitCode: 1,
      artifacts: []
    };
  }

  const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `codeassplat-${uniqueId}-`));
  const fileName = baseConfig.sourceFileName || `code-${uniqueId}${baseConfig.extension}`;
  const outputName = baseConfig.outputBase ? `${baseConfig.outputBase}-${uniqueId}` : "";
  const filePath = path.join(workDir, fileName);
  const config = { ...baseConfig, outputName };
  const outputPath = outputName ? path.join(workDir, outputName) : null;
  const imagesToTry = Array.isArray(config.images) && config.images.length > 0
    ? config.images
    : [config.command[0]];

  try {
    const codeToWrite = Number(languageId) === 71 ? buildPythonSource(sourceCode || "") : (sourceCode || "");
    await fs.writeFile(filePath, codeToWrite, "utf8");
    let lastResult = { stdout: null, stderr: "Execution failed", exitCode: 1, artifacts: [] };

    for (const image of imagesToTry) {
      const args = buildDockerArgs(config, workDir, fileName, image);
      const proc = spawn("docker", args);
      let stdout = "";
      let stderr = "";

      const result = await new Promise((resolve) => {
        const killTimer = setTimeout(() => {
          try {
            proc.kill();
          } catch (error) {}
        }, 10000);

        proc.stdout.on("data", (data) => {
          stdout += data.toString();
        });

        proc.stderr.on("data", (data) => {
          stderr += data.toString();
        });

        proc.on("close", (exitCode) => {
          clearTimeout(killTimer);
          resolve({ stdout: stdout || null, stderr: stderr || null, exitCode });
        });

        proc.on("error", (error) => {
          clearTimeout(killTimer);
          resolve({ stdout: null, stderr: error.message, exitCode: 1 });
        });

        if (stdin) proc.stdin.write(stdin);
        proc.stdin.end();
      });

      const artifacts = await collectArtifacts(workDir);
      lastResult = { ...result, artifacts };
      const imageMissing = (result.stderr || "").includes("pull access denied") || (result.stderr || "").includes("No such image");
      if (!imageMissing) {
        return lastResult;
      }
    }

    return lastResult;
  } catch (error) {
    return { stdout: null, stderr: error.message, exitCode: 1, artifacts: [] };
  } finally {
    try {
      await fs.unlink(filePath);
    } catch (error) {}

    if (config.cleanupOutput && outputPath) {
      try {
        await fs.unlink(outputPath);
      } catch (error) {}
    }

    try {
      await fs.rm(workDir, { recursive: true, force: true });
    } catch (error) {}
  }
}

module.exports = { executeCode, SUPPORTED_LANGUAGES };
