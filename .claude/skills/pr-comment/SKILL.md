---
name: pr-comment
description: >
  Decide whether a pull request comment is warranted and write it if so. Use
  when an agent is about to post, update, or reply with a GitHub PR comment,
  PR review, or review-thread reply on my behalf. Covers what is worth
  reporting, what to leave in the conversation instead, the shape and length
  budget for the four comment types I accept, and how PR bodies and review
  replies should read.
argument-hint: <pr number or url>
---

# PR comments and PR bodies

I do not want agents talking on my PR timelines. Most of what gets posted there
is narration I can already see, and it costs me a scrollback read every time.
Read this before the first `gh pr comment`, not after.

## Does this comment need to exist

Post a comment only for one of these four, and nothing else:

1. A finding you need me to act on.
2. A written reason for dismissing a review-bot finding.
3. A correction to a tracker item or the roadmap.
4. A blocker only I can unblock.

If it is not one of those, it goes in our conversation. That is not a demotion.
The conversation is the working log; the timeline is the record; the record is
already complete without you.

## What never gets posted

- Intermediate progress. "Second pass", "found two more bugs", "re-measuring".
- Measurement methodology. The numbers belong in a test, a comment in the code,
  or the conversation. The method that produced them is not a review artifact.
- What you tried and discarded, and why an approach did not work. I want that
  when we are deciding a direction together, in the conversation.
- Why you did not attach evidence. Attach it or leave it off. Do not post a note
  about the omission.
- A restatement of the PR body, a checklist, or the model and harness slug.
- A bot ping. `@greptileai review` and friends. The bots re-review on their own
  schedule and retriggering them spends my money.
- A file path, command, or log pasted raw. If a tool call failed and you cannot
  recover the content, say so in the conversation. Do not post the path you
  meant to post the contents of.

## Shape of a comment that is warranted

Say the finding, the evidence, and what you want from me. Three lines is a
complete comment.

```
<one-line finding, with file:line>
<why it is wrong or what breaks, one sentence>
<what you need from me, one sentence>
```

Cap: 200 words, one finding per item. When there are more than about
three findings, they belong in the review thread where they were raised, or a
Linear comment, not a new top-level comment. Never mirror a Linear thread onto
GitHub. Reply in the thread.

For a dismissal, write the reason only. The finding already explains itself.

```
<bot's finding in one clause>
<why it does not apply here, one sentence>
```

For a tracker or roadmap correction, one line naming the item and the delta.

## The body is where the real information goes

A comment is the wrong tool for anything that belongs in the PR description.
Move it there instead of asking me to read a timeline.

The body has four sections, in this order:

- **Problem.** What is broken, in a sentence or two, and how to see it. Include
  the reproduction steps when there are any. Say which of two disagreeing
  surfaces is the wrong one.
- **Change.** How this fixes it. When the change spans several files, explain
  why each one is needed for the same fix rather than listing them.
- **Scope.** Why this is the right size. For anything that is not a small
  obvious fix, state up front whether it needed approval, and link it.
- **Verification.** What you ran and what you observed, then one sentence for
  what you did not check.
- Last line: the model and harness that did the work.

There is **no line-count or file-count cutoff**. A big change gets a longer
body, never a thinner one. Dropping a fact to hit a length target costs me more
than reading four paragraphs, because then I cannot tell whether it is covered.
What I want from a large change is the same four sections plus the scope
justification up front, so I can judge the size before I read the diff.

### How the writing should read

Prose paragraphs, not a bullet list of bullets. A section that lists three
sub-points and then explains each one is longer than the paragraph that would
have said it. Bullets are for things that are genuinely parallel: checkboxes,
file lists, before/after pairs.

Concretely:

- Claim and consequence, not narrative. "The panel and the sidebar disagree, and
  the panel is the one that is wrong" beats a paragraph setting up that the
  panel derives liveness differently from the sidebar.
- Numbers you actually measured, with the observed value. "31m 37s and climbing"
  and "12 settled" are evidence. "Confirmed fixed" is not.
- Name the signal, not the intent. "One signal now drives all three surfaces, so
  they cannot disagree" is a reason. "This keeps things consistent" is a slogan.
- Say what you did not check in one sentence, folded into Verification. "I did
  not add a unit test. The change is one condition inside a component, and the
  fold's interruption behavior already has tests. I did not test mobile, because
  it has no Agents panel." That is the whole caveat report. It does not get
  its own section, and it does not become a list.
- One-line sign-off. "Done with Claude Opus 5.5 in Claude Code, running inside T3
  Code." Nothing about the methodology behind it.

## Where the data already lives

Before writing anything, check whether it is already recorded somewhere the
reviewer can reach:

- **The session transcript.** Most harnesses stamp a trail link into the PR body
  automatically. Check the body before assuming narration is missing. If the
  body already has a trail link, progress commentary is a duplicate of it.
- **The tracker issue.** Findings that belong to the issue rather than the diff
  go on the issue, once, not on the PR.
- **The code.** A measurement that matters is an assertion in a test or a note
  next to the code, not a paragraph on a PR.

If you cannot find a reason to post, the answer is to not post.

## Length discipline

| Kind | Budget |
| --- | --- |
| Finding for me to act on | 3 lines |
| Bot dismissal | 2 lines |
| Tracker correction | 1 line |
| Blocker | 3 lines |
| PR body | no ceiling |

If a comment does not fit its budget, it is either a conversation message or it
is not a finding. Do not add a summary, a "not verified" section, or a closing
note to stretch a short comment into a long one.