import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  Cancel01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { ThirdPartyLicense } from "../../../scripts/third-party-licenses/collect.mjs";
import { LicenseFilter } from "./LicenseFilter";
import "./OpenSourceLicenses.css";

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
    <section className="settings-panel" aria-labelledby="licenses-panel-title">
      <header className="settings-panel-header">
        <div className="settings-panel-header-content">
          <button type="button" className="licenses-back" onClick={onBack}>
            <HugeiconsIcon icon={ArrowLeft01Icon} size={14} />
            General
          </button>
          <div className="settings-panel-heading">
            <h2 id="licenses-panel-title">Open source licenses</h2>
          </div>
          <p className="settings-panel-note">
            inkling is built on the work of these projects. Their licenses travel with it.
          </p>
        </div>
        <button
          type="button"
          className="icon-button settings-close"
          onClick={onClose}
          aria-label="Close settings"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={14} />
        </button>
      </header>

      <div className="licenses-toolbar">
        <span className="licenses-count">
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
        <label className="licenses-search">
          <HugeiconsIcon icon={Search01Icon} size={14} />
          <input
            type="search"
            placeholder="Name, version, or license"
            aria-label="Search licenses"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={!entries}
          />
        </label>
      </div>

      <div className="settings-scroll">
        {failed && (
          <p className="licenses-empty">
            The license list didn't load. Reopen settings to try again.
          </p>
        )}
        {shown?.length === 0 && (
          <p className="licenses-empty">
            {query.trim() ? `Nothing matches “${query}”.` : "No notices under that license."}
          </p>
        )}
        {shown && shown.length > 0 && (
          <ul className="licenses-list">
            {shown.map((entry) => {
              const id = `${entry.name}@${entry.version ?? ""}`;
              const isOpen = openId === id;
              return (
                <li key={id} className="licenses-row" data-open={isOpen || undefined}>
                  <div className="licenses-row-head">
                    <button
                      type="button"
                      className="licenses-row-toggle"
                      aria-expanded={isOpen}
                      onClick={() => setOpenId(isOpen ? null : id)}
                    >
                      <HugeiconsIcon
                        icon={ArrowRight01Icon}
                        size={13}
                        className="licenses-chevron"
                      />
                      <span className="licenses-name">{entry.name}</span>
                      {entry.version && <span className="licenses-version">{entry.version}</span>}
                      <span className="licenses-id">{entry.license}</span>
                    </button>
                    {entry.sourceUrl && (
                      <a
                        className="icon-button licenses-source"
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
                    <div className="licenses-body">
                      {entry.description && <p>{entry.description}</p>}
                      {entry.noticeText ? (
                        <pre>{entry.noticeText}</pre>
                      ) : (
                        <p>
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
    </section>
  );
}
