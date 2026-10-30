import { Tabs } from "@base-ui/react/tabs";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { ReactNode } from "react";
import { cx } from "../../ui/cx";
import type { SettingsTab } from "./useSettings";

const PILL =
  "inline-flex h-[34px] cursor-pointer items-center justify-center gap-2 rounded-full border px-4 py-0 font-body text-[13px]/4 font-normal whitespace-nowrap transition-[scale,background-color,opacity] duration-180 ease-[ease] enabled:active:scale-96 disabled:cursor-not-allowed disabled:opacity-42 motion-reduce:transition-none";

export function pillButton(look: "plain" | "danger" | "solid" = "plain") {
  return cx(
    PILL,
    look === "solid"
      ? "border-ink bg-ink text-surface"
      : "border-[#2e2a26] bg-transparent enabled:hover:bg-glass-active",
    look === "danger" ? "text-accent enabled:hover:border-accent" : look === "plain" && "text-ink",
  );
}

export const SMALL_PILL =
  "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-transparent px-3 py-0 font-body text-[12px]/4 font-normal whitespace-nowrap text-ink-soft transition-[background-color,scale] duration-180 ease-[ease] hover:bg-glass-active active:scale-96 motion-reduce:transition-none";

export const SETTINGS_SCROLL =
  "flex min-h-0 flex-[1_1_auto] flex-col overflow-y-auto pr-[3px] [scrollbar-color:#4a4842_transparent] [scrollbar-width:thin] *:shrink-0";

export const MONO_NOTE = "font-mono text-[12px]/4 font-normal text-muted";

// Licenses opens from General and keeps its tab selected.
export function SettingsPanel({
  tab,
  titleId,
  children,
}: {
  tab: Exclude<SettingsTab, "licenses">;
  titleId: string;
  children: ReactNode;
}) {
  return (
    <Tabs.Panel
      value={tab}
      render={<section />}
      tabIndex={-1}
      className="flex min-h-0 min-w-0 flex-[1_1_auto] flex-col gap-7 rounded-l-frame border border-r-0 border-border bg-frame pt-7 pr-10 pb-8 pl-12 max-[700px]:rounded-none max-[700px]:border-r max-[700px]:px-[18px] max-[700px]:pt-5 max-[700px]:pb-6"
      aria-labelledby={titleId}
    >
      {children}
    </Tabs.Panel>
  );
}

export function SettingsHeader({
  titleId,
  title,
  note,
  before,
  tools,
  onClose,
}: {
  titleId: string;
  title: string;
  note?: ReactNode;
  before?: ReactNode;
  tools?: ReactNode;
  onClose: () => void;
}) {
  const close = (
    <button
      type="button"
      className="inline-grid size-[34px] flex-none cursor-pointer place-items-center rounded-full border border-border bg-transparent text-ink-soft transition-[background-color,color,border-color] duration-180 ease-[ease] hover:bg-surface hover:text-ink [&_svg]:block"
      onClick={onClose}
      aria-label="Close settings"
    >
      <HugeiconsIcon icon={Cancel01Icon} size={14} />
    </button>
  );
  return (
    <header className="flex items-start justify-between gap-6 max-[700px]:flex-wrap">
      <div className="flex min-w-0 flex-[1_1_auto] flex-col gap-2">
        {before}
        <div>
          <h2
            id={titleId}
            className="m-0 font-sans text-[28px]/[34px] font-semibold tracking-[-0.02em] text-ink"
          >
            {title}
          </h2>
        </div>
        {note && (
          <p className="m-0 max-w-[460px] font-body text-[14px]/[21px] font-normal text-muted">
            {note}
          </p>
        )}
      </div>
      {tools ? (
        <div className="flex flex-none items-center gap-2">
          {tools}
          {close}
        </div>
      ) : (
        close
      )}
    </header>
  );
}

export function SettingsRow({
  icon,
  title,
  description,
  children,
  action,
}: {
  icon: IconSvgElement;
  title: string;
  description: ReactNode;
  children?: ReactNode;
  action: ReactNode;
}) {
  return (
    <div className="flex items-center gap-[18px] px-0.5 py-5 [&:not(:last-of-type)]:border-b [&:not(:last-of-type)]:border-[#1e1b19]">
      <span
        className="grid size-9 flex-none place-items-center rounded-[11px] bg-surface-raised text-ink"
        aria-hidden="true"
      >
        <HugeiconsIcon icon={icon} size={17} />
      </span>
      <div className="flex min-w-0 flex-[1_1_auto] flex-col gap-1">
        <h3 className="m-0 font-body text-[15px]/5 font-semibold text-ink">{title}</h3>
        <p className="m-0 font-body text-[13px]/[19px] font-normal text-muted">{description}</p>
        {children}
      </div>
      {action}
    </div>
  );
}

export function SettingsEmptyState({
  icon,
  title,
  children,
}: {
  icon: IconSvgElement;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-[260px] place-items-center content-center rounded-frame border border-[#221f1c] px-6 py-10 text-center">
      <div className="mb-3.5 grid size-[42px] place-items-center rounded-full bg-surface-raised text-muted">
        <HugeiconsIcon icon={icon} size={19} />
      </div>
      <h4 className="m-0 font-sans text-[17px]/[22px] font-semibold text-ink">{title}</h4>
      <p className="mx-0 mt-2 mb-0 max-w-[32ch] font-body text-[13px]/[19px] font-normal text-muted">
        {children}
      </p>
    </div>
  );
}
