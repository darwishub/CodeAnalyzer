import "dotenv/config";
import fs from "fs/promises";
import {
  createGitHubClient,
  fetchCommitsFromPastMonth,
  fetchAllCommitDetails,
  fetchTechStack,
} from "./github.js";
import { analyzeCommits, computeSessions } from "./analyzer.js";
import { scanForSecrets, formatSecurityReport } from "./security.js";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ Missing required environment variable: ${name}`);
    console.error(`   Add it to your .env file. See .env.example for reference.`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const GITHUB_TOKEN = requireEnv("GITHUB_TOKEN");
  const GITHUB_USERNAME = requireEnv("GITHUB_USERNAME");
  const GITHUB_REPO = requireEnv("GITHUB_REPO");
  const OPENROUTER_API_KEY = requireEnv("OPENROUTER_API_KEY");

  console.log(`\n🔍 CodeAnalyzer — GitHub Commit Analysis`);
  console.log(`   Repository: ${GITHUB_USERNAME}/${GITHUB_REPO}`);
  console.log(`   Period: past 30 days\n`);

  // --- Step 1: Fetch commits ---
  console.log("📡 Fetching commits from GitHub...");
  const octokit = createGitHubClient(GITHUB_TOKEN);

  let commits;
  try {
    commits = await fetchCommitsFromPastMonth(octokit, GITHUB_USERNAME, GITHUB_REPO);
  } catch (err) {
    console.error(`❌ Failed to fetch commits: ${err.message}`);
    process.exit(1);
  }

  if (commits.length === 0) {
    console.log("ℹ️  No commits found in the past 30 days. Nothing to analyze.");
    process.exit(0);
  }

  console.log(`✅ Found ${commits.length} commit(s)\n`);

  // --- Step 2: Detect tech stack ---
  console.log("🛠️  Detecting tech stack...");
  let techStack = { summary: [], files: {} };
  try {
    techStack = await fetchTechStack(octokit, GITHUB_USERNAME, GITHUB_REPO);
    const detected = Object.keys(techStack.files);
    console.log(`   Found: ${detected.length ? detected.join(", ") : "no config files detected"}\n`);
  } catch (err) {
    console.warn(`   Warning: tech stack detection failed — ${err.message}\n`);
  }

  // --- Step 3: Fetch diffs ---
  console.log("📥 Fetching commit diffs...");
  let commitDetails;
  try {
    commitDetails = await fetchAllCommitDetails(octokit, GITHUB_USERNAME, GITHUB_REPO, commits);
  } catch (err) {
    console.error(`❌ Failed to fetch commit details: ${err.message}`);
    process.exit(1);
  }

  console.log(`\n✅ Loaded ${commitDetails.length} commit diff(s)\n`);
;

  // --- Step 3: Security scan (local, no API call) ---
  console.log("🔒 Running security scan for exposed secrets...");
  const securityFindings = scanForSecrets(commitDetails);
  const securitySection = formatSecurityReport(securityFindings);
  if (securityFindings.length === 0) {
    console.log("   ✅ No secrets detected\n");
  } else {
    const critical = securityFindings.filter((f) => f.severity === "critical").length;
    const high = securityFindings.filter((f) => f.severity === "high").length;
    const medium = securityFindings.filter((f) => f.severity === "medium").length;
    console.log(
      `   ⚠️  ${securityFindings.length} finding(s): ${critical} critical, ${high} high, ${medium} medium\n`
    );
  }

  // --- Step 5: Compute sessions (accurate, code-derived) ---
  const sessions = computeSessions(commitDetails);

  // --- Step 6: Analyze with LLM ---
  console.log("🤖 Sending to AI for analysis (this may take 15–30 seconds)...\n");
  let report;
  try {
    report = await analyzeCommits(OPENROUTER_API_KEY, commitDetails, techStack, sessions);
  } catch (err) {
    console.error(`❌ LLM analysis failed: ${err.message}`);
    process.exit(1);
  }

  // --- Step 7: Output result ---
  const techStackSection = techStack.summary.length
    ? `## 🛠️ TECH STACK\n\n${techStack.summary.join("\n")}\n`
    : "";

  const header = [
    "# CodeAnalyzer Result",
    `Generated: ${new Date().toLocaleString()}`,
    `Repository: ${GITHUB_USERNAME}/${GITHUB_REPO}`,
    "",
  ].join("\n");

  const fullReport = `${header}\n${techStackSection}\n---\n\n${securitySection}\n---\n\n${report}`;

  console.log("─".repeat(60));
  console.log(securitySection);
  console.log(report);
  console.log("─".repeat(60));

  const reportPath = "./result.md";
  await fs.writeFile(reportPath, fullReport, "utf-8");
  console.log(`\n✅ Result saved to ${reportPath}\n`);
}

main();
