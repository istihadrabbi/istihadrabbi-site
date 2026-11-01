// Private resume tailor: password gate for /tailor and the AI tailoring endpoint.
// Runs on Netlify Edge before anything under /tailor is served, so the page, the API
// and the file builder are all unreachable without the password.
//
// Environment variables (set in Netlify, never in the code):
//   TAILOR_PASSWORD  the password for the page
//   GEMINI_API_KEY   free-tier key from Google AI Studio
//   GEMINI_MODEL     optional, default gemini-flash-latest (falls back to gemini-flash-lite-latest)

import master from '../../src/data/resume-master.json' with { type: 'json' };
import { assembleTailored, stripContact } from '../../scripts/resume-checks.mjs';
import { COOKIE, isSignedIn, sessionToken, same } from '../../scripts/tailor-auth.mjs';

const env = (k) => (globalThis.Netlify?.env?.get(k) ?? globalThis.process?.env?.[k]) || '';
const NOINDEX = { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...NOINDEX } });

export default async function tailor(req, context) {
  const url = new URL(req.url);
  const p = url.pathname.replace(/\/+$/, '') || '/';
  const password = env('TAILOR_PASSWORD');

  if (!password) return loginPage('This page is not set up yet.', 503);

  if (p === '/tailor/login' && req.method === 'POST') {
    const form = await req.formData().catch(() => null);
    const given = String(form?.get('password') || '');
    await new Promise((r) => setTimeout(r, 600)); // slows down password guessing
    if (given && same(given, password)) {
      return new Response(null, {
        status: 303,
        headers: { Location: '/tailor/', 'Set-Cookie': `${COOKIE}=${await sessionToken(password)}; Path=/tailor; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`, ...NOINDEX },
      });
    }
    return loginPage('Wrong password. Try again.', 401);
  }

  if (p === '/tailor/logout') {
    return new Response(null, { status: 303, headers: { Location: '/tailor/', 'Set-Cookie': `${COOKIE}=; Path=/tailor; HttpOnly; Secure; SameSite=Strict; Max-Age=0`, ...NOINDEX } });
  }

  const signedIn = await isSignedIn(req, password);
  if (!signedIn) return p.startsWith('/tailor/api/') ? json({ ok: false, message: 'Signed out. Reload the page and enter your password.' }, 401) : loginPage('', 401);

  if (p === '/tailor/api/tailor' && req.method === 'POST') return streamed(() => handleTailor(req));

  const res = await context.next();
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(NOINDEX)) out.headers.set(k, v);
  return out;
}

export const config = { path: ['/tailor', '/tailor/*'] };

// Sends spaces while the AI works so the connection never times out, then the JSON result.
function streamed(work) {
  const te = new TextEncoder();
  const body = new ReadableStream({
    async start(ctrl) {
      const beat = setInterval(() => ctrl.enqueue(te.encode(' ')), 4000);
      let result;
      try { result = await work(); } catch (e) { result = { ok: false, message: `Something went wrong: ${e.message}` }; }
      clearInterval(beat);
      ctrl.enqueue(te.encode(JSON.stringify(result)));
      ctrl.close();
    },
  });
  return new Response(body, { headers: { 'Content-Type': 'application/json', ...NOINDEX } });
}

// ---------- Tailoring ----------

async function handleTailor(req) {
  const input = await req.json().catch(() => ({}));
  let { link = '', jobTitle = '', company = '', jd = '' } = input;
  jd = String(jd).trim();

  if (!jd && link) {
    const read = await readJobLink(String(link).trim());
    if (!read.ok) return { ok: false, needText: true, message: read.message };
    jd = read.text;
    jobTitle ||= read.title;
  }
  if (jd.length < 200) return { ok: false, needText: true, message: 'Paste the job description (at least a few paragraphs) so it can be matched.' };

  const apiKey = env('GEMINI_API_KEY');
  if (!apiKey) return { ok: false, message: 'The Gemini key is not set up yet in Netlify.' };

  const models = [env('GEMINI_MODEL') || 'gemini-flash-latest', 'gemini-flash-lite-latest'];
  let feedback = '';
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ai = await askGemini(apiKey, models, buildPrompt({ jobTitle, company, jd, feedback }));
    if (!ai.ok) return ai;
    const gap = (ai.data.keywords?.missing || []).map((m) => m.keyword).filter(Boolean);
    const { resume, problems, dropped } = assembleTailored(master, ai.data, [], gap);
    last = { resume, problems, dropped, ai: ai.data, model: ai.model };
    if (!problems.length) break;
    feedback = `Your previous answer was rejected because it contained ${problems.join('; ')}. Use only facts and numbers from the resume.`;
  }
  if (last.problems.length) {
    return { ok: false, message: `The AI kept adding things that aren't in your resume (${last.problems.join('; ')}). Nothing was built. Try again, or shorten the job description.` };
  }
  const kw = last.ai.keywords || {};
  return {
    ok: true,
    jobTitle: jobTitle || last.ai.jobTitle || '',
    company: company || last.ai.company || '',
    model: last.model,
    resume: stripContact(last.resume),
    master: stripContact(master),
    matched: (kw.matched || []).filter((k) => typeof k === 'string'),
    missing: (kw.missing || []).filter((m) => m && typeof m.keyword === 'string'),
    dropped: last.dropped,
  };
}

async function readJobLink(link) {
  let u;
  try { u = new URL(link); } catch { return { ok: false, message: "That doesn't look like a web link. Paste the job text below instead." }; }
  if (!/^https?:$/.test(u.protocol)) return { ok: false, message: 'Only web links work here. Paste the job text below instead.' };
  if (/(^|\.)linkedin\.com$/i.test(u.hostname)) return { ok: false, message: "LinkedIn blocks automatic reading. Copy the job text from LinkedIn and paste it below." };
  try {
    const res = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36', Accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(9000) });
    if (!res.ok) return { ok: false, message: `Couldn't read this link (the site answered ${res.status}). Paste the job text below instead.` };
    const html = (await res.text()).slice(0, 600000);
    const title = (html.match(/<title[^>]*>([^<]{1,200})/i)?.[1] || '').trim();
    const text = html
      .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>|<\/(p|li|h\d|div)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
      .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
    if (text.length < 400) return { ok: false, message: "Couldn't find the job description on that page (it may need a login or load by script). Paste the job text below instead." };
    return { ok: true, text: text.slice(0, 15000), title };
  } catch {
    return { ok: false, message: "Couldn't reach that link. Paste the job text below instead." };
  }
}

function buildPrompt({ jobTitle, company, jd, feedback }) {
  const resume = stripContact(master);
  return `You tailor a resume to one job posting. Return JSON only.

STRICT RULES
- Use ONLY facts in the RESUME. Never invent experience, tools, skills, employers, dates, titles, degrees or numbers.
- Every number (percent, money, count) must appear exactly as in the RESUME. Do not round, combine or add numbers.
- You may reorder, emphasize and reword. Reword naturally in the candidate's voice; do not copy sentences from the job posting.
- Aim for a natural keyword match of about 70-75% of the important job keywords. Do not stuff keywords.
- Skill items must already be in the resume (you may regroup, rename groups and reorder). Do not add a skill just because the job asks for it.
- experience: one entry per RESUME job, same order, 2-4 bullets each (reorder and reword the existing bullets; most relevant first).
- projects: one entry per RESUME project, same order.
- certifications: names exactly as in the RESUME, most relevant first; you may leave out irrelevant ones (keep at least 3).
- keywords: list the 25-35 most important keywords/skills from the job posting. "matched" = ones the tailored resume genuinely shows. "missing" = ones it does not; set askUser=true only for skills or tools the candidate could plausibly have used but the resume doesn't mention (e.g. a software tool), and false for things like years of experience, industry background or degrees.
- summary: 3-4 sentences, no first person, keep it truthful and specific.
${feedback ? `\nIMPORTANT: ${feedback}\n` : ''}
JOB TITLE: ${jobTitle || '(not given)'}
COMPANY: ${company || '(not given)'}
JOB POSTING:
"""
${jd.slice(0, 15000)}
"""

RESUME (JSON):
${JSON.stringify(resume)}`;
}

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    jobTitle: { type: 'STRING' },
    company: { type: 'STRING' },
    summary: { type: 'STRING' },
    skills: { type: 'ARRAY', items: { type: 'OBJECT', properties: { group: { type: 'STRING' }, items: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['group', 'items'] } },
    experience: { type: 'ARRAY', items: { type: 'OBJECT', properties: { bullets: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['bullets'] } },
    projects: { type: 'ARRAY', items: { type: 'OBJECT', properties: { bullets: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['bullets'] } },
    certifications: { type: 'ARRAY', items: { type: 'STRING' } },
    keywords: {
      type: 'OBJECT',
      properties: {
        matched: { type: 'ARRAY', items: { type: 'STRING' } },
        missing: { type: 'ARRAY', items: { type: 'OBJECT', properties: { keyword: { type: 'STRING' }, askUser: { type: 'BOOLEAN' } }, required: ['keyword', 'askUser'] } },
      },
      required: ['matched', 'missing'],
    },
  },
  required: ['summary', 'skills', 'experience', 'projects', 'certifications', 'keywords'],
};

async function askGemini(apiKey, models, prompt) {
  let lastMsg = '';
  for (const model of models) {
    let res;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, responseMimeType: 'application/json', responseSchema: SCHEMA },
        }),
        signal: AbortSignal.timeout(90000),
      });
    } catch (e) {
      lastMsg = `Couldn't reach Gemini (${e.name}).`;
      continue;
    }
    if (res.status === 429) { lastMsg = "Today's free Gemini limit is used up. It resets at midnight Pacific time."; continue; }
    if (!res.ok) { lastMsg = `Gemini answered ${res.status}.`; if (res.status === 400 || res.status === 403) break; continue; }
    const data = await res.json().catch(() => null);
    const text = data?.candidates?.[0]?.content?.parts?.map((x) => x.text || '').join('') || '';
    try { return { ok: true, data: JSON.parse(text), model }; } catch { lastMsg = 'Gemini returned an unreadable answer.'; }
  }
  return { ok: false, message: `${lastMsg} Nothing was built. Try again in a minute.` };
}

// ---------- Password page ----------

function loginPage(message, status) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Private</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f7fb;color:#0f172a;font:16px/1.6 system-ui,-apple-system,'Segoe UI',sans-serif;padding:16px}
form{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:28px;width:100%;max-width:380px}h1{font-size:22px;margin:0 0 4px}p{margin:0 0 16px;color:#64748b;font-size:14px}
label{display:block;font-weight:600;font-size:14px;margin-bottom:6px}input{width:100%;box-sizing:border-box;font:inherit;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px}
button{margin-top:14px;width:100%;padding:11px;border:0;border-radius:999px;background:#4f46e5;color:#fff;font:600 15px system-ui,sans-serif;cursor:pointer}.err{color:#b91c1c}</style></head>
<body><form method="post" action="/tailor/login"><h1>Private page</h1><p>${message ? `<span class="err">${message}</span>` : 'Enter your password to continue.'}</p>
<label for="pw">Password</label><input id="pw" name="password" type="password" autocomplete="current-password" required autofocus><button type="submit">Unlock</button></form></body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...NOINDEX } });
}
