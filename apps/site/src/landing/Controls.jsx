// Adapted from shadcn/ui Button, Tabs and Accordion (MIT), keeping Radix's
// native props, Slot semantics, roving focus and disclosure associations.
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import * as Accordion from "@radix-ui/react-accordion";
export const Button = React.forwardRef(function Button(
  {
    asChild = false,
    variant = "primary",
    size = "default",
    secondary = false,
    className = "",
    type,
    ...props
  },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : type || "button"}
      data-control="button"
      data-variant={secondary ? "secondary" : variant}
      data-size={size}
      className={`button tactile-button ${className}`}
      {...props}
    />
  );
});
export function Questions({ items, defaultValue }) {
  return (
    <Accordion.Root
      type="single"
      collapsible
      defaultValue={defaultValue}
      className="questions control-disclosures"
    >
      {items.map(({ id, title, body }) => (
        <Accordion.Item className="question" key={id} value={id}>
          <Accordion.Header>
            <Accordion.Trigger className="question-trigger">
              <span className="question-label">{title}</span>
              <span className="question-chevron" aria-hidden="true">
                <svg
                  className="disclosure-disc"
                  width="36"
                  height="36"
                  viewBox="0 0 36 36"
                  fill="none"
                >
                  <circle className="disclosure-ground" cx="18" cy="18" r="18" />
                  <path
                    className="disclosure-mark"
                    d="m12 15 6 6 6-6"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="question-content">
            <p>{body}</p>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
