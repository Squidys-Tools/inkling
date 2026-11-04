import { $ } from "bun";
import { appendFile } from "node:fs/promises";

// Paths use gh's `{owner}/{repo}` placeholders, which gh fills from GH_REPO.
export type GitHub = {
  get<T>(path: string): Promise<T>;
  list<T>(path: string): Promise<T[]>;
  send(method: "POST" | "PATCH" | "DELETE", path: string, body?: object): Promise<void>;
};

export const gh: GitHub = {
  get: async (path) => $`gh api ${path}`.json(),
  list: async <T>(path: string) =>
    ((await $`gh api --paginate --slurp ${path}`.json()) as T[][]).flat(),
  send: async (method, path, body = {}) => {
    await $`gh api --method ${method} ${path} --input - < ${new Response(JSON.stringify(body))}`.text();
  },
};

export function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

export async function setOutputs(outputs: Record<string, string>) {
  const lines = Object.entries(outputs).map(([key, value]) => `${key}=${value}\n`);
  console.log(lines.join("").trim());
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, lines.join(""));
}

export async function summary(markdown: string) {
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}
