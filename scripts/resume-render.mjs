// Renders a resume object (same shape as src/data/resume.yaml) to ATS-friendly PDF and DOCX buffers.
// Used by the build script (public downloads) and by the private tailor function.
// Rules followed: one column, standard headings, real text, no tables,
// no images, contact details in the body (not in a page header), standard fonts.

import PDFDocument from 'pdfkit';
import {
  Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, TabStopType, ExternalHyperlink,
} from 'docx';

// The PDF and Word files are a shorter version of the website.
// In resume.yaml, `in_files: false` on a skill group or job keeps it on the website only,
// and `files_publications: false` leaves the Publications section out of the files.
export const forFiles = (r) => ({
  ...r,
  skills: r.skills.filter((s) => s.in_files !== false),
  experience: r.experience.filter((e) => e.in_files !== false),
  publications: r.files_publications === false ? [] : (r.publications || []),
});

export const fileBase = (r) => `${r.name.replace(/\s+/g, '-')}-${r.title.replace(/\s+/g, '-')}-Resume`;

function helpers(r) {
  const strip = (u) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  const contact = [r.location, r.phone, r.email, strip(r.linkedin), strip(r.website)];
  const dates = (x) => `${x.start} – ${x.end}`;
  return { contact, dates };
}

// ---------- PDF ----------
export function renderPdf(input) {
  const r = forFiles(input);
  const { contact, dates } = helpers(r);
  return new Promise((resolve, reject) => {
  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: 32, bottom: 28, left: 54, right: 54 },
    info: { Title: `${r.name} – ${r.title} Resume`, Author: r.name, Subject: r.title,
      Keywords: r.skills.flatMap((s) => s.items).join(', ') },
  });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);
  const W = doc.page.width - 108;
  const ink = '#111111';
  const accent = '#1f3a5f';

  doc.font('Helvetica-Bold').fontSize(20).fillColor(ink).text(r.name, { align: 'center' });
  doc.font('Helvetica').fontSize(11.5).fillColor(accent).text(r.title, { align: 'center' });
  doc.moveDown(0.2);
  doc.fontSize(9.5).fillColor(ink).text(contact.join('  |  '), { align: 'center' });

  const heading = (t) => {
    doc.moveDown(0.35);
    if (doc.y + 50 > doc.page.height - doc.page.margins.bottom) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(11).fillColor(accent).text(t.toUpperCase(), { characterSpacing: 0.5 });
    const y = doc.y + 1;
    doc.moveTo(54, y).lineTo(54 + W, y).lineWidth(0.6).strokeColor(accent).stroke();
    doc.moveDown(0.25);
    doc.fillColor(ink);
  };
  const FS = 9.5, LG = 0.4; // body font size and line gap, tuned so the resume fits on one page
  const body = (t, opts = {}) => doc.font('Helvetica').fontSize(FS).fillColor(ink).text(t, { lineGap: LG, ...opts });
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  const ensure = (h) => { if (doc.y + h > bottom()) { doc.addPage(); } };
  const bullet = (t) => {
    doc.font('Helvetica').fontSize(FS);
    ensure(doc.heightOfString(t, { width: W - 20, lineGap: LG }) + 2);
    doc.font('Helvetica').fontSize(FS).text('•', 62, doc.y, { continued: false, lineBreak: false });
    doc.text(t, 74, doc.y, { width: W - 20, lineGap: LG });
    doc.x = 54;
  };
  const roleLine = (left, right) => {
    ensure(60);
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(10).text(left, 54, y, { width: W - 130 });
    const after = doc.y;
    doc.font('Helvetica').fontSize(FS).text(right, 54, y, { width: W, align: 'right' });
    doc.y = Math.max(after, doc.y);
    doc.x = 54;
  };

  heading('Professional Summary');
  body(r.summary.replace(/\s+/g, ' '));

  heading('Core Skills');
  for (const s of r.skills) {
    doc.font('Helvetica-Bold').fontSize(FS).text(`${s.group}: `, { continued: true, lineGap: LG });
    doc.font('Helvetica').text(s.items.join(', '));
  }

  heading('Professional Experience');
  r.experience.forEach((e, i) => {
    if (i) doc.moveDown(0.15);
    roleLine(e.role, dates(e));
    doc.font('Helvetica-Oblique').fontSize(FS).text(`${e.company}, ${e.location}`);
    doc.moveDown(0.05);
    e.bullets.forEach(bullet);
  });

  heading('Selected Projects');
  r.projects.forEach((p, i) => {
    if (i) doc.moveDown(0.15);
    roleLine(p.name, dates(p));
    doc.font('Helvetica-Oblique').fontSize(FS).text(p.client);
    doc.moveDown(0.05);
    p.bullets.forEach(bullet);
  });

  heading('Education');
  // One line per degree: bold degree, then school and GPA, year on the right.
  r.education.forEach((e) => {
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(FS).text(e.degree, 54, y, { continued: true, lineGap: LG });
    doc.font('Helvetica').text(`, ${e.school}${e.gpa ? `, GPA ${e.gpa}` : ''}`);
    const after = doc.y;
    doc.text(e.year, 54, y, { width: W, align: 'right' });
    doc.y = after; doc.x = 54;
  });

  // Certifications and memberships share one section to keep the resume to one page.
  heading(r.memberships?.length ? 'Certifications & Memberships' : 'Certifications');
  r.certifications.forEach((c) => bullet(`${c.name}, ${c.issuer}`));
  (r.memberships || []).forEach((m) => bullet(`${m.name}, ${m.detail}`));

  if (r.publications.length) {
    heading('Publications');
    r.publications.forEach((p) => bullet(`${p.title}. ${p.venue} (${p.type}).`));
  }

  doc.end();
  });
}

// ---------- DOCX ----------
export async function renderDocx(input) {
  const r = forFiles(input);
  const { contact, dates } = helpers(r);
  const FONT = 'Calibri';
  const ACC = '1F3A5F';
  const SZ = 19; // body size in half-points (9.5pt Calibri), tuned so the resume fits on one page
  const run = (text, o = {}) => new TextRun({ text, font: FONT, size: SZ, ...o });
  const RIGHT = 10080; // right tab at text width (8.5in - 2*0.75in = 7in = 10080 twips)
  const H = (t) => new Paragraph({
    spacing: { before: 100, after: 40 }, keepNext: true,
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACC, space: 2 } },
    children: [run(t.toUpperCase(), { bold: true, size: 22, color: ACC })],
  });
  const P = (children, o = {}) => new Paragraph({ spacing: { after: 0 }, children, ...o });
  const B = (t) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 0 }, children: [run(t)] });
  // keep = false for single-line entries (education) so they don't chain onto the next section.
  const role = (left, right, leftRuns, keep = true) => new Paragraph({
    spacing: { before: keep ? 40 : 0, after: 0 }, keepNext: keep, keepLines: true,
    tabStops: [{ type: TabStopType.RIGHT, position: RIGHT }],
    children: [...(leftRuns || [run(left, { bold: true })]), run(`\t${right}`)],
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
    ...r.education.map((e) => role(null, e.year, [run(e.degree, { bold: true }), run(`, ${e.school}${e.gpa ? `, GPA ${e.gpa}` : ''}`)], false)),
    H(r.memberships?.length ? 'Certifications & Memberships' : 'Certifications'),
    ...r.certifications.map((c) => B(`${c.name}, ${c.issuer}`)),
    ...(r.memberships || []).map((m) => B(`${m.name}, ${m.detail}`)),
    ...(r.publications.length ? [H('Publications'), ...r.publications.map((p) => B(`${p.title}. ${p.venue} (${p.type}).`))] : []),
  ];

  const doc = new Document({
    creator: r.name, title: `${r.name} – ${r.title} Resume`,
    styles: { default: { document: { run: { font: FONT, size: SZ }, paragraph: { spacing: { line: 228 } } } } },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 640, bottom: 560, left: 1080, right: 1080 } } },
      children,
    }],
  });
  return Packer.toBuffer(doc);
}

