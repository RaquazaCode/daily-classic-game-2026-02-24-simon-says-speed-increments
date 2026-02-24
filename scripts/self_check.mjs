import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mainPath = resolve('src/main.js');
const main = readFileSync(mainPath, 'utf8');

const required = ['window.advanceTime', 'window.render_game_to_text'];
const missing = required.filter((token) => !main.includes(token));

if (missing.length) {
  console.error(`Missing required hooks: ${missing.join(', ')}`);
  process.exit(1);
}

console.log('Self-check passed: required hooks present.');
