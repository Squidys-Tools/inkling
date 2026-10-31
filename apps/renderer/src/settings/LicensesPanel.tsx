import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { color, font, motion, radius, space, text } from "@inkling/ui/tokens.stylex";
import { useDeferredValue, useEffect, useState } from "react";
import { desktop } from "../desktop.ts";
import { LicenseFilter } from "./LicenseFilter.tsx";
import {
  filterLicenses,
  licenseCounts,
  loadLicenses,
  type ThirdPartyLicense,
} from "./licenseList.ts";
import { Panel, PanelBody, settingsText } from "./parts.tsx";

export function LicensesPanel({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const [entries, setEntries] = useState<ThirdPartyLicense[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    let current = true;
    loadLicenses().then(
      (loaded) => current && setEntries(loaded),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, []);

  const shown = entries && filterLicenses(entries, deferredQuery, picked);

  return (
    <Panel
      title="Open source licenses"
      note="inkling is built on the work of these projects. Their licenses travel with it."
      before={
        <button type="button" onClick={onBack} {...stylex.props(styles.back)}>
          <HugeiconsIcon icon={ArrowLeft01Icon} size={14} />
          General
        </button>
      }
      onClose={onClose}
    >
      <div {...stylex.props(styles.toolbar)}>
        <span {...stylex.props(settingsText.mono, styles.tally)}>
          {!entries || !shown
            ? failed
              ? ""
              : "Loading…"
            : shown.length !== entries.length
              ? `${shown.length} of ${entries.length} notices`
              : `${entries.length} notices`}
        </span>
        <LicenseFilter
          counts={entries ? licenseCounts(entries) : []}
          selected={picked}
          onChange={setPicked}
          disabled={!entries}
        />
        <label {...stylex.props(styles.search)}>
          <HugeiconsIcon icon={Search01Icon} size={14} />
          <input
            type="search"
            placeholder="Name, version, or license"
            aria-label="Search licenses"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={!entries}
            {...stylex.props(styles.searchInput)}
          />
        </label>
      </div>
      <PanelBody>
        {failed && (
          <p {...stylex.props(settingsText.body, styles.empty)}>
            The license list didn’t load. Open this page again to retry.
          </p>
        )}
        {shown?.length === 0 && (
          <p {...stylex.props(settingsText.body, styles.empty)}>
            {query.trim() ? `Nothing matches “${query}”.` : "No notices under that license."}
          </p>
        )}
        {shown && shown.length > 0 && (
          <ul {...stylex.props(styles.list)}>
            {shown.map((entry) => {
              const id = `${entry.name}@${entry.version ?? ""}`;
              return (
                <Notice
                  key={id}
                  entry={entry}
                  open={openId === id}
                  onToggle={() => setOpenId(openId === id ? null : id)}
                />
              );
            })}
          </ul>
        )}
      </PanelBody>
    </Panel>
  );
}

function Notice({
  entry,
  open,
  onToggle,
}: {
  entry: ThirdPartyLicense;
  open: boolean;
  onToggle: () => void;
}) {
  const { sourceUrl } = entry;
  return (
    <li {...stylex.props(styles.notice)}>
      <div {...stylex.props(styles.noticeRow)}>
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          {...stylex.props(styles.noticeButton)}
        >
          <span {...stylex.props(styles.chevron, open && styles.chevronOpen)}>
            <HugeiconsIcon icon={ArrowRight01Icon} size={13} />
          </span>
          <span {...stylex.props(styles.name)}>{entry.name}</span>
          {entry.version && (
            <span {...stylex.props(settingsText.mono, styles.version)}>{entry.version}</span>
          )}
          <span {...stylex.props(styles.license)}>{entry.license}</span>
        </button>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`${entry.name} source`}
            title={sourceUrl}
            onClick={(event) => {
              if (!desktop) return;
              event.preventDefault();
              void desktop.openExternal(sourceUrl);
            }}
            {...stylex.props(styles.source)}
          >
            <HugeiconsIcon icon={ArrowUpRight01Icon} size={14} />
          </a>
        )}
      </div>
      {open && (
        <div {...stylex.props(styles.details)}>
          {entry.description && <p {...stylex.props(settingsText.body)}>{entry.description}</p>}
          {entry.noticeText ? (
            <pre {...stylex.props(styles.text)}>{entry.noticeText}</pre>
          ) : (
            <p {...stylex.props(settingsText.body)}>
              This package ships without a license file. Its source has the details.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

const styles = stylex.create({
  back: {
    display: "inline-flex",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: space.s1,
    marginTop: "-6px",
    marginLeft: "-8px",
    marginBottom: "2px",
    paddingBlock: space.s1,
    paddingLeft: "6px",
    paddingRight: "10px",
    borderWidth: 0,
    borderRadius: radius.round,
    backgroundColor: { default: "transparent", ":hover": color.overlayActive },
    color: { default: color.muted, ":hover": color.ink },
    fontFamily: font.body,
    fontSize: text.sm,
    lineHeight: "16px",
    cursor: "pointer",
    transitionProperty: "background-color, color",
    transitionDuration: motion.micro,
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
  },
  toolbar: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "-16px" },
  tally: { marginRight: "auto" },
  search: {
    display: "flex",
    alignItems: "center",
    gap: space.s2,
    width: "min(260px, 50%)",
    height: "34px",
    paddingInline: space.s3,
    borderRadius: radius.round,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: { default: color.borderStrong, ":focus-within": color.muted },
    color: color.muted,
    transitionProperty: "border-color",
    transitionDuration: motion.micro,
  },
  searchInput: {
    flex: "1 1 auto",
    minWidth: 0,
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    fontFamily: font.body,
    fontSize: text.md,
    lineHeight: "16px",
    color: color.ink,
    outline: "none",
    "::placeholder": { color: color.faint },
  },
  empty: { paddingInline: "2px", paddingBlock: space.s5 },
  list: { margin: 0, padding: 0, listStyle: "none" },
  notice: {
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: color.border,
    // Hundreds of rows: only the ones on screen lay out.
    contentVisibility: "auto",
    containIntrinsicSize: "auto 45px",
  },
  noticeRow: { display: "flex", alignItems: "center", gap: space.s2 },
  noticeButton: {
    display: "flex",
    flex: "1 1 auto",
    alignItems: "baseline",
    gap: "10px",
    minWidth: 0,
    paddingInline: "2px",
    paddingBlock: "13px",
    borderWidth: 0,
    backgroundColor: "transparent",
    color: color.ink,
    textAlign: "left",
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
  },
  chevron: {
    display: "inline-flex",
    flex: "none",
    alignSelf: "center",
    color: color.muted,
    transitionProperty: "transform",
    transitionDuration: motion.micro,
  },
  chevronOpen: { transform: "rotate(90deg)" },
  name: {
    minWidth: 0,
    overflow: "hidden",
    fontFamily: font.body,
    fontSize: "14px",
    lineHeight: "18px",
    fontWeight: 500,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  version: { flex: "none" },
  license: {
    minWidth: 0,
    marginLeft: "auto",
    overflow: "hidden",
    fontFamily: font.mono,
    fontSize: text.xs,
    lineHeight: "16px",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: color.inkSoft,
  },
  source: {
    display: "inline-grid",
    placeItems: "center",
    width: "34px",
    height: "34px",
    flex: "none",
    borderRadius: "8px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: { default: "transparent", ":hover": color.border },
    backgroundColor: { default: "transparent", ":hover": color.surface },
    color: { default: color.muted, ":hover": color.ink },
    transitionProperty: "background-color, color, border-color",
    transitionDuration: motion.micro,
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
  },
  details: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    paddingTop: 0,
    paddingRight: "2px",
    paddingBottom: space.s4,
    paddingLeft: "25px",
  },
  text: {
    margin: 0,
    maxHeight: "320px",
    overflow: "auto",
    paddingInline: space.s4,
    paddingBlock: "14px",
    borderRadius: "10px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    backgroundColor: color.surface,
    fontFamily: font.mono,
    fontSize: text.xs,
    lineHeight: "17px",
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
    color: color.inkSoft,
    scrollbarWidth: "thin",
    scrollbarColor: `${color.borderStrong} transparent`,
  },
});
