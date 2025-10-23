import { promises as fs } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const aiDir = path.join(rootDir, 'ai');
const logDir = path.join(aiDir, 'logs');
const stateDir = path.join(aiDir, '_state');
const siteConfigPath = path.join(aiDir, 'site-config.json');
const repoContextPath = path.join(rootDir, '.chatgpt-context.yml');
const aiContextPath = path.join(aiDir, '.chatgpt-context.yml');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readFileIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function loadSiteConfig() {
  const raw = await readFileIfExists(siteConfigPath);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Unable to parse ${path.relative(rootDir, siteConfigPath)}: ${error.message}`);
  }
}

async function loadContextSummary() {
  const repoContext = await readFileIfExists(repoContextPath);
  if (repoContext) {
    return repoContext.trim();
  }
  const fallback = await readFileIfExists(aiContextPath);
  return fallback ? fallback.trim() : null;
}

function buildBootstrapSummary(siteConfig, contextSummary) {
  const timestamp = new Date().toISOString();
  const commands = siteConfig?.commands ? Object.entries(siteConfig.commands).map(
    ([name, command]) => ({ name, command })
  ) : [];

  return {
    timestamp,
    project: siteConfig?.project_name ?? 'unknown',
    headline: siteConfig?.headline ?? null,
    commands,
    contextSnippet: contextSummary ? contextSummary.split('\n').slice(0, 8) : null
  };
}

async function writeState(summary) {
  const stateFile = path.join(stateDir, 'bootstrap-state.json');
  await fs.writeFile(stateFile, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
}

function printSummary(summary) {
  console.log(`🤖 AI template bootstrap complete for: ${summary.project}`);
  if (summary.headline) {
    console.log(`   ${summary.headline}`);
  }
  if (summary.commands?.length) {
    console.log('\nKey commands:');
    for (const { name, command } of summary.commands.slice(0, 8)) {
      console.log(` - ${name}: ${command}`);
    }
    if (summary.commands.length > 8) {
      console.log(`   …and ${summary.commands.length - 8} more`);
    }
  }
  if (summary.contextSnippet) {
    console.log('\nContext snippet:');
    for (const line of summary.contextSnippet) {
      console.log(`   ${line}`);
    }
  }
}

async function main() {
  await Promise.all([ensureDir(logDir), ensureDir(stateDir)]);
  const [siteConfig, contextSummary] = await Promise.all([
    loadSiteConfig(),
    loadContextSummary()
  ]);
  const summary = buildBootstrapSummary(siteConfig, contextSummary);
  await writeState(summary);
  printSummary(summary);
}

main().catch((error) => {
  console.error('Failed to bootstrap AI template kit.');
  console.error(error);
  process.exitCode = 1;
});
