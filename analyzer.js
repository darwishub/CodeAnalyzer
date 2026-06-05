const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "deepseek/deepseek-chat";

// Total character budget for all diff content in the prompt (~50k chars ≈ ~12k tokens).
// DeepSeek Chat supports 64k context; we leave room for the prompt shell + response.
const DIFF_BUDGET_CHARS = 50_000;

function buildCommitSummary(commits) {
  // Calculate a fair per-commit share of the diff budget
  const perCommitBudget = Math.floor(DIFF_BUDGET_CHARS / commits.length);

  return commits
    .map((c) => {
      const perFileBudget = c.files.length > 0
        ? Math.floor(perCommitBudget / c.files.length)
        : perCommitBudget;

      const fileList = c.files
        .map((f) => {
          const hasDiff = f.patch && f.patch !== "(binary or no diff available)";
          const patch = hasDiff ? f.patch.slice(0, perFileBudget) : null;
          const truncated = hasDiff && f.patch.length > perFileBudget ? " [truncated]" : "";
          return (
            `    - ${f.filename} [${f.status}] +${f.additions}/-${f.deletions}\n` +
            (patch ? `\`\`\`diff\n${patch}${truncated}\n\`\`\`` : "(binary or no diff)")
          );
        })
        .join("\n");

      return [
        `### Commit ${c.sha.slice(0, 7)}`,
        `Author: ${c.author}`,
        `Date: ${c.date}`,
        `Message: ${c.message}`,
        `Stats: +${c.stats?.additions ?? 0} / -${c.stats?.deletions ?? 0} across ${c.files.length} file(s)`,
        `Files:\n${fileList}`,
      ].join("\n");
    })
    .join("\n\n---\n\n");
}

// Session grouping: gap > 2 hours between consecutive commits = new session.
// Ramp-up/wrap-up: +30 min per session (flat). Single-commit sessions get 1h minimum.
export function computeSessions(commits) {
  if (!commits.length) return [];

  const sorted = [...commits].sort((a, b) => new Date(a.date) - new Date(b.date));
  const sessions = [];
  let group = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const gap = (new Date(sorted[i].date) - new Date(sorted[i - 1].date)) / 3_600_000;
    if (gap > 2) { sessions.push(group); group = [sorted[i]]; }
    else group.push(sorted[i]);
  }
  sessions.push(group);

  return sessions.map((s) => {
    const start = new Date(s[0].date);
    const end = new Date(s[s.length - 1].date);
    const elapsed = (end - start) / 3_600_000;
    const estimated = Math.max(1, Math.round((elapsed + 0.5) * 2) / 2);
    const day = start.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
    const date = start.toISOString().slice(0, 10);
    return {
      day,
      date,
      startTime: start.toISOString().slice(11, 16) + "Z",
      endTime: end.toISOString().slice(11, 16) + "Z",
      elapsedHours: Math.round(elapsed * 10) / 10,
      estimatedHours: estimated,
      commits: s.map((c) => ({
        sha: c.sha.slice(0, 7),
        message: c.message.split("\n")[0],
        additions: c.stats?.additions ?? 0,
        deletions: c.stats?.deletions ?? 0,
        files: c.files.length,
      })),
    };
  });
}

function buildSessionsBlock(sessions) {
  const totalHours = sessions.reduce((sum, s) => sum + s.estimatedHours, 0);
  const busiest = sessions.reduce((a, b) => a.estimatedHours >= b.estimatedHours ? a : b);

  const lines = [
    `Sessions: ${sessions.length}`,
    `Total estimated hours: ${totalHours}h`,
    `Most active session: ${busiest.day} ${busiest.date} (~${busiest.estimatedHours}h)`,
    `Average session length: ~${Math.round((totalHours / sessions.length) * 10) / 10}h`,
    "",
    "Session details (pre-computed — do not recalculate):",
  ];

  sessions.forEach((s, i) => {
    lines.push(
      `  Session ${i + 1}: ${s.day} ${s.date} | ${s.startTime} → ${s.endTime} | raw ${s.elapsedHours}h + 0.5h ramp = ${s.estimatedHours}h | ${s.commits.length} commit(s)`,
      ...s.commits.map((c) => `    - ${c.sha} +${c.additions}/-${c.deletions} ${c.files} file(s) — ${c.message}`)
    );
  });

  return lines.join("\n");
}

function buildTechStackSection(techStack) {
  if (!techStack?.summary?.length) return "";
  return `## Project Tech Stack\n${techStack.summary.join("\n")}\n`;
}

function buildPrompt(commits, since, until, techStack, sessions) {
  const summary = buildCommitSummary(commits);
  const techSection = buildTechStackSection(techStack);
  const sessionsBlock = buildSessionsBlock(sessions);

  const totalFiles = new Set(commits.flatMap((c) => c.files.map((f) => f.filename))).size;
  const totalAdditions = commits.reduce((s, c) => s + (c.stats?.additions ?? 0), 0);
  const totalDeletions = commits.reduce((s, c) => s + (c.stats?.deletions ?? 0), 0);

  return `You are a senior software engineer and engineering manager performing a rigorous code review and work-session analysis. Be honest, specific, and accurate — do not inflate scores or hours.

${techSection}

---

## STEP 1 — HOUR DATA (pre-computed — copy into report exactly, do not recalculate)

The session grouping and hour estimates below were calculated from real commit timestamps using a 2-hour gap rule + 30-minute ramp/wrap per session. Use these numbers verbatim in your report.

${sessionsBlock}

---

## STEP 2 — CODE QUALITY ASSESSMENT (reason through this before writing the report)

Use the detected tech stack above to judge quality against the conventions and best practices of those specific frameworks (e.g. Next.js App Router patterns, Strapi lifecycle hooks, TypeScript strict mode). Score each dimension 1–10 using this rubric. Deduct points for each issue found:

**Readability (start at 10)**
- −1 per function/variable with unclear or abbreviated names
- −1 if code blocks exceed ~40 lines without logical separation
- −1 if there are unexplained magic numbers or strings
- −1 if commit messages are vague or inconsistent

**Maintainability (start at 10)**
- −1 for duplicated logic that should be extracted
- −1 for tightly coupled modules with no clear interface
- −1 for missing or incomplete error handling at system boundaries
- −1 for hardcoded configuration values that should be env vars
- −1 for any TODO/FIXME left unresolved

**Best Practices (start at 10)**
- −1 for missing input validation at external boundaries
- −1 for inconsistent code style across files
- −1 for committing generated files, secrets, or build artifacts
- −1 for no evidence of testing (unit or integration)
- −1 for ignoring async errors (unhandled promise rejections, missing try/catch)

---

## STEP 3 — WRITE THE REPORT

Using your reasoning from Steps 1 and 2, produce the report below using EXACTLY this format. Replace every placeholder. Do not skip any section.

---

📊 CODE ANALYSIS REPORT
Period analyzed: ${since} → ${until}
Total commits: ${commits.length}
Files changed: ${totalFiles}
Lines added: +${totalAdditions}
Lines removed: -${totalDeletions}

---

CODE QUALITY (score out of 10)
Readability score: X/10 — <one sentence citing a specific example from the diffs>
Maintainability score: X/10 — <one sentence citing a specific example from the diffs>
Best practices score: X/10 — <one sentence citing a specific example from the diffs>
Overall score: X/10 — <one sentence summary>

---

ESTIMATED HOURS
Work sessions identified: <copy from pre-computed data>
Total estimated hours: <copy from pre-computed data>
Most active session: <copy from pre-computed data>
Average session length: <copy from pre-computed data>
Session breakdown:
<for each session: copy day/date/time range/hours from pre-computed data, then add one sentence describing what was done>

---

KEY OBSERVATIONS

What was done well ✅
- <specific, cite filename or commit sha>
- <specific, cite filename or commit sha>
- <specific, cite filename or commit sha>

Areas for improvement ⚠️
- <specific, cite filename or commit sha>
- <specific, cite filename or commit sha>
- <specific, cite filename or commit sha>

---

IMPROVEMENT SUGGESTIONS
1. <Actionable suggestion — reference the specific file or pattern>
2. <Actionable suggestion — reference the specific file or pattern>
3. <Actionable suggestion — reference the specific file or pattern>
4. <Actionable suggestion — reference the specific file or pattern>
5. <Actionable suggestion — reference the specific file or pattern>

---

## Commit Data (for your reference)
${summary}
`;
}

export async function analyzeCommits(apiKey, commits, techStack = {}, sessions = []) {
  const until = new Date().toISOString().split("T")[0];
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - 30);
  const since = sinceDate.toISOString().split("T")[0];

  const prompt = buildPrompt(commits, since, until, techStack, sessions);
  console.log(`   Prompt size: ~${Math.round(prompt.length / 1000)}k chars`);

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/code-analyzer",
      "X-Title": "CodeAnalyzer",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${error}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  const content = choice?.message?.content;

  if (!content) {
    const reason = choice?.finish_reason ?? "unknown";
    const detail = JSON.stringify(data.error ?? data.choices ?? data);
    throw new Error(`Empty response from LLM (finish_reason: ${reason}). Raw: ${detail}`);
  }

  return content;
}
