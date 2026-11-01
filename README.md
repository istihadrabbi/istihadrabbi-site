# istihadrabbi.com

Personal resume site for Istihad Rabbi, built with Astro and hosted on Netlify.

## How it works
- `src/data/resume.yaml` is the master resume. The website, the PDF download and the Word download are all generated from it on every build.
- `src/content/blog/*.md` are blog posts (one Markdown file per post).
- `scripts/build-resume.mjs` creates the ATS-friendly PDF and DOCX in `public/resume/`.
- Contact form: Netlify Forms (submissions appear in the Netlify dashboard under Forms).
- Comments: Giscus (GitHub Discussions). Set the IDs in `src/site.config.ts`.

## Commands
- `npm install`
- `npm run dev` to preview locally
- `npm run build` to build into `dist/`

## Job-tailored resumes

Tailored copies are built from a copy of `src/data/resume.yaml` and are never published on the site:

```
node scripts/build-resume.mjs --in path/to/tailored.yaml --out path/to/folder
```

Tailoring may only reorder, emphasize and reword what is already in the master file. The script refuses to build if the tailored copy contains any number that is not in the master resume.

Keyword target: aim for a natural, genuine match of about 70–75% of the job description's keywords. Do not copy every keyword or mirror the posting's wording.

### Private tailor page (`/tailor`)

Must never be public: unlinked from the site, password checked on the server by `netlify/edge-functions/tailor.js`, `noindex`, excluded from the sitemap and blocked in robots.txt. No usage cap.

- `netlify/edge-functions/tailor.js`: password gate for everything under `/tailor`, reads job links, asks Gemini, runs the honesty checks.
- `netlify/functions/tailor-build.mjs`: re-checks the approved resume on the server and builds the PDF and Word files.
- `scripts/resume-checks.mjs`: the honesty checks (no new numbers, jobs, dates, or unconfirmed skills).
- Netlify environment variables: `TAILOR_PASSWORD`, `GEMINI_API_KEY` (free tier from Google AI Studio), optional `GEMINI_MODEL`.
- Contact details are never sent to the AI; they are added back when the files are built.

Each tailored resume also reports whether the company is enrolled in E-Verify, using only the official search at e-verify.gov/e-verify-employer-search. If it can't be read, say so; never guess.
