// Private resume tailor: turns an approved tailored resume into PDF and Word files.
// Re-runs every honesty check on the server (the browser is never trusted) and adds the
// contact details back from the master resume. Protected by the same password session.

import master from '../../src/data/resume-master.json' with { type: 'json' };
import { assembleTailored } from '../../scripts/resume-checks.mjs';
import { renderPdf, renderDocx } from '../../scripts/resume-render.mjs';
import { isSignedIn } from '../../scripts/tailor-auth.mjs';

const env = (k) => (globalThis.Netlify?.env?.get(k) ?? process.env[k]) || '';
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' },
});

export default async (req) => {
  if (req.method !== 'POST') return json({ ok: false, message: 'Use POST.' }, 405);
  if (!(await isSignedIn(req, env('TAILOR_PASSWORD')))) return json({ ok: false, message: 'Signed out. Reload the page and enter your password.' }, 401);

  const body = await req.json().catch(() => ({}));
  const t = body.resume || {};
  const confirmed = (Array.isArray(body.confirmed) ? body.confirmed : []).filter((x) => typeof x === 'string').slice(0, 30);
  const gap = (Array.isArray(body.gapKeywords) ? body.gapKeywords : []).filter((x) => typeof x === 'string');
  const ai = {
    summary: t.summary,
    skills: t.skills,
    experience: t.experience,
    projects: t.projects,
    certifications: (t.certifications || []).map((c) => (typeof c === 'string' ? c : c?.name)),
  };
  const { resume, problems } = assembleTailored(master, ai, confirmed, gap);
  if (problems.length) return json({ ok: false, message: `Stopped: the resume has ${problems.join('; ')}.` }, 422);

  const slug = String(body.company || 'Tailored').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'Tailored';
  const base = `${master.name.replace(/\s+/g, '-')}-Resume-${slug}`;
  const [pdf, docx] = await Promise.all([renderPdf(resume), renderDocx(resume)]);
  return json({
    ok: true,
    files: [
      { name: `${base}.pdf`, type: 'application/pdf', data: pdf.toString('base64') },
      { name: `${base}.docx`, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data: docx.toString('base64') },
    ],
  });
};

export const config = { path: '/tailor/api/build' };
