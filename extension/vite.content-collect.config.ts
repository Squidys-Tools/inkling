import { contentEntry } from "./vite.content-base.ts";

// Collector entry (selection / image / video) -> dist/content-collect.js.
// Injected on invoke by background.ts so no script runs on every page the user
// visits; see background.ts for the injection site.
export default contentEntry("content-collect", "content.js", "InklingContentCollect");
