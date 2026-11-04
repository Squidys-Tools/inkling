// Creates the release tag at the release commit before the release exists, so a stable draft
// already has its tag. A rerun reuses the tag an earlier attempt made; any other commit fails.
import { env, gh, type GitHub } from "../ci/github.ts";

type Ref = { ref: string; object: { sha: string; type: string } };

export async function ensureReleaseTag(api: GitHub, tag: string, sha: string) {
  // matching-refs is a prefix match (v0.1.1 also finds v0.1.10) and returns [] instead of a 404.
  const refs = await api.get<Ref[]>(`repos/{owner}/{repo}/git/matching-refs/tags/${tag}`);
  const existing = refs.find((ref) => ref.ref === `refs/tags/${tag}`);
  if (!existing) {
    await api.send("POST", "repos/{owner}/{repo}/git/refs", { ref: `refs/tags/${tag}`, sha });
    return "created";
  }
  let target = existing.object.sha;
  if (existing.object.type === "tag")
    ({ sha: target } = (await api.get<Ref>(`repos/{owner}/{repo}/git/tags/${target}`)).object);
  if (target !== sha)
    throw new Error(`Tag ${tag} points at ${target}, not the release commit ${sha}.`);
  return "already existed";
}

if (import.meta.main) {
  const [tag, sha] = [env("RELEASE_TAG"), env("RELEASE_COMMIT")];
  console.log(`Release tag ${tag} ${await ensureReleaseTag(gh, tag, sha)} at ${sha}.`);
}
