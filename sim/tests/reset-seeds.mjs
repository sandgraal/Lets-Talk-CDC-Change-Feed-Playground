#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const seedsPath = path.resolve(__dirname, "seeds.json");

const count = Number(process.env.SEED_COUNT || 24);
const start = Number(process.env.SEED_START || Date.now()) % 1000;

const seeds = Array.from({ length: count }, (_, index) => start + index + 1);

fs.writeFileSync(seedsPath, JSON.stringify(seeds, null, 2));
console.log(`Seed list updated (${count} seeds) at ${path.relative(process.cwd(), seedsPath)}`);
