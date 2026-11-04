// Deploys the marketing site with the Vercel CLI: `bun tools/ci/site-deploy.ts preview|production`.
// Run it from the repository root; the Vercel project's root directory is apps/site.
import { env, gh, summary, type GitHub } from "./github.ts";

const DOMAIN = "getinkling.dev";
const VERCEL_API = "https://api.vercel.com";
const PREVIEW_MARKER = "<!-- inkling-site-preview -->";

// The CLI can print warnings to stdout ahead of the deployment URL.
export function deploymentUrl(output: string) {
  const urls = output
    .split(/\r?\n/)
    .filter((line) => /^https:\/\/[\w.-]+\.vercel\.app$/.test(line));
  if (urls.length !== 1)
    throw new Error(`Expected one deployment URL from Vercel, got ${urls.length}.`);
  return urls[0]!;
}

async function deploy(production: boolean, sha: string) {
  // The CLI reads the project from these; without them it would try to link one interactively.
  env("VERCEL_ORG_ID");
  env("VERCEL_PROJECT_ID");
  const args = ["deploy", "--archive=tgz", "--yes", "--token", env("VERCEL_TOKEN")];
  if (production) args.push("--prod", "--skip-domain");
  const vercel = Bun.spawn(["bunx", "vercel@65.9.0", ...args, "--meta", `githubSha=${sha}`], {
    stdout: "pipe",
    stderr: "inherit",
  });
  const [output, code] = await Promise.all([new Response(vercel.stdout).text(), vercel.exited]);
  console.log(output);
  if (code !== 0) throw new Error(`vercel deploy exited ${code}.`);
  return deploymentUrl(output);
}

export async function vercel<T>(method: string, path: string) {
  const url = `${VERCEL_API}${path}${path.includes("?") ? "&" : "?"}teamId=${env("VERCEL_ORG_ID")}`;
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${env("VERCEL_TOKEN")}` },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${body}`);
  // Promote answers 201 or 202 with no body.
  return (body ? JSON.parse(body) : undefined) as T;
}

// `deploy --prod` exits 0 even when it fails to move the domain, so promote explicitly and wait
// until the domain serves this deployment. The CLI's promote needs a signed-in user, and a
// team-scoped token has none ("User not found"), so this goes through the API.
async function promote(url: string) {
  const { id } = await vercel<{ id: string }>("GET", `/v13/deployments/${new URL(url).host}`);
  await vercel("POST", `/v10/projects/${env("VERCEL_PROJECT_ID")}/promote/${id}`);
  for (let attempt = 0; attempt < 30; attempt++) {
    const { deploymentId } = await vercel<{ deploymentId: string }>("GET", `/v4/aliases/${DOMAIN}`);
    if (deploymentId === id) return summary(`${DOMAIN} serves ${url}`);
    await Bun.sleep(10_000);
  }
  throw new Error(`${DOMAIN} still does not point at ${id}.`);
}

export async function upsertComment(api: GitHub, pr: number, marker: string, body: string) {
  const comments = await api.list<{ id: number; body?: string }>(
    `repos/{owner}/{repo}/issues/${pr}/comments?per_page=100`,
  );
  const existing = comments.find((comment) => comment.body?.includes(marker));
  const text = `${marker}\n${body}`;
  if (existing)
    await api.send("PATCH", `repos/{owner}/{repo}/issues/comments/${existing.id}`, { body: text });
  else await api.send("POST", `repos/{owner}/{repo}/issues/${pr}/comments`, { body: text });
}

if (import.meta.main) {
  const target = process.argv[2];
  if (target === "production") {
    await promote(await deploy(true, env("GITHUB_SHA")));
  } else if (target === "preview") {
    const sha = env("PR_HEAD_SHA");
    const url = await deploy(false, sha);
    const run = `${env("GITHUB_SERVER_URL")}/${env("GITHUB_REPOSITORY")}/actions/runs/${env("GITHUB_RUN_ID")}`;
    await summary(`### Marketing site preview\n\n${url}`);
    await upsertComment(
      gh,
      Number(env("PR_NUMBER")),
      PREVIEW_MARKER,
      `### Marketing site preview\n\n[Open preview](${url}) for commit \`${sha}\`.\n\n[Build details](${run})`,
    );
  } else {
    console.error("usage: bun tools/ci/site-deploy.ts preview|production");
    process.exit(64);
  }
}
