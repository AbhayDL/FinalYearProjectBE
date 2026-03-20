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
  54: {
    extension: ".cpp",
    command: ["gcc:latest", "/bin/sh", "-lc", ({ fileName, outputName }) => `g++ ${fileName} -O2 -std=c++17 -o ${outputName} && ./${outputName}`],
    cleanupOutput: true,
    outputBase: "a.out",
  },
  71: {
    extension: ".py",
    command: ["python:3.10", "python", ({ fileName }) => fileName],
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
  { id: 50, name: "C" },
  { id: 54, name: "C++" },
  { id: 73, name: "Rust" },
  { id: 72, name: "Ruby" },
];

function buildDockerArgs(config, tmpDir, fileName) {
  const outputName = config.outputName || "";
  const mount = `${tmpDir}:/workspace`;
  const command = config.command.map((part) =>
    typeof part === "function" ? part({ fileName, outputName }) : part
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

async function executeCode(sourceCode, languageId, stdin = "") {
  const baseConfig = LANGUAGE_CONFIG[Number(languageId)];
  if (!baseConfig) {
    return { stdout: null, stderr: `Language id ${languageId} is not supported yet.`, exitCode: 1 };
  }

  const tmpDir = os.tmpdir();
  const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const fileName = `code-${uniqueId}${baseConfig.extension}`;
  const outputName = baseConfig.outputBase ? `${baseConfig.outputBase}-${uniqueId}` : "";
  const filePath = path.join(tmpDir, fileName);
  const config = { ...baseConfig, outputName };
  const outputPath = outputName ? path.join(tmpDir, outputName) : null;

  try {
    await fs.writeFile(filePath, sourceCode || "", "utf8");

    const args = buildDockerArgs(config, tmpDir, fileName);
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

    return result;
  } catch (error) {
    return { stdout: null, stderr: error.message, exitCode: 1 };
  } finally {
    try {
      await fs.unlink(filePath);
    } catch (error) {}

    if (config.cleanupOutput && outputPath) {
      try {
        await fs.unlink(outputPath);
      } catch (error) {}
    }
  }
}

module.exports = { executeCode, SUPPORTED_LANGUAGES };
