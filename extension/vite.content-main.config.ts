import { contentEntry } from "./vite.content-base.ts";

// MAIN-world shadow-DOM stamper -> dist/content-main.js (see background.ts).
export default contentEntry("content-main", "src/content-main.ts", "InklingContentMain");
