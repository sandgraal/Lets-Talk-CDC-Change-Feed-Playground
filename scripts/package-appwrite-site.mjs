import { promises as fs } from 'node:fs';
import { resolve, join } from 'node:path';
import AdmZip from 'adm-zip';

const projectRoot = resolve(new URL(import.meta.url).pathname, '..', '..');
const outDir = join(projectRoot, 'dist', 'appwrite-site');
const zipPath = join(projectRoot, 'dist', 'appwrite-site.zip');

const requiredFiles = [
  join(projectRoot, 'index.html'),
  join(projectRoot, 'assets/generated/ui-shell.js'),
  join(projectRoot, 'assets/generated/sim-bundle.js'),
  join(projectRoot, 'assets/generated/changefeed-playground.js'),
  join(projectRoot, 'assets/generated/ui-shell.css'),
];

async function ensureBundles() {
  const missing = [];

  for (const filePath of requiredFiles) {
    try {
      await fs.access(filePath);
    } catch {
      missing.push(filePath);
    }
  }

  if (missing.length > 0) {
    const relList = missing.map((filePath) => filePath.replace(`${projectRoot}/`, '')).join('\n- ');
    throw new Error(`Generated assets are missing. Run \`npm run build\` first. Missing:\n- ${relList}`);
  }
}

async function copyDir(source, destination) {
  await fs.mkdir(destination, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const from = join(source, entry.name);
    const to = join(destination, entry.name);

    if (entry.isDirectory()) {
      await copyDir(from, to);
    } else {
      await fs.copyFile(from, to);
    }
  }
}

async function prepareAppwriteBundle() {
  await ensureBundles();

  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  await fs.copyFile(join(projectRoot, 'index.html'), join(outDir, 'index.html'));
  await fs.copyFile(join(projectRoot, 'CDC_logo.png'), join(outDir, 'CDC_logo.png'));

  await copyDir(join(projectRoot, 'assets'), join(outDir, 'assets'));

  try {
    await fs.access(join(projectRoot, 'docs'));
    await copyDir(join(projectRoot, 'docs'), join(outDir, 'docs'));
  } catch {
    // docs directory is optional for the hosted site
  }

  const zip = new AdmZip();
  zip.addLocalFolder(outDir);
  zip.writeZip(zipPath);

  const relativeOut = outDir.replace(`${projectRoot}/`, '');
  const relativeZip = zipPath.replace(`${projectRoot}/`, '');
  // eslint-disable-next-line no-console
  console.log(`Appwrite site bundle ready:\n- Directory: ${relativeOut}\n- Archive:   ${relativeZip}`);
}

prepareAppwriteBundle().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error.message);
  process.exitCode = 1;
});
