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

⚠️ **2 potential secret exposure(s) detected** — review and rotate any real credentials immediately.

| Severity | Count |
|---|---|
| 🔴 Critical | 0 |
| 🟠 High | 0 |
| 🟡 Medium | 2 |

### Findings

#### 🟡 Potential Secret in Environment Assignment
- **Severity:** MEDIUM
- **Commit:** `db5c6b6` — Initial commit — SteinbergValentino monorepo
- **File:** `cms/.env.example`
- **Line preview:** `ADMIN_JWT_SECRET=your_admin_jwt_secret`

#### 🟡 Potential Secret in Environment Assignment
- **Severity:** MEDIUM
- **Commit:** `db5c6b6` — Initial commit — SteinbergValentino monorepo
- **File:** `cms/.env.example`
- **Line preview:** `TRANSFER_TOKEN_SALT=your_transfer_token_salt`

### Recommended Actions

1. **Rotate every flagged credential immediately** — assume it is compromised once committed.
2. Use environment variables or a secrets manager (e.g. AWS Secrets Manager, Vault, Doppler).
3. Add a pre-commit hook (`git-secrets`, `gitleaks`, `detect-secrets`) to block future leaks.
4. If the repo is public, check GitHub's **Security → Secret scanning** alerts.

---

📊 CODE ANALYSIS REPORT
Period analyzed: 2026-05-06 → 2026-06-05
Total commits: 22
Files changed: 238
Lines added: +295794
Lines removed: -4614

---

### CODE QUALITY (score out of 10)

**Readability score: 8/10** — Generally clear with good commit messages, though some functions like `buildSrcSet()` in `promo-carousel.tsx` could benefit from more descriptive naming.

**Maintainability score: 7/10** — Several hardcoded values exist (e.g., Unsplash URL patterns in `f710218`) that should be configurable; good separation of concerns but some tight coupling between CMS and frontend types.

**Best practices score: 9/10** — Strong adherence to Next.js patterns with only minor issues like unhandled promises in `getStrapiMedia` error cases (`c99c4f3`). Excellent security practices with env var migration for API tokens.

**Overall score: 8/10** — Well-structured project with strong technical foundations and room for minor optimizations.

---

### ESTIMATED HOURS

Work sessions identified: 6
Total estimated hours: 8h
Most active session: Friday 2026-05-22 (~2.5h)
Average session length: ~1.3h

**Session breakdown:**
1. **Friday 2026-05-22 | 02:05Z → 02:22Z | 1h** — Initial monorepo setup, security fixes, web directory restructuring
2. **Friday 2026-05-22 | 08:14Z → 08:51Z | 1h** — Premium redesign implementation and Strapi URL configuration
3. **Friday 2026-05-22 | 11:30Z → 13:39Z | 2.5h** — Performance optimizations (LCP/TBT) and CMS content migration
4. **Friday 2026-05-22 | 16:46Z → 16:46Z | 1h** — Homepage CMS seed checkpoint
5. **Saturday 2026-05-23 | 15:52Z → 16:54Z | 1.5h** — Full CMS integration and Railway deployment fixes
6. **Sunday 2026-05-24 | 04:26Z → 05:07Z | 1h** — Image URL normalisation and final performance tweaks

---

### KEY OBSERVATIONS

**What was done well ✅**
- Excellent security hardening by migrating hardcoded tokens to env vars (`9f373cf`)
- Thoughtful performance optimizations: preconnect, fetchPriority, and srcset (`b1bada8`, `f710218`)
- Comprehensive CMS integration with proper fallback systems (`cacd7f5`)

**Areas for improvement ⚠️**
- Magic numbers in image width/quality arrays (`f710218`)
- Duplicated URL construction logic between `page.tsx` and `promo-carousel.tsx`
- Incomplete error handling in `getStrapiMedia` (`c99c4f3`)

---

### IMPROVEMENT SUGGESTIONS

1. **Extract image width/quality presets** — Create a shared config for the `[640, 960, 1200]` breakpoints repeated across multiple files
2. **Centralize URL utils** — Combine URL construction logic from `page.tsx` and `promo-carousel.tsx` into a shared `lib/urls.ts`
3. **Enhance error logging** — Add Sentry or `console.error` logging in `getStrapiMedia`'s catch blocks
4. **Document env requirements** — Create a `DEPLOYMENT.md` covering all required env vars (`STRAPI_URL`, etc.)
5. **Add integration tests** — Puppeteer tests for critical paths like contact form submission and image loading
