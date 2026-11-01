// Builds the ATS-friendly resume downloads from src/data/resume.yaml.
// Output: public/resume/Istihad-Rabbi-Digital-Marketing-Analyst-Resume.{pdf,docx}
// Rules followed: one column, standard headings, real text, no tables,
// no images, contact details in the body (not in a page header), standard fonts.

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { renderPdf, renderDocx, fileBase } from './resume-render.mjs';
import { numbersNotIn } from './resume-checks.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// Optional flags for job-tailored copies (never touch the public site files):
//   node scripts/build-resume.mjs --in path/to/tailored.yaml --out path/to/folder
const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
const masterPath = path.join(root, 'src/data/resume.yaml');
const inPath = arg('--in') ? path.resolve(arg('--in')) : masterPath;
const tailored = inPath !== masterPath;
const r = YAML.parse(fs.readFileSync(inPath, 'utf8'));
const outDir = arg('--out') ? path.resolve(arg('--out')) : path.join(root, 'public/resume');
fs.mkdirSync(outDir, { recursive: true });
const base = fileBase(r);

// Honesty check for tailored copies: every number in the tailored resume
// (percentages, money, counts, years) must already exist in the master file.
if (tailored) {
  const extra = numbersNotIn(r, fs.readFileSync(masterPath, 'utf8'));
  if (extra.length) {
    console.error(`Stopped: tailored resume has numbers not in the master resume: ${extra.join(', ')}`);
    process.exit(1);
  }
}

fs.writeFileSync(path.join(outDir, `${base}.pdf`), await renderPdf(r));
fs.writeFileSync(path.join(outDir, `${base}.docx`), await renderDocx(r));
// Expose file names to the site, and the master resume to the private tailor page (master build only).
if (!tailored) {
  fs.writeFileSync(path.join(root, 'src/data/resume-master.json'), JSON.stringify(r));
  fs.writeFileSync(path.join(root, 'src/data/resume-files.json'),
    JSON.stringify({ pdf: `/resume/${base}.pdf`, docx: `/resume/${base}.docx` }, null, 2));
}
console.log(`Resume built: ${path.join(outDir, base)}.pdf and .docx`);
