// Honesty checks for job-tailored resumes. Shared by the build script and the private tailor page.
// Rule: tailoring may reorder, emphasize and reword what is true. It may never add numbers,
// jobs, dates or skills that are not in the master resume (or that the owner did not confirm).

const NUM = /\$?\d[\d,.]*[%K+]*/g;
export const numbers = (text) => new Set((String(text).match(NUM) || []).map((n) => n.replace(/[.,]$/, '')));

/** Numbers that appear in `candidate` but nowhere in `master` (both any JSON-able value). */
export function numbersNotIn(candidate, master) {
  const allowed = numbers(typeof master === 'string' ? master : JSON.stringify(master));
  return [...numbers(typeof candidate === 'string' ? candidate : JSON.stringify(candidate))].filter((n) => !allowed.has(n));
}

export const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9+#.$% ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Fields the AI is never sent and never allowed to change. */
export function stripContact(master) {
  const { email, phone, linkedin, website, location, testimonials, highlights, tagline, available, ...rest } = master;
  return rest;
}

/**
 * Builds a safe tailored resume from the master resume plus the AI's suggestions.
 * Jobs, companies, dates, education, publications and contact details always come from the master file.
 * Returns { resume, problems, dropped }. `problems` means the result must not be used.
 */
export function assembleTailored(master, ai, confirmed = [], gapKeywords = []) {
  const problems = [];
  const dropped = [];
  const masterText = norm(JSON.stringify(stripContact(master)));
  const confirmedN = confirmed.map(norm);
  const grounded = (item) => {
    const n = norm(item);
    if (!n) return false;
    if (confirmedN.includes(n)) return true;
    if (masterText.includes(n)) return true;
    // Allow light rewording such as "Excel (Advanced, Pivot Tables)" when every word is in the master file.
    return n.split(' ').filter((w) => w.length > 2 && !['and', 'the', 'with', 'for'].includes(w)).every((w) => masterText.includes(w));
  };

  const str = (v, fallback) => (typeof v === 'string' && v.trim() ? v.trim() : fallback);
  const r = structuredClone(master);
  r.summary = str(ai?.summary, master.summary);

  // Skills: groups may be renamed and reordered; every item must be grounded.
  if (Array.isArray(ai?.skills) && ai.skills.length) {
    r.skills = ai.skills.map((g) => ({
      group: str(g?.group, 'Skills'),
      items: (Array.isArray(g?.items) ? g.items : []).filter((it) => {
        const ok = typeof it === 'string' && grounded(it);
        if (!ok) dropped.push(String(it));
        return ok;
      }),
    })).filter((g) => g.items.length);
  }
  // Confirmed gap skills are added by code, not by the AI.
  for (const c of confirmed) {
    if (!r.skills.some((g) => g.items.some((it) => norm(it).includes(norm(c))))) {
      (r.skills[0] ||= { group: 'Skills', items: [] }).items.push(c);
    }
  }

  // Experience and projects: only the bullets can change.
  const bullets = (src, list) => {
    if (!Array.isArray(list) || !list.length || list.length > src.length + 1) return src;
    const clean = list.filter((b) => typeof b === 'string' && b.trim()).map((b) => b.trim());
    return clean.length ? clean : src;
  };
  r.experience = master.experience.map((e, i) => ({ ...e, bullets: bullets(e.bullets, ai?.experience?.[i]?.bullets) }));
  r.projects = master.projects.map((p, i) => ({ ...p, bullets: bullets(p.bullets, ai?.projects?.[i]?.bullets) }));

  // Certifications: reorder or drop only.
  if (Array.isArray(ai?.certifications) && ai.certifications.length) {
    const picked = ai.certifications.map((n) => master.certifications.find((c) => norm(c.name) === norm(n))).filter(Boolean);
    if (picked.length >= Math.min(3, master.certifications.length)) r.certifications = [...new Set(picked)];
  }

  const extra = numbersNotIn({ s: r.summary, k: r.skills, e: r.experience, p: r.projects }, master);
  if (extra.length) problems.push(`numbers not in your main resume: ${extra.join(', ')}`);

  // Gap keywords the owner did not confirm must not sneak into the text.
  const text = norm(JSON.stringify({ s: r.summary, k: r.skills, e: r.experience, p: r.projects }));
  const leaked = gapKeywords.filter((k) => !confirmedN.includes(norm(k)) && norm(k).length > 2 && !masterText.includes(norm(k)) && text.includes(norm(k)));
  if (leaked.length) problems.push(`skills you haven't confirmed: ${leaked.join(', ')}`);

  return { resume: r, problems, dropped };
}

/**
 * Honesty checks for an AI-written cover letter: no numbers that aren't in the master resume,
 * and no job-posting skills the owner hasn't confirmed. Returns a list of problems (empty = fine).
 */
export function checkLetter(master, paragraphs, gapKeywords = []) {
  const problems = [];
  if (!Array.isArray(paragraphs) || !paragraphs.filter((p) => typeof p === 'string' && p.trim()).length) return ['an empty cover letter'];
  const text = paragraphs.join(' ');
  const extra = numbersNotIn(text, master);
  if (extra.length) problems.push(`numbers in the cover letter that aren't in your main resume: ${extra.join(', ')}`);
  const masterText = norm(JSON.stringify(stripContact(master)));
  const t = norm(text);
  const leaked = gapKeywords.filter((k) => norm(k).length > 2 && !masterText.includes(norm(k)) && t.includes(norm(k)));
  if (leaked.length) problems.push(`skills in the cover letter you haven't confirmed: ${leaked.join(', ')}`);
  return problems;
}
