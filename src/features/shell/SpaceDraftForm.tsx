import { motion } from "motion/react";
import type { FormEvent, RefObject } from "react";
import type { SpaceKind } from "../../lib/libraryApi";
import { Button } from "../../ui/Button";
import { cx } from "../../ui/cx";

export type SpaceDraft = {
  isOpen: boolean;
  name: string;
  kind: SpaceKind;
  query: string;
  toggle: () => void;
  setName: (name: string) => void;
  setKind: (kind: SpaceKind) => void;
  cancel: () => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
};

export function SpaceDraftForm({
  draft,
  inputRef,
}: {
  draft: SpaceDraft;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <motion.form
      key="space-form"
      className="grid gap-2 px-2.5 pt-1.5 pb-2.5"
      initial={{ opacity: 0, transform: "translateY(-6px)" }}
      animate={{ opacity: 1, transform: "translateY(0)" }}
      exit={{ opacity: 0, transform: "translateY(-4px)" }}
      transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
      onSubmit={draft.submit}
    >
      <input
        ref={inputRef}
        className="min-h-[33px] w-full rounded-lg border border-border bg-surface px-2.5 py-0 text-[13px] text-ink outline-none! focus:border-accent"
        value={draft.name}
        onChange={(event) => draft.setName(event.target.value)}
        placeholder={
          draft.kind === "smart" && draft.query.trim()
            ? `Save “${draft.query.trim()}” as…`
            : "Name this space"
        }
        aria-label="Space name"
        maxLength={80}
      />
      {/* Native radios rather than role="radio" buttons: the group gets
          arrow-key selection, one tab stop and group semantics from the
          platform instead of from ARIA we would then have to maintain. */}
      <fieldset className="m-0 grid min-w-0 grid-cols-2 gap-[3px] rounded-button border border-border bg-surface p-[3px]">
        <legend className="sr-only">How this Space fills</legend>
        {(["smart", "regular"] as const).map((kind) => (
          <label
            key={kind}
            className={cx(
              // The real input is clipped, so the label draws its focus ring.
              "flex items-center justify-center rounded-md py-1.5 text-[12px] cursor-pointer transition-[color,background-color] duration-150 ease-[ease] has-focus-visible:outline-2 has-focus-visible:outline-offset-3 has-focus-visible:outline-accent",
              draft.kind === kind
                ? "bg-accent-soft font-semibold text-accent"
                : "text-muted hover:text-ink",
            )}
          >
            <input
              type="radio"
              name="space-kind"
              className="sr-only"
              value={kind}
              checked={draft.kind === kind}
              aria-describedby="space-kind-hint"
              onChange={() => draft.setKind(kind)}
            />
            {kind === "smart" ? "Smart" : "Regular"}
          </label>
        ))}
      </fieldset>
      <p className="m-0 text-[11px] leading-[1.45] text-muted" id="space-kind-hint">
        {draft.kind === "regular"
          ? "Holds only the items you file into it. Open an item and pick a Space to add it."
          : draft.query.trim()
            ? "A Smart Space that updates automatically as items match this search."
            : "An empty Smart Space matches everything you have saved."}
      </p>
      <div className="flex items-center justify-between gap-2.5">
        <Button variant="text" onClick={draft.cancel}>
          Cancel
        </Button>
        <Button variant="primary" type="submit">
          Create Space
        </Button>
      </div>
    </motion.form>
  );
}
