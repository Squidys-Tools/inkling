import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps } from "react";

// coss ui's Breadcrumb, minus Tailwind: the same nav > ol > li structure and
// slots, styled in App.css under .breadcrumb-*. Only the parts inkling uses.

export function Breadcrumb(props: ComponentProps<"nav">) {
  return <nav aria-label="breadcrumb" data-slot="breadcrumb" {...props} />;
}

export function BreadcrumbList({ className, ...props }: ComponentProps<"ol">) {
  return (
    <ol
      className={`breadcrumb-list${className ? ` ${className}` : ""}`}
      data-slot="breadcrumb-list"
      {...props}
    />
  );
}

export function BreadcrumbItem({ className, ...props }: ComponentProps<"li">) {
  return (
    <li
      className={`breadcrumb-item${className ? ` ${className}` : ""}`}
      data-slot="breadcrumb-item"
      {...props}
    />
  );
}

export function BreadcrumbPage({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      aria-current="page"
      className={`breadcrumb-page${className ? ` ${className}` : ""}`}
      data-slot="breadcrumb-page"
      {...props}
    />
  );
}

export function BreadcrumbSeparator({ children, className, ...props }: ComponentProps<"li">) {
  return (
    <li
      aria-hidden="true"
      className={`breadcrumb-separator${className ? ` ${className}` : ""}`}
      data-slot="breadcrumb-separator"
      role="presentation"
      {...props}
    >
      {children ?? <HugeiconsIcon icon={ArrowRight01Icon} size={14} />}
    </li>
  );
}
