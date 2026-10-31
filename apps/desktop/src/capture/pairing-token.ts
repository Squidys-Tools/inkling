import { randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const generateToken = () => randomBytes(32).toString("hex");

export function tokenLooksValid(value: string) {
  const token = value.trim();
  return token.length >= 32 && token.length <= 128 && /^[a-z\d]+$/iu.test(token);
}

async function persistToken(path: string, token: string) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, token, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rename(temporaryPath, path);
    await chmod(path, 0o600).catch(() => {});
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {});
  }
}

async function loadOrGenerateToken(path: string) {
  try {
    const stored = await readFile(path, "utf8");
    if (tokenLooksValid(stored)) {
      await chmod(path, 0o600).catch(() => {});
      return stored.trim();
    }
  } catch {}
  const token = generateToken();
  await persistToken(path, token).catch(() => {});
  return token;
}

export async function openPairingToken(path: string) {
  let token = await loadOrGenerateToken(path);
  return {
    current: () => token,
    async regenerate() {
      const next = generateToken();
      await persistToken(path, next);
      token = next;
      return token;
    },
  };
}
