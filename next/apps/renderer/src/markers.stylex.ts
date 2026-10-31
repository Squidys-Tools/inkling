import * as stylex from "@stylexjs/stylex";

// Markers let a child style itself by its ancestor's state (`stylex.when.ancestor`)
// without descendant selectors. Each hover group gets its own, so a card inside
// the sidebar's hover area cannot react to the wrong one.
export const cardMarker = stylex.defineMarker();
export const tileMarker = stylex.defineMarker();
export const sidebarMarker = stylex.defineMarker();
export const spaceRowMarker = stylex.defineMarker();
