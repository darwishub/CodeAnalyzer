# CodeAnalyzer

Analyze your GitHub commits from the past 30 days using AI. Generates a structured report covering tech stack detection, security scanning, code quality scores, accurate session-based hour estimates, key observations, and actionable improvement suggestions.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your credentials:

| Variable | Description |
|---|---|
| `GITHUB_TOKEN` | Personal access token from [github.com/settings/tokens](https://github.com/settings/tokens). Needs `repo` scope for private repos, `public_repo` for public. |
| `GITHUB_USERNAME` | GitHub username or organization that owns the repo |
| `GITHUB_REPO` | Repository name (without the owner prefix) |
| `OPENROUTER_API_KEY` | API key from [openrouter.ai/keys](https://openrouter.ai/keys) |

### 3. Run

```bash
npm start
```

## Output

The report is printed to the console and saved as `result.md` in the project directory (overwritten on each run, git-ignored).

### Report sections

| Section | What it covers |
|---|---|
| 🛠️ Tech Stack | Auto-detected frameworks, libraries, language, and config files |
| 🔒 Security Scan | Regex-based detection of exposed secrets, tokens, and credentials in diffs |
| 📊 Code Analysis | Period, commit count, files changed, lines added/removed |
| Code Quality | Readability, maintainability, and best-practices scores (each out of 10) with rubric-based deductions |
| Estimated Hours | Session-based estimates derived from real commit timestamps (2-hour gap rule) |
| Key Observations | What was done well and specific areas for improvement |
| Improvement Suggestions | Numbered, actionable recommendations tied to actual files |

## File structure

```
CodeAnalyzer/
├── index.js       # Entry point — orchestrates the full pipeline
├── github.js      # GitHub API calls: commits, diffs, tech stack detection
├── analyzer.js    # Session computation + LLM prompt + OpenRouter API call
├── security.js    # Local regex-based secret scanner (18 rules, no API call)
├── .env           # Your credentials (git-ignored)
├── .env.example   # Template for .env
└── result.md      # Generated report (git-ignored, recreated on each run)
```

## How it works

```
GitHub API → commits (past 30 days)
          → diffs per commit
          → tech stack (package.json, tsconfig, Dockerfile, etc.)
          ↓
Local     → security scan (regex, 18 rules, added lines only)
          → session grouping (2-hour gap rule, real timestamps)
          ↓
OpenRouter → DeepSeek V3 analysis (code quality rubric + key observations)
          ↓
result.md + console output
```

## Notes

- Analyzes commits from the **past 30 days** (up to 100 commits).
- Diffs are fetched with a 200 ms delay between requests to avoid GitHub rate limits.
- Patches are truncated to a shared 50k-character budget across all commits to stay within the model's context window.
- Hour estimates are computed from **real commit timestamps** in code — the LLM describes sessions but never recalculates hours.
- The LLM used is `deepseek/deepseek-chat` (DeepSeek V3) via OpenRouter.

---

## Example Output

Below is a real `result.md` generated from an actual repository.

---

## 🛠️ TECH STACK

**Runtime:** Node.js
**Frameworks/Libraries:** Next.js, React, Strapi CMS, TypeScript, Tailwind CSS
**All deps (42):** react, react-dom, next, typescript, tailwindcss, @strapi/strapi, sharp, zod, clsx, lucide-react…
**Scripts:** dev, build, start, lint
**Config files found:** package.json

---

## 🔒 SECURITY SCAN

✅ **No exposed secrets detected** — no hardcoded credentials, tokens, or private keys were found in the added lines of this period's commits.

---

📊 CODE ANALYSIS REPORT
Period analyzed: 2026-05-06 → 2026-06-05
Total commits: 22
Files changed: 238
Lines added: +295794
Lines removed: -4614

---

### CODE QUALITY (score out of 10)

**Readability score: 8/10** — Good overall with clear commit messages like "fix: repair malformed srcset URLs in carousel by using URL API instead of regex" (`680e4f5`), though some functions like `buildSrcSet()` could be more descriptively named.

**Maintainability score: 7/10** — Generally modular but has some tight coupling between Strapi and frontend (e.g., hardcoded Unsplash URL handling in `promo-carousel.tsx`). CMS integration is well-structured though.

**Best practices score: 9/10** — Strong adherence to Next.js patterns (`generateMetadata`, dynamic imports) and security fixes (removing hardcoded API token in `9f373cf`). Minor deduction for remaining TODO in `layout.tsx`.

**Overall score: 8/10** — High-quality work with clear performance optimizations and CMS integration, though some areas could benefit from better separation of concerns.

---

### ESTIMATED HOURS

Work sessions identified: 6
Total estimated hours: 8h
Most active session: Friday 2026-05-22 (~2.5h)
Average session length: ~1.3h

**Session breakdown:**
1. **Friday 2026-05-22 | 02:05Z → 02:22Z | 1h** — Initial monorepo setup, security fix for hardcoded API token, and web directory restructuring
2. **Friday 2026-05-22 | 08:14Z → 08:51Z | 1h** — Premium redesign deployment and Strapi remotePattern fix for Railway production
3. **Friday 2026-05-22 | 11:30Z → 13:39Z | 2.5h** — Performance optimizations (LCP/TBT improvements), CMS field migrations, and redesign checkpoint
4. **Friday 2026-05-22 | 16:46Z → 16:46Z | 1h** — Homepage CMS seed checkpoint with Strapi content type updates
5. **Saturday 2026-05-23 | 15:52Z → 16:54Z | 1.5h** — Full CMS integration and Railway deployment fixes (build commands, TS configs)
6. **Sunday 2026-05-24 | 04:26Z → 05:07Z | 1h** — Final performance tweaks (carousel preload, URL normalization, metadata fixes)

---

### KEY OBSERVATIONS

**What was done well ✅**
1. **Performance focus** — LCP optimizations via preconnect, fetchPriority (`b1bada8`), and image srcset fixes (`680e4f5`)
2. **CMS integration** — All content moved to Strapi fields with proper fallbacks (`07d0931`)
3. **Security** — API token moved to env vars (`9f373cf`) and localhost URL normalization (`c99c4f3`)

**Areas for improvement ⚠️**
1. **Magic strings** — Unsplash URL handling still hardcoded in multiple components (`f710218`)
2. **Error handling** — Missing try/catch in some Strapi fetchers (`3105957`)
3. **Testing gap** — No unit/integration tests visible in commits

---

### IMPROVEMENT SUGGESTIONS

1. **Extract image service logic** — Create a shared service for Unsplash URL handling rather than duplicating in carousel/page components
2. **Add error boundaries** — Wrap Strapi fetches in consistent error handling (reference `3105957`'s try/catch pattern)
3. **Env validation** — Add runtime checks for required env vars like `STRAPI_API_TOKEN`
4. **Testing** — Introduce Jest/Vitest for critical paths like `getStrapiMedia` URL normalization
5. **Document CMS schema** — Add a `schema.md` explaining Strapi content relationships for future maintainers
