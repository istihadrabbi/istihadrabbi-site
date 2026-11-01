// Builds the ATS-friendly resume downloads from src/data/resume.yaml.
// Output: public/resume/Istihad-Rabbi-Digital-Marketing-Analyst-Resume.{pdf,docx}
// Rules followed: one column, standard headings, real text, no tables,
// no images, contact details in the body (not in a page header), standard fonts.

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import PDFDocument from 'pdfkit';
import {
  Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, TabStopType, ExternalHyperlink,
} from 'docx';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const r = YAML.parse(fs.readFileSync(path.join(root, 'src/data/resume.yaml'), 'utf8'));
const outDir = path.join(root, 'public/resume');
fs.mkdirSync(outDir, { recursive: true });
const base = `${r.name.replace(/\s+/g, '-')}-${r.title.replace(/\s+/g, '-')}-Resume`;

const strip = (u) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
const contact = [r.location, r.phone, r.email, strip(r.linkedin), strip(r.website)];
const dates = (x) => `${x.start} – ${x.end}`;

// ---------- PDF ----------
function buildPdf() {
  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: 46, bottom: 46, left: 54, right: 54 },
    info: { Title: `${r.name} – ${r.title} Resume`, Author: r.name, Subject: r.title,
      Keywords: r.skills.flatMap((s) => s.items).join(', ') },
  });
  doc.pipe(fs.createWriteStream(path.join(outDir, `${base}.pdf`)));
  const W = doc.page.width - 108;
  const ink = '#111111';
  const accent = '#1f3a5f';

  doc.font('Helvetica-Bold').fontSize(20).fillColor(ink).text(r.name, { align: 'center' });
  doc.font('Helvetica').fontSize(11.5).fillColor(accent).text(r.title, { align: 'center' });
  doc.moveDown(0.2);
  doc.fontSize(9.5).fillColor(ink).text(contact.join('  |  '), { align: 'center' });

  const heading = (t) => {
    doc.moveDown(0.6);
    if (doc.y + 120 > doc.page.height - doc.page.margins.bottom) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(11).fillColor(accent).text(t.toUpperCase(), { characterSpacing: 0.5 });
    const y = doc.y + 1;
    doc.moveTo(54, y).lineTo(54 + W, y).lineWidth(0.6).strokeColor(accent).stroke();
    doc.moveDown(0.35);
    doc.fillColor(ink);
  };
  const body = (t, opts = {}) => doc.font('Helvetica').fontSize(10).fillColor(ink).text(t, { lineGap: 1.2, ...opts });
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  const ensure = (h) => { if (doc.y + h > bottom()) { doc.addPage(); } };
  const bullet = (t) => {
    doc.font('Helvetica').fontSize(10);
    ensure(doc.heightOfString(t, { width: W - 20, lineGap: 1.2 }) + 2);
    doc.font('Helvetica').fontSize(10).text('•', 62, doc.y, { continued: false, lineBreak: false });
    doc.text(t, 74, doc.y, { width: W - 20, lineGap: 1.2 });
    doc.x = 54;
  };
  const roleLine = (left, right) => {
    ensure(60);
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(10.5).text(left, 54, y, { width: W - 130 });
    const after = doc.y;
    doc.font('Helvetica').fontSize(10).text(right, 54, y, { width: W, align: 'right' });
    doc.y = Math.max(after, doc.y);
    doc.x = 54;
  };

  heading('Professional Summary');
  body(r.summary.replace(/\s+/g, ' '));

  heading('Core Skills');
  for (const s of r.skills) {
    doc.font('Helvetica-Bold').fontSize(10).text(`${s.group}: `, { continued: true, lineGap: 1.2 });
    doc.font('Helvetica').text(s.items.join(', '));
  }

  heading('Professional Experience');
  r.experience.forEach((e, i) => {
    if (i) doc.moveDown(0.4);
    roleLine(e.role, dates(e));
    doc.font('Helvetica-Oblique').fontSize(10).text(`${e.company}, ${e.location}`);
    doc.moveDown(0.15);
    e.bullets.forEach(bullet);
  });

  heading('Selected Projects');
  r.projects.forEach((p, i) => {
    if (i) doc.moveDown(0.4);
    roleLine(p.name, dates(p));
    doc.font('Helvetica-Oblique').fontSize(10).text(p.client);
    doc.moveDown(0.15);
    p.bullets.forEach(bullet);
  });

  heading('Education');
  r.education.forEach((e) => {
    roleLine(e.degree, e.year);
    body(`${e.school}${e.gpa ? `, GPA ${e.gpa}` : ''}`);
  });

  heading('Certifications');
  r.certifications.forEach((c) => bullet(`${c.name}, ${c.issuer}`));

  heading('Publications');
  r.publications.forEach((p) => bullet(`${p.title}. ${p.venue} (${p.type}).`));

  if (r.memberships?.length) {
    heading('Professional Memberships');
    r.memberships.forEach((m) => bullet(`${m.name}, ${m.detail}`));
  }
  doc.end();
}

// ---------- DOCX ----------
async function buildDocx() {
  const FONT = 'Calibri';
  const ACC = '1F3A5F';
  const run = (text, o = {}) => new TextRun({ text, font: FONT, size: 21, ...o });
  const RIGHT = 10080; // right tab at text width (8.5in - 2*0.75in = 7in = 10080 twips)
  const H = (t) => new Paragraph({
    spacing: { before: 200, after: 80 }, keepNext: true,
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACC, space: 2 } },
    children: [run(t.toUpperCase(), { bold: true, size: 22, color: ACC })],
  });
  const P = (children, o = {}) => new Paragraph({ spacing: { after: 40 }, children, ...o });
  const B = (t) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 30 }, children: [run(t)] });
  const role = (left, right) => new Paragraph({
    spacing: { before: 100, after: 0 }, keepNext: true, keepLines: true,
    tabStops: [{ type: TabStopType.RIGHT, position: RIGHT }],
    children: [run(left, { bold: true }), run(`\t${right}`)],
  });

  const children = [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [run(r.name, { bold: true, size: 40 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [run(r.title, { size: 24, color: ACC })] }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 80 },
      children: contact.flatMap((c, i) => [
        ...(i ? [run('  |  ', { size: 19 })] : []),
        c.includes('linkedin') || c.includes('.com') && !c.includes('@')
          ? new ExternalHyperlink({ link: `https://${c}`, children: [run(c, { size: 19 })] })
          : run(c, { size: 19 }),
      ]),
    }),
    H('Professional Summary'),
    P([run(r.summary.replace(/\s+/g, ' '))]),
    H('Core Skills'),
    ...r.skills.map((s) => P([run(`${s.group}: `, { bold: true }), run(s.items.join(', '))])),
    H('Professional Experience'),
    ...r.experience.flatMap((e) => [
      role(e.role, dates(e)),
      P([run(`${e.company}, ${e.location}`, { italics: true })]),
      ...e.bullets.map(B),
    ]),
    H('Selected Projects'),
    ...r.projects.flatMap((p) => [
      role(p.name, dates(p)),
      P([run(p.client, { italics: true })]),
      ...p.bullets.map(B),
    ]),
    H('Education'),
    ...r.education.flatMap((e) => [role(e.degree, e.year), P([run(`${e.school}${e.gpa ? `, GPA ${e.gpa}` : ''}`)])]),
    H('Certifications'),
    ...r.certifications.map((c) => B(`${c.name}, ${c.issuer}`)),
    H('Publications'),
    ...r.publications.map((p) => B(`${p.title}. ${p.venue} (${p.type}).`)),
    ...(r.memberships?.length ? [H('Professional Memberships'), ...r.memberships.map((m) => B(`${m.name}, ${m.detail}`))] : []),
  ];

  const doc = new Document({
    creator: r.name, title: `${r.name} – ${r.title} Resume`,
    styles: { default: { document: { run: { font: FONT, size: 21 } } } },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1000, bottom: 1000, left: 1080, right: 1080 } } },
      children,
    }],
  });
  fs.writeFileSync(path.join(outDir, `${base}.docx`), await Packer.toBuffer(doc));
}

buildPdf();
await buildDocx();
// Expose file names to the site.
fs.writeFileSync(path.join(root, 'src/data/resume-files.json'),
  JSON.stringify({ pdf: `/resume/${base}.pdf`, docx: `/resume/${base}.docx` }, null, 2));
console.log(`Resume built: ${base}.pdf and .docx`);
