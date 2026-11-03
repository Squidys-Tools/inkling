// Creates the release tag at the commit being released, before the release
// exists, so a stable draft already has its tag. A tag that exists must point at
// that commit; a rerun reuses the tag an earlier attempt made.
async function ensureReleaseTag({ github, context, tag, sha }) {
  const ref = `tags/${tag}`;
  let existing;
  try {
    ({ data: existing } = await github.rest.git.getRef({ ...context.repo, ref }));
  } catch (error) {
    if (error.status !== 404) throw error;
  }

  if (!existing) {
    await github.rest.git.createRef({ ...context.repo, ref: `refs/${ref}`, sha });
    return "created";
  }

  let target = existing.object.sha;
  if (existing.object.type === "tag") {
    const { data: annotated } = await github.rest.git.getTag({ ...context.repo, tag_sha: target });
    target = annotated.object.sha;
  }
  if (target !== sha) {
    throw new Error(`Tag ${tag} points at ${target}, not the release commit ${sha}.`);
  }
  return "already existed";
}

module.exports = { ensureReleaseTag };
