import { promises as fs } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const aiDir = path.join(rootDir, 'ai');
const logDir = path.join(aiDir, 'logs');
const stateDir = path.join(aiDir, '_state');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function resolveAgentName() {
  const fromEnv = process.env.AI_AGENT_NAME;
  const fromArg = process.argv[2];
  const candidate = (fromEnv ?? fromArg ?? '').trim();
  return candidate.length ? candidate : 'unspecified';
}

function buildPayload(agentName) {
  return {
    timestamp: new Date().toISOString(),
    agent: agentName,
    workflow: process.env.GITHUB_WORKFLOW ?? null,
    runId: process.env.GITHUB_RUN_ID ?? null,
    repo: process.env.GITHUB_REPOSITORY ?? null,
    commit: process.env.GITHUB_SHA ?? null
  };
}

async function appendLog(payload) {
  await ensureDir(logDir);
  const datePrefix = payload.timestamp.slice(0, 10);
  const logFile = path.join(logDir, `${datePrefix}.log`);
  await fs.appendFile(logFile, `${JSON.stringify(payload)}\n`, 'utf8');
  return logFile;
}

async function writeState(payload) {
  await ensureDir(stateDir);
  const stateFile = path.join(stateDir, 'last-agent-run.json');
  await fs.writeFile(stateFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return stateFile;
}

async function main() {
  const agentName = resolveAgentName();
  const payload = buildPayload(agentName);
  const [logFile, stateFile] = await Promise.all([
    appendLog(payload),
    writeState(payload)
  ]);
  console.log(`Logged AI agent run for "${agentName}" → ${path.relative(rootDir, logFile)}`);
  console.log(`State saved to ${path.relative(rootDir, stateFile)}`);
}

main().catch((error) => {
  console.error('Failed to log AI agent run.');
  console.error(error);
  process.exitCode = 1;
});
