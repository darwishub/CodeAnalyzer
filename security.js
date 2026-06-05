// Patterns are matched only against added lines (+) in each diff patch.
// Each rule: { id, label, pattern, severity }
// severity: "critical" | "high" | "medium"

const RULES = [
  // Cloud providers
  {
    id: "aws-access-key",
    label: "AWS Access Key ID",
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
    severity: "critical",
  },
  {
    id: "aws-secret-key",
    label: "AWS Secret Access Key",
    pattern: /\b(?:aws_secret(?:_access)?_key|AWS_SECRET(?:_ACCESS)?_KEY)\s*[=:]\s*["']?[A-Za-z0-9/+]{40}["']?/i,
    severity: "critical",
  },
  {
    id: "gcp-api-key",
    label: "Google Cloud API Key",
    pattern: /\bAIza[0-9A-Za-z\-_]{35}\b/,
    severity: "critical",
  },
  // GitHub tokens
  {
    id: "github-pat-classic",
    label: "GitHub Personal Access Token (classic)",
    pattern: /\bghp_[A-Za-z0-9]{36}\b/,
    severity: "critical",
  },
  {
    id: "github-pat-fine",
    label: "GitHub Fine-grained Token",
    pattern: /\bgithub_pat_[A-Za-z0-9_]{82}\b/,
    severity: "critical",
  },
  {
    id: "github-app-token",
    label: "GitHub App/Actions Token",
    pattern: /\b(?:ghs|ghu|ghr)_[A-Za-z0-9]{36}\b/,
    severity: "critical",
  },
  // OpenAI / OpenRouter
  {
    id: "openai-key",
    label: "OpenAI API Key",
    pattern: /\bsk-[A-Za-z0-9]{48}\b/,
    severity: "critical",
  },
  {
    id: "openrouter-key",
    label: "OpenRouter API Key",
    pattern: /\bsk-or-[A-Za-z0-9\-_]{32,}\b/,
    severity: "critical",
  },
  // Auth tokens & JWTs
  {
    id: "jwt",
    label: "JSON Web Token (JWT)",
    pattern: /\beyJ[A-Za-z0-9+/=]{10,}\.[A-Za-z0-9+/=]{10,}\.[A-Za-z0-9+/=_-]{10,}\b/,
    severity: "high",
  },
  {
    id: "bearer-token",
    label: "Bearer Token",
    pattern: /bearer\s+[A-Za-z0-9\-._~+/]{20,}/i,
    severity: "high",
  },
  // Private keys
  {
    id: "private-key-pem",
    label: "PEM Private Key",
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
    severity: "critical",
  },
  // Generic secrets assigned in code/config
  {
    id: "secret-assignment",
    label: "Hardcoded Secret Assignment",
    pattern:
      /(?:password|passwd|secret|api[_-]?key|auth[_-]?token|access[_-]?token|client[_-]?secret)\s*[=:]\s*["'][^"'\s]{8,}["']/i,
    severity: "high",
  },
  // Connection strings with embedded creds
  {
    id: "db-connection-string",
    label: "Database Connection String with Credentials",
    pattern:
      /(?:postgres|mysql|mongodb|redis|amqp):\/\/[^:@\s]+:[^@\s]+@[^\s'"]+/i,
    severity: "critical",
  },
  // Slack
  {
    id: "slack-token",
    label: "Slack Token",
    pattern: /\bxox[bporas]-[0-9A-Za-z\-]{10,}\b/,
    severity: "critical",
  },
  // Stripe
  {
    id: "stripe-key",
    label: "Stripe API Key",
    pattern: /\b(?:sk|pk)_(?:live|test)_[0-9A-Za-z]{24,}\b/,
    severity: "critical",
  },
  // Twilio
  {
    id: "twilio-sid",
    label: "Twilio Account SID",
    pattern: /\bAC[0-9a-fA-F]{32}\b/,
    severity: "high",
  },
  // Sendgrid
  {
    id: "sendgrid-key",
    label: "SendGrid API Key",
    pattern: /\bSG\.[A-Za-z0-9\-_]{22}\.[A-Za-z0-9\-_]{43}\b/,
    severity: "critical",
  },
  // Firebase
  {
    id: "firebase-key",
    label: "Firebase API Key",
    pattern: /\bAAAA[A-Za-z0-9\-_]{7}:[A-Za-z0-9\-_]{140}\b/,
    severity: "critical",
  },
  // Generic high-entropy strings assigned to suspicious variable names
  {
    id: "env-secret",
    label: "Potential Secret in Environment Assignment",
    pattern:
      /(?:^|\s)(?:export\s+)?[A-Z_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL)[A-Z_]*\s*=\s*["']?[A-Za-z0-9+/\-_]{20,}["']?/,
    severity: "medium",
  },
];

function extractAddedLines(patch) {
  if (!patch || patch === "(binary or no diff available)") return [];
  return patch
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1)); // strip leading "+"
}

function severityOrder(s) {
  return { critical: 0, high: 1, medium: 2 }[s] ?? 3;
}

export function scanForSecrets(commitDetails) {
  const findings = [];

  for (const commit of commitDetails) {
    for (const file of commit.files) {
      const addedLines = extractAddedLines(file.patch);

      addedLines.forEach((line, idx) => {
        for (const rule of RULES) {
          if (rule.pattern.test(line)) {
            findings.push({
              severity: rule.severity,
              ruleId: rule.id,
              label: rule.label,
              commit: commit.sha.slice(0, 7),
              commitMessage: commit.commit?.message?.split("\n")[0] ?? commit.message?.split("\n")[0] ?? "",
              date: commit.date,
              file: file.filename,
              linePreview: line.replace(/["'][A-Za-z0-9+/\-_]{8,}["']/g, '"[REDACTED]"').slice(0, 120),
            });
            break; // one finding per line maximum
          }
        }
      });
    }
  }

  findings.sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity));
  return findings;
}

export function formatSecurityReport(findings) {
  if (findings.length === 0) {
    return [
      "## 🔒 SECURITY SCAN",
      "",
      "✅ **No exposed secrets detected** — no hardcoded credentials, tokens, or private keys were found in the added lines of this week's commits.",
      "",
    ].join("\n");
  }

  const critical = findings.filter((f) => f.severity === "critical");
  const high = findings.filter((f) => f.severity === "high");
  const medium = findings.filter((f) => f.severity === "medium");

  const icon = { critical: "🔴", high: "🟠", medium: "🟡" };

  const lines = [
    "## 🔒 SECURITY SCAN",
    "",
    `⚠️  **${findings.length} potential secret exposure(s) detected** — review and rotate any real credentials immediately.`,
    "",
    `| Severity | Count |`,
    `|---|---|`,
    `| 🔴 Critical | ${critical.length} |`,
    `| 🟠 High     | ${high.length} |`,
    `| 🟡 Medium   | ${medium.length} |`,
    "",
    "### Findings",
    "",
  ];

  for (const f of findings) {
    lines.push(
      `#### ${icon[f.severity]} ${f.label}`,
      `- **Severity:** ${f.severity.toUpperCase()}`,
      `- **Commit:** \`${f.commit}\` — ${f.commitMessage}`,
      `- **Date:** ${f.date}`,
      `- **File:** \`${f.file}\``,
      `- **Line preview:** \`${f.linePreview}\``,
      ""
    );
  }

  lines.push(
    "### Recommended Actions",
    "",
    "1. **Rotate every flagged credential immediately** — assume it is compromised once committed, even briefly.",
    "2. Use environment variables or a secrets manager (e.g. AWS Secrets Manager, Vault, Doppler) — never hardcode credentials.",
    "3. Add a pre-commit hook (e.g. `git-secrets`, `gitleaks`, `detect-secrets`) to block future accidental commits.",
    "4. If the repo is public, audit GitHub's *Secret Scanning* alerts under **Security → Secret scanning**.",
    ""
  );

  return lines.join("\n");
}
