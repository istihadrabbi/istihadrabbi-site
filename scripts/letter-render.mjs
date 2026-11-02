// Renders a one-page cover letter to PDF and DOCX, styled to match the resume header.
// Used by the private tailor page. Input: the master resume (for name and contact details)
// and a letter { company, jobTitle, paragraphs[] }.

import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun, AlignmentType, ExternalHyperlink } from 'docx';
import { helpers } from './resume-render.mjs';

const today = () => new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' });

function parts(r, l) {
  return {
    date: today(),
    to: [l.company ? `Hiring Team, ${l.company}` : 'Hiring Team'],
    re: l.jobTitle ? `Re: ${l.jobTitle}` : '',
    greeting: 'Dear Hiring Manager,',
    paragraphs: l.paragraphs,
    close: 'Sincerely,',
    name: r.name,
  };
}

const pdfPages = (buf) => (buf.toString('latin1').match(/\/Type \/Page\b(?!s)/g) || []).length;

function letterPdf(r, l, fs) {
  const { contact } = helpers(r);
  const p = parts(r, l);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margins: { top: 54, bottom: 54, left: 72, right: 72 },
      info: { Title: `${r.name} – Cover Letter${l.company ? ` – ${l.company}` : ''}`, Author: r.name } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const ink = '#111111', accent = '#1f3a5f';
    const W = doc.page.width - 144;
    doc.font('Helvetica-Bold').fontSize(20).fillColor(ink).text(r.name, { align: 'center' });
    doc.font('Helvetica').fontSize(11.5).fillColor(accent).text(r.title, { align: 'center' });
    doc.moveDown(0.2);
    doc.fontSize(9).fillColor(ink).text(contact.join('  |  '), { align: 'center' });
    const y = doc.y + 4;
    doc.moveTo(72, y).lineTo(72 + W, y).lineWidth(0.6).strokeColor(accent).stroke();
    doc.y = y + 18;
    const body = (t, gap = 0.8) => { doc.font('Helvetica').fontSize(fs).fillColor(ink).text(t, 72, doc.y, { width: W, lineGap: 2 }); doc.moveDown(gap); };
    body(p.date);
    p.to.forEach((t) => body(t, 0));
    if (p.re) { doc.moveDown(0.8); doc.font('Helvetica-Bold').fontSize(fs).text(p.re, 72, doc.y, { width: W }); doc.moveDown(0.8); }
    else doc.moveDown(0.8);
    body(p.greeting);
    p.paragraphs.forEach((t) => body(t));
    body(p.close, 0.2);
    body(p.name, 0);
    doc.end();
  });
}

async function letterDocx(r, l, sz) {
  const { contact } = helpers(r);
  const p = parts(r, l);
  const FONT = 'Calibri', ACC = '1F3A5F';
  const run = (text, o = {}) => new TextRun({ text, font: FONT, size: sz, ...o });
  const P = (text, o = {}, after = 200) => new Paragraph({ spacing: { after }, children: [run(text, o)] });
  const doc = new Document({
    creator: r.name, title: `${r.name} – Cover Letter`,
    styles: { default: { document: { run: { font: FONT, size: sz } } } },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1080, left: 1440, right: 1440 } } },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, children: [run(r.name, { bold: true, size: 40 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [run(r.title, { size: 24, color: ACC })] }),
        new Paragraph({
          alignment: AlignmentType.CENTER, spacing: { after: 320 },
          border: { bottom: { style: 'single', size: 6, color: ACC, space: 6 } },
          children: contact.flatMap((c, i) => [
            ...(i ? [run('  |  ', { size: 18 })] : []),
            c.includes('linkedin') || (c.includes('.com') && !c.includes('@'))
              ? new ExternalHyperlink({ link: `https://${c}`, children: [run(c, { size: 18 })] })
              : run(c, { size: 18 }),
          ]),
        }),
        P(p.date),
        ...p.to.map((t, i) => P(t, {}, i === p.to.length - 1 ? 200 : 0)),
        ...(p.re ? [P(p.re, { bold: true })] : []),
        P(p.greeting),
        ...p.paragraphs.map((t) => P(t)),
        P(p.close, {}, 60),
        P(p.name, {}, 0),
      ],
    }],
  });
  return Packer.toBuffer(doc);
}

/** Builds the PDF and Word cover letter, shrinking the font if needed to stay on one page. */
export async function renderLetter(r, letter) {
  const l = {
    company: String(letter.company || '').trim(),
    jobTitle: String(letter.jobTitle || '').trim(),
    paragraphs: letter.paragraphs.map((t) => String(t).replace(/\s+/g, ' ').trim()).filter(Boolean),
  };
  const sizes = [{ fs: 11, sz: 22 }, { fs: 10.5, sz: 21 }, { fs: 10, sz: 20 }];
  let size, pdf;
  for (size of sizes) {
    pdf = await letterPdf(r, l, size.fs);
    if (pdfPages(pdf) <= 1) break;
  }
  return { pdf, docx: await letterDocx(r, l, size.sz) };
}
