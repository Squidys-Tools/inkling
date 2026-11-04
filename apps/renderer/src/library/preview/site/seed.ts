import { projectSeed } from "../seed-data.ts";
import { seedItems } from "./seed-data.ts";

// Stands in for ../seed.ts in the site demo build; see siteDemo in apps/renderer/vite.config.ts.
const files = import.meta.glob<string>("./*.jpg", {
  eager: true,
  query: "?url",
  import: "default",
});
const cards = projectSeed(seedItems, (file) => files[`./${file}`]);

export const seedCards = cards.active;
export const seedArchived = cards.archived;
export { seedArticles, seedBodies, seedJobs, seedMembership, seedSpaces } from "./seed-data.ts";
