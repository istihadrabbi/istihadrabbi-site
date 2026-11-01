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
