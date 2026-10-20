---
name: land
description: Find and rank the next useful issue from the repository plan and issue tracker, or take a named issue through implementation, verification, and a mergeable pull request.
---

# land

Use this skill when the user asks what to work on next, asks to land work, or names an issue they want completed. Ground recommendations in the repository and its tracker. Never invent tasks.

## Choose the entry path

- If the user names an issue, load it and proceed to the issue workflow. Still check repository docs for current intent and whether the work is already done or stale.
- If the user asks what to do next, use discovery and ranking below. Return the ranked list and let the user choose before implementing an issue, unless they explicitly ask you to proceed with the top recommendation.
- If the user names several issues, rank them in order of dependency for which needs to be completed first, then complete the ones they selected sequentially.

## Discover and rank work

Read relevant local guidance and planning docs first: `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, roadmaps, plans, TODOs, changelogs, and docs mentioning milestones, remaining work(perhaps telling from the worktree or branch name), skipped checks, or in-progress work. Use `rg` to find likely files and terms. Record what's shipped, explicitly planned, half-built, or stale. If you happen to notice anything in the docs that are stale and already implemented, identify them and then tell the user in your final response whether you they would like them updated and commited with the rest of the work.

Use Linear by default. Resolve the team or project from repository remotes, local guidance, and issue keys in docs. If the repository is GitHub-only and no matching Linear project exists, use GitHub issues. Read enough issue details and relations to establish status, priority, blockers, and scope. Inspect the top candidates, up to three, in full.

Rank candidates using these signals, in order:

1. An explicit item in the current roadmap milestone.
2. In-progress work that continues the current branch or feature.
3. An unblocked high-priority issue that fills a documented gap.
4. Broken or partial work that the roadmap already calls for.
5. Chores or polish when no higher-value work is open.

Within a group, prefer work already started, then unblocked Urgent, High, and Medium issues. Skip work marked done in both docs and tracker. When docs and tracker disagree, trust tracker status and docs for intent, and mention the discrepancy. Exclude genuinely blocked work unless the user specifies that's what they want to focus on, and label the blocker clearly.

For a discovery request(default), respond briefly:

## Recommended next

For each recommendation, include:

- Issue and why it ranks here, with a link to its tracker entry.
- Relevant repository source, with a path and line when possible.
- Two to five concrete steps in bullets and a clear done condition.
- A skip condition only when it helps the user decide.

Show one primary recommendation unless the user asks for options. Keep the primary recommendation under about 15 lines. If docs and tracker have no useful work, say so and offer to draft a roadmap from recent commits and open PRs.

## Complete the selected issue

Use the issue description and any acceptance criteria to define scope. Read its full description, acceptance criteria, subissues, relations, labels, status, and blockers. Check repository planning docs and current code to tell completed work from stale plans. Do not redo work already shipped. If the issue is too vague to implement safely, identify the specific missing decision and ask once; otherwise proceed without a plan approval step.

Stop when a real dependency blocks progress. Continue if the dependency is already resolved, and mention any remaining risk. Do not contact people through email, chat, or other messaging tools unless the user explicitly asks.

Set up the work in the current repository and worktree. Read applicable `AGENTS.md` instructions, inspect the current branch and working tree, follow local branch naming, and use the right base. Preserve unrelated user changes. Make the smallest change that meets the acceptance criteria. Add or update tests where the project has coverage at that layer, and update docs when the behavior they describe changes.

Verify the changed behavior using the repository's relevant checks. Run typecheck and lint, then relevant unit and integration tests, and use any project verification skill for UI or CLI paths. For user-visible behavior, verify the actual path, not only a build. Fix failures caused by the change. Report pre-existing failures with the command and useful output. Never claim checks that were not run.

Prepare a pull request that is ready to merge. Follow repository and harness conventions. Include the issue(s) link(s) at the top of the PR body, then a concise summary and test plan. Push the branch and open or update the PR when the user requests and the environment permits it. Link the PR to the tracker issue through its integration when available. Check the actual PR state and required checks; report mergeability only when confirmed. If checks or conflicts prevent mergeability, fix them where in scope or state plainly exactly what remains.

Do not mark an issue Done merely because a PR is open. Move it to the team's review state when appropriate. Mark it Done and leave a short factual tracker comment only after the PR is merged or the user confirms completion. List deferred scope as follow-up work.

## Finish with

For discovery requests, return the ranked recommendation(s) in the format above. If you found stale docs, identify them and ask whether the user wants them updated and included with the selected issue's work.

For completed issue work, report:

- PR: URL, or `local only` with the reason no PR was opened.
- Mergeability: confirmed state and any outstanding check or blocker.
- Verified: commands run and results, including relevant manual verification.
- Follow-ups: concise bullets or `none`.

If blocked, put the blocker in the first line. Skip a session recap.
