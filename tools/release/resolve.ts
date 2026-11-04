// Picks the commit and channel a Release run builds, and whether a scheduled run ships.
// Nightlies and tag pushes build the triggering commit. A dispatched stable builds the latest
// published nightly's commit, so stable only ships a build nightly users already ran.
import { env, gh, setOutputs, type GitHub } from "../ci/github.ts";

type Channel = "stable" | "nightly" | "preview";
type Release = { tag_name: string; draft: boolean; published_at: string | null };
type Comparison = { status: "ahead" | "behind" | "identical" | "diverged" };

export type Trigger = {
  event: string;
  ref: string;
  sha: string;
  defaultBranch: string;
  dispatchChannel?: string;
};

// Nightlies ship in 8-hour slots that open at midnight, 8am and 4pm EST
// (05:00, 13:00 and 21:00 UTC); the first tick that finds its slot unreleased ships it.
const SLOT_MS = 8 * 60 * 60 * 1000;
const FIRST_SLOT_MS = Date.UTC(2026, 0, 1, 5);
const NIGHTLY_TAG = /^v(\d+\.\d+\.\d+)-nightly\./;

const slotStart = (now: number) =>
  FIRST_SLOT_MS + Math.floor((now - FIRST_SLOT_MS) / SLOT_MS) * SLOT_MS;

const compare = (api: GitHub, base: string, head: string) =>
  api.get<Comparison>(`repos/{owner}/{repo}/compare/${base}...${head}?per_page=1`);

async function assertOnDefaultBranch(api: GitHub, sha: string, defaultBranch: string) {
  const { status } = await compare(api, sha, defaultBranch);
  if (status !== "ahead" && status !== "identical")
    throw new Error(`Release commit ${sha} is not contained in ${defaultBranch} (${status}).`);
}

async function latestNightly(api: GitHub) {
  const releases = await api.list<Release>("repos/{owner}/{repo}/releases?per_page=100");
  return releases
    .filter(
      (release) => !release.draft && release.published_at && NIGHTLY_TAG.test(release.tag_name),
    )
    .sort((a, b) => Date.parse(b.published_at!) - Date.parse(a.published_at!))[0];
}

async function nightlyDue(api: GitHub, sha: string, now: number) {
  const last = await latestNightly(api);
  if (!last) return true;
  if (Date.parse(last.published_at!) >= slotStart(now)) {
    console.log(`${last.tag_name} already shipped in this slot.`);
    return false;
  }
  const { status } = await compare(api, last.tag_name, sha);
  console.log(`${sha} is ${status} relative to ${last.tag_name}.`);
  return status === "ahead";
}

function channelOf(trigger: Trigger): Channel {
  if (trigger.event === "schedule") return "nightly";
  if (trigger.event !== "workflow_dispatch") return "stable";
  const channel = trigger.dispatchChannel || "preview";
  if (channel !== "stable" && channel !== "nightly" && channel !== "preview")
    throw new Error(`Unsupported release channel: ${channel}`);
  return channel;
}

export async function resolveRelease(api: GitHub, trigger: Trigger, now = Date.now()) {
  const channel = channelOf(trigger);
  const result = { channel, ref: trigger.sha, due: true, nightlyVersion: "" };
  if (channel === "preview") return result;

  if (
    trigger.event === "workflow_dispatch" &&
    trigger.ref !== `refs/heads/${trigger.defaultBranch}`
  )
    throw new Error(
      `${channel} releases must be dispatched from ${trigger.defaultBranch}; selected ${trigger.ref}. Use the preview channel for branch builds.`,
    );
  await assertOnDefaultBranch(api, trigger.sha, trigger.defaultBranch);

  if (trigger.event === "schedule")
    return { ...result, due: await nightlyDue(api, trigger.sha, now) };
  if (trigger.event !== "workflow_dispatch" || channel !== "stable") return result;

  const nightly = await latestNightly(api);
  if (!nightly)
    throw new Error("No published nightly found. Stable releases build the latest nightly commit.");
  const { sha } = await api.get<{ sha: string }>(
    `repos/{owner}/{repo}/commits/${nightly.tag_name}`,
  );
  await assertOnDefaultBranch(api, sha, trigger.defaultBranch);
  console.log(`Stable builds ${sha}, the commit ${nightly.tag_name} shipped.`);
  return { ...result, ref: sha, nightlyVersion: NIGHTLY_TAG.exec(nightly.tag_name)![1]! };
}

if (import.meta.main) {
  const { channel, ref, due, nightlyVersion } = await resolveRelease(gh, {
    event: env("GITHUB_EVENT_NAME"),
    ref: env("GITHUB_REF"),
    sha: env("GITHUB_SHA"),
    defaultBranch: env("DEFAULT_BRANCH"),
    dispatchChannel: process.env.DISPATCH_CHANNEL,
  });
  await setOutputs({ channel, ref, due: String(due), nightly_version: nightlyVersion });
}
