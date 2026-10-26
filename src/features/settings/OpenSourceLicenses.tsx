import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { ThirdPartyLicense } from "../../../scripts/third-party-licenses/collect.mjs";
import { cx } from "../../ui/cx";
import { LicenseFilter } from "./LicenseFilter";
import { MONO_NOTE, SETTINGS_SCROLL, SettingsHeader, SettingsPanel } from "./SettingsPanel";

// Written beside index.html at build time by the plugin in vite.config.ts.
// Fetched once, on first open, so the notices never weigh on startup.
let licenses: Promise<ThirdPartyLicense[]> | undefined;

function loadLicenses() {
  licenses ??= fetch(new URL("third-party-licenses.json", document.baseURI)).then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json() as Promise<ThirdPartyLicense[]>;
  });
  licenses.catch(() => {
    licenses = undefined;
  });
  return licenses;
}

type Props = {
  onBack: () => void;
  onClose: () => void;
};

export function OpenSourceLicenses({ onBack, onClose }: Props) {
  const [entries, setEntries] = useState<ThirdPartyLicense[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [licenseFilter, setLicenseFilter] = useState<ReadonlySet<string>>(new Set());
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    let active = true;
    loadLicenses().then(
      (loaded) => active && setEntries(loaded),
      () => active && setFailed(true),
    );
    return () => {
      active = false;
    };
  }, []);

  // Most common first, so MIT and friends sit at the top of the filter.
  const licenseCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries ?? [])
      counts.set(entry.license, (counts.get(entry.license) ?? 0) + 1);
    return [...counts].sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
  }, [entries]);

  const shown = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    if (!entries || (!needle && licenseFilter.size === 0)) return entries;
    return entries.filter(
      (entry) =>
        (licenseFilter.size === 0 || licenseFilter.has(entry.license)) &&
        [entry.name, entry.version, entry.license].some((field) =>
          field?.toLowerCase().includes(needle),
        ),
    );
  }, [entries, deferredQuery, licenseFilter]);

  return (
    <SettingsPanel tab="general" titleId="licenses-panel-title">
      <SettingsHeader
        titleId="licenses-panel-title"
        title="Open source licenses"
        note="inkling is built on the work of these projects. Their licenses travel with it."
        before={
          <button
            type="button"
            className="-mt-1.5 mr-0 mb-0.5 -ml-2 inline-flex cursor-pointer items-center gap-1 self-start rounded-full border-0 bg-transparent py-1 pr-2.5 pl-1.5 font-body text-[12px]/4 font-normal text-muted transition-[background-color,color] duration-180 ease-[ease] hover:bg-glass-active hover:text-ink"
            onClick={onBack}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={14} />
            General
          </button>
        }
        onClose={onClose}
      />

      <div className="-mb-4 flex items-center gap-2.5">
        <span className={cx(MONO_NOTE, "mr-auto")}>
          {!entries
            ? failed
              ? ""
              : "Loading…"
            : shown && shown.length !== entries.length
              ? `${shown.length} of ${entries.length} notices`
              : `${entries.length} notices`}
        </span>
        <LicenseFilter
          counts={licenseCounts}
          selected={licenseFilter}
          onChange={setLicenseFilter}
          disabled={!entries}
        />
        <label className="flex h-[34px] w-[min(260px,50%)] items-center gap-2 rounded-full border border-[#2e2a26] px-3 py-0 text-muted transition-[border-color] duration-180 ease-[ease] focus-within:border-[#4a443d]">
          <HugeiconsIcon icon={Search01Icon} size={14} />
          <input
            type="search"
            className="min-w-0 flex-[1_1_auto] border-0 bg-transparent font-body text-[13px]/4 font-normal text-ink placeholder:text-[#5e5850]"
            placeholder="Name, version, or license"
            aria-label="Search licenses"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={!entries}
          />
        </label>
      </div>

      <div className={SETTINGS_SCROLL}>
        {failed && (
          <p className={EMPTY}>The license list didn't load. Reopen settings to try again.</p>
        )}
        {shown?.length === 0 && (
          <p className={EMPTY}>
            {query.trim() ? `Nothing matches “${query}”.` : "No notices under that license."}
          </p>
        )}
        {shown && shown.length > 0 && (
          <ul className="m-0 list-none p-0">
            {shown.map((entry) => {
              const id = `${entry.name}@${entry.version ?? ""}`;
              const isOpen = openId === id;
              return (
                <li
                  key={id}
                  className="border-b border-[#1e1b19] [contain-intrinsic-size:auto_45px] [content-visibility:auto]"
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="flex min-w-0 flex-[1_1_auto] cursor-pointer items-baseline gap-2.5 border-0 bg-transparent px-0.5 py-[13px] text-left text-ink"
                      aria-expanded={isOpen}
                      onClick={() => setOpenId(isOpen ? null : id)}
                    >
                      <HugeiconsIcon
                        icon={ArrowRight01Icon}
                        size={13}
                        className={cx(
                          "flex-none self-center text-muted transition-[rotate] duration-180 ease-[ease]",
                          isOpen && "rotate-90",
                        )}
                      />
                      <span className="min-w-0 overflow-hidden font-body text-[14px]/[18px] font-medium text-ellipsis whitespace-nowrap">
                        {entry.name}
                      </span>
                      {entry.version && (
                        <span className={cx(MONO_NOTE, "flex-none")}>{entry.version}</span>
                      )}
                      <span className="ml-auto min-w-0 overflow-hidden font-mono text-[11px]/4 font-normal text-ellipsis whitespace-nowrap text-ink-soft">
                        {entry.license}
                      </span>
                    </button>
                    {entry.sourceUrl && (
                      <a
                        className="inline-grid size-[34px] flex-none cursor-pointer place-items-center rounded-lg border border-transparent bg-transparent text-muted transition-[background-color,color,border-color] duration-180 ease-[ease] hover:border-border hover:bg-surface hover:text-ink [&_svg]:block"
                        href={entry.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`${entry.name} source`}
                        data-tooltip={entry.sourceUrl}
                      >
                        <HugeiconsIcon icon={ArrowUpRight01Icon} size={14} />
                      </a>
                    )}
                  </div>
                  {isOpen && (
                    <div className="flex flex-col gap-2.5 pt-0 pr-0.5 pb-4 pl-[25px]">
                      {entry.description && <p className={BODY_TEXT}>{entry.description}</p>}
                      {entry.noticeText ? (
                        <pre className="m-0 max-h-[320px] overflow-auto rounded-[10px] border border-[#221f1c] bg-surface px-4 py-3.5 font-mono text-[11px]/[17px] font-normal wrap-anywhere whitespace-pre-wrap text-ink-soft [scrollbar-color:#4a4842_transparent] [scrollbar-width:thin]">
                          {entry.noticeText}
                        </pre>
                      ) : (
                        <p className={BODY_TEXT}>
                          This package ships without a license file. Its source has the details.
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </SettingsPanel>
  );
}

const BODY_TEXT = "m-0 font-body text-[13px]/[19px] font-normal text-muted";
const EMPTY = cx(BODY_TEXT, "px-0.5 py-5");
