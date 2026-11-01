// Generates branded blog cover images (1200x630 WebP) for posts.
// Usage: node scripts/make-covers.cjs   (needs Playwright installed locally)
const { chromium } = require('playwright');
const fs = require('fs');
const posts = [
  ['from-ai-to-decision-intelligence-why-2026-is-the-year-of-smarter-business-decisions', 'AI Strategy', 'From AI to Decision Intelligence', 'Why 2026 is the year of smarter business decisions', 'net'],
  ['kpi-vs-okr-the-data-driven-growth-framework-most-teams-get-wrong', 'Business Analytics', 'KPI vs OKR', 'The data-driven growth framework most teams get wrong', 'bars'],
  ['marketing-roi-explained-why-it-matters', 'Digital Marketing', 'Marketing ROI Explained', 'Why it matters, and how to measure it', 'line'],
  ['the-7-step-ai-project-checklist-from-problem-framing-to-real-roi', 'Applied Research', 'The 7-Step AI Project Checklist', 'From problem framing to real ROI', 'steps'],
];
const art = {
  line: `<svg viewBox="0 0 420 300" width="420"><path d="M10 260 L80 230 L150 240 L220 170 L290 150 L350 90 L410 40" fill="none" stroke="#5eead4" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><circle cx="410" cy="40" r="16" fill="#5eead4"/><text x="300" y="30" fill="#a5b4fc" font-size="40" font-weight="800">ROI</text></svg>`,
  bars: `<svg viewBox="0 0 420 300" width="420">${[90,150,120,200,260].map((h,i)=>`<rect x="${20+i*80}" y="${280-h}" width="56" height="${h}" rx="10" fill="${i===4?'#5eead4':'#6366f1'}" opacity="${i===4?1:.55+i*.1}"/>`).join('')}</svg>`,
  net: `<svg viewBox="0 0 420 300" width="420">${(()=>{const n=[[60,60],[200,40],[340,80],[120,170],[280,180],[200,270],[380,240]];let s='';[[0,1],[1,2],[0,3],[1,3],[1,4],[2,4],[3,5],[4,5],[4,6],[2,6]].forEach(([a,b])=>s+=`<line x1="${n[a][0]}" y1="${n[a][1]}" x2="${n[b][0]}" y2="${n[b][1]}" stroke="#818cf8" stroke-width="4" opacity=".7"/>`);n.forEach(([x,y],i)=>s+=`<circle cx="${x}" cy="${y}" r="${i===4?22:14}" fill="${i===4?'#5eead4':'#6366f1'}"/>`);return s})()}</svg>`,
  steps: `<svg viewBox="0 0 420 300" width="420">${[1,2,3,4,5,6,7].map((k,i)=>`<rect x="${10+i*56}" y="${250-i*32}" width="48" height="${30+i*32}" rx="8" fill="${i===6?'#5eead4':'#6366f1'}" opacity="${.45+i*.08}"/><text x="${34+i*56}" y="${240-i*32}" fill="#e0e7ff" font-size="22" font-weight="800" text-anchor="middle">${k}</text>`).join('')}</svg>`,
};
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  fs.mkdirSync('public/images/blog', { recursive: true });
  for (const [slug, tag, title, sub, kind] of posts) {
    await p.setContent(`<body style="margin:0"><div style="width:1200px;height:630px;box-sizing:border-box;padding:72px;font-family:Inter,Arial,sans-serif;color:#fff;background:radial-gradient(700px 400px at 90% 10%,rgba(6,182,212,.35),transparent 60%),linear-gradient(135deg,#1e1b4b,#0f172a 65%);display:flex;align-items:center;gap:40px">
      <div style="flex:1"><div style="display:inline-block;font-size:22px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#a5b4fc;border:2px solid #4f46e5;border-radius:999px;padding:8px 20px">${tag}</div>
      <div style="font-size:64px;font-weight:800;line-height:1.08;margin:28px 0 18px;letter-spacing:-1px">${title}</div>
      <div style="font-size:30px;color:#cbd5e1">${sub}</div>
      <div style="margin-top:44px;font-size:22px;color:#94a3b8;font-weight:600">istihadrabbi.com</div></div>
      <div style="flex:none">${art[kind]}</div></div></body>`);
    await p.screenshot({ path: `/tmp/cover-${slug}.png` });
  }
  await b.close();
})();
