import { contentEntry } from "./vite.content-base.ts";

// Isolated-world Defuddle extractor -> dist/content-isolated.js (see background.ts).
export default contentEntry("content-isolated", "src/content-isolated.ts", "InklingContentIsolated");
