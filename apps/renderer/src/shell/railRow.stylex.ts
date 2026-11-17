import * as stylex from "@stylexjs/stylex";

// Every sidebar row's height. The sidebar sets it taller for the rail from the moment it closes,
// so open and rail rows match at the swap and the change glides with the rest of the layout.
export const railRow = stylex.defineVars({ height: "36px" });
