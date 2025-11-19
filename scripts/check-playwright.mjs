import { chromium, firefox, webkit } from 'playwright';

const browsers = [
  { name: 'Chromium', launcher: chromium },
  { name: 'Firefox', launcher: firefox },
  { name: 'WebKit', launcher: webkit },
];

const missing = [];
const failures = [];

for (const browser of browsers) {
  try {
    const instance = await browser.launcher.launch({ headless: true });
    await instance.close();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const looksMissing = message.toLowerCase().includes('executable') || message.toLowerCase().includes('download');

    if (looksMissing) {
      missing.push({ name: browser.name, detail: message });
      continue;
    }

    failures.push({ name: browser.name, detail: message });
  }
}

if (missing.length > 0) {
  console.error('⚠️  Playwright browsers are missing:');
  for (const entry of missing) {
    console.error(`- ${entry.name}: ${entry.detail}`);
  }
  console.error('\nRun "npm run setup:e2e" to install all browsers with dependencies.');
  process.exit(1);
}

if (failures.length > 0) {
  console.error('❌ Unexpected errors while launching Playwright browsers:');
  for (const entry of failures) {
    console.error(`- ${entry.name}: ${entry.detail}`);
  }
  console.error('\nInvestigate the errors above or rerun with PLAYWRIGHT_BROWSERS_PATH cleared.');
  process.exit(1);
}

console.log('✅ All Playwright browsers are installed and launchable.');
