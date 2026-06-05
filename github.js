import { Octokit } from "@octokit/rest";

export function createGitHubClient(token) {
  return new Octokit({ auth: token });
}

export async function fetchCommitsFromPastMonth(octokit, owner, repo) {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const response = await octokit.repos.listCommits({
    owner,
    repo,
    since: since.toISOString(),
    per_page: 100,
  });

  return response.data;
}

export async function fetchCommitDetail(octokit, owner, repo, sha) {
  const response = await octokit.repos.getCommit({
    owner,
    repo,
    ref: sha,
  });

  const commit = response.data;
  const files = commit.files || [];

  const patches = files.map((file) => ({
    filename: file.filename,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    patch: file.patch || "(binary or no diff available)",
  }));

  return {
    sha: commit.sha,
    message: commit.commit.message,
    author: commit.commit.author.name,
    date: commit.commit.author.date,
    stats: commit.stats,
    files: patches,
  };
}

// Files to probe for tech stack detection, in priority order
const STACK_FILES = [
  "package.json",
  "tsconfig.json",
  "next.config.js",
  "next.config.ts",
  "vite.config.js",
  "vite.config.ts",
  "nuxt.config.js",
  "nuxt.config.ts",
  "astro.config.mjs",
  "svelte.config.js",
  "remix.config.js",
  "angular.json",
  "requirements.txt",
  "pyproject.toml",
  "go.mod",
  "Cargo.toml",
  "composer.json",
  "Gemfile",
  "pom.xml",
  "build.gradle",
  "Dockerfile",
  "docker-compose.yml",
  ".nvmrc",
  ".node-version",
];

async function fetchFileContent(octokit, owner, repo, path) {
  try {
    const res = await octokit.repos.getContent({ owner, repo, path });
    if (res.data.encoding === "base64") {
      return Buffer.from(res.data.content, "base64").toString("utf-8");
    }
    return null;
  } catch {
    return null;
  }
}

function parsePackageJson(raw) {
  try {
    const pkg = JSON.parse(raw);
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    return {
      name: pkg.name,
      version: pkg.version,
      scripts: Object.keys(pkg.scripts ?? {}),
      nodeEngine: pkg.engines?.node ?? null,
      packageManager: pkg.packageManager ?? null,
      dependencies: deps,
    };
  } catch {
    return null;
  }
}

export async function fetchTechStack(octokit, owner, repo) {
  const stack = { files: {}, summary: [] };

  for (const path of STACK_FILES) {
    const content = await fetchFileContent(octokit, owner, repo, path);
    if (content) {
      stack.files[path] = content.slice(0, 4000); // cap per file
    }
  }

  // Build a human-readable summary for the prompt
  if (stack.files["package.json"]) {
    const pkg = parsePackageJson(stack.files["package.json"]);
    if (pkg) {
      stack.summary.push(`**Runtime:** Node.js${pkg.nodeEngine ? ` ${pkg.nodeEngine}` : ""}`);
      if (pkg.packageManager) stack.summary.push(`**Package manager:** ${pkg.packageManager}`);

      const fw = [];
      const deps = pkg.dependencies;
      if (deps.includes("next")) fw.push("Next.js");
      if (deps.includes("react")) fw.push("React");
      if (deps.includes("vue")) fw.push("Vue");
      if (deps.includes("nuxt")) fw.push("Nuxt");
      if (deps.includes("svelte")) fw.push("Svelte");
      if (deps.includes("astro")) fw.push("Astro");
      if (deps.includes("@remix-run/node") || deps.includes("@remix-run/react")) fw.push("Remix");
      if (deps.includes("express")) fw.push("Express");
      if (deps.includes("fastify")) fw.push("Fastify");
      if (deps.includes("hono")) fw.push("Hono");
      if (deps.includes("@nestjs/core")) fw.push("NestJS");
      if (deps.includes("@strapi/strapi") || deps.includes("strapi")) fw.push("Strapi CMS");
      if (deps.includes("prisma") || deps.includes("@prisma/client")) fw.push("Prisma ORM");
      if (deps.includes("drizzle-orm")) fw.push("Drizzle ORM");
      if (deps.includes("mongoose")) fw.push("Mongoose");
      if (deps.includes("tailwindcss")) fw.push("Tailwind CSS");
      if (deps.includes("typescript")) fw.push("TypeScript");
      if (deps.includes("jest") || deps.includes("vitest")) fw.push(deps.includes("vitest") ? "Vitest" : "Jest");
      if (deps.includes("@playwright/test")) fw.push("Playwright");
      if (deps.includes("zod")) fw.push("Zod");
      if (deps.includes("trpc") || deps.includes("@trpc/server")) fw.push("tRPC");
      if (deps.includes("graphql")) fw.push("GraphQL");

      if (fw.length) stack.summary.push(`**Frameworks/Libraries:** ${fw.join(", ")}`);
      stack.summary.push(`**All deps (${deps.length}):** ${deps.slice(0, 40).join(", ")}${deps.length > 40 ? "…" : ""}`);
      if (pkg.scripts.length) stack.summary.push(`**Scripts:** ${pkg.scripts.join(", ")}`);
    }
  }

  if (stack.files["tsconfig.json"]) stack.summary.push("**Language:** TypeScript");
  if (stack.files["go.mod"]) stack.summary.push("**Language:** Go");
  if (stack.files["Cargo.toml"]) stack.summary.push("**Language:** Rust");
  if (stack.files["requirements.txt"] || stack.files["pyproject.toml"]) stack.summary.push("**Language:** Python");
  if (stack.files["Gemfile"]) stack.summary.push("**Language:** Ruby");
  if (stack.files["pom.xml"] || stack.files["build.gradle"]) stack.summary.push("**Language:** Java/JVM");
  if (stack.files["composer.json"]) stack.summary.push("**Language:** PHP");
  if (stack.files["Dockerfile"]) stack.summary.push("**Deployment:** Docker");
  if (stack.files["docker-compose.yml"]) stack.summary.push("**Infra:** Docker Compose");

  const detectedFiles = Object.keys(stack.files);
  if (detectedFiles.length) {
    stack.summary.push(`**Config files found:** ${detectedFiles.join(", ")}`);
  }

  return stack;
}

export async function fetchAllCommitDetails(octokit, owner, repo, commits) {
  const results = [];

  for (const commit of commits) {
    process.stdout.write(
      `  Fetching diff for ${commit.sha.slice(0, 7)}: ${commit.commit.message.split("\n")[0].slice(0, 60)}...\n`
    );

    try {
      const detail = await fetchCommitDetail(octokit, owner, repo, commit.sha);
      results.push(detail);
    } catch (err) {
      console.error(`  Failed to fetch commit ${commit.sha.slice(0, 7)}: ${err.message}`);
    }

    // Avoid hitting GitHub secondary rate limits
    await new Promise((r) => setTimeout(r, 200));
  }

  return results;
}
