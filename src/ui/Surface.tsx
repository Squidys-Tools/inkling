import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import "./Surface.css";

// `liquid` surfaces are drawn by LiquidGlass when they sit in one of its target
// roots over the canvas. Everywhere else, and without WebGPU, the CSS glass shows.
export function glassClass(liquid: boolean) {
  return liquid ? "glass" : "css-glass";
}

export function Surface({
  liquid = false,
  render,
  ...props
}: useRender.ComponentProps<"div"> & { liquid?: boolean }) {
  return useRender({
    defaultTagName: "div",
    render,
    props: mergeProps<"div">({ className: glassClass(liquid) }, props),
  });
}
