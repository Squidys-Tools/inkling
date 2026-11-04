import { projectSeed, seedItems } from "./seed-data.ts";

// The web preview's library: the demo seed in ./seed-demo, plus one item of each
// kind the seed lacks. Image sizes match the files, so cards keep their real proportions.
const files = import.meta.glob<string>("./seed-demo/*", {
  eager: true,
  query: "?url",
  import: "default",
});
const cards = projectSeed(seedItems, (file) => files[`./seed-demo/${file}`]);

export const seedCards = cards.active;
export const seedArchived = cards.archived;
export { seedArticles, seedBodies, seedJobs, seedMembership, seedSpaces } from "./seed-data.ts";
