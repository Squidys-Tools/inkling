import {
  ArrowLeft01Icon,
  Bookmark01Icon,
  Camera01Icon,
  Cancel01Icon,
  FileTextIcon,
  Folder01Icon,
  Image01Icon,
  Link01Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useId } from "react";
import { ADD_TITLES, AddError, AddForm } from "./AddForm";
import type { AddMenuLayoutProps } from "./AddMenu";
import { useAddMenu } from "./useAddMenu";

// The Add menu on the collapsed Codex rail.
export function CompactAddMenu({
  open,
  mode,
  saving,
  error,
  drafts,
  onSubmit,
  onOpen,
  onClose,
  onModeChange,
  onPickFile,
  onScreenshot,
  onAddSpace,
}: AddMenuLayoutProps) {
  const panelId = useId();
  const { rootRef, triggerRef, fileRef, focusTriggerRef, pickFiles } = useAddMenu({
    open,
    mode,
    onClose,
    onPickFile,
    firstOption: ".compact-add-option",
  });
  const closeFromControl = () => {
    focusTriggerRef.current = true;
    onClose();
  };
  const options = [
    { label: "Note", icon: FileTextIcon },
    { label: "Link", icon: Link01Icon },
    { label: "Quote", icon: Bookmark01Icon },
    { label: "File", icon: Image01Icon },
    { label: "Screenshot", icon: Camera01Icon },
    ...(onAddSpace ? [{ label: "Space", icon: Folder01Icon }] : []),
  ];
  const selectOption = (label: string) => {
    if (label === "Note") onModeChange("note");
    else if (label === "Link") onModeChange("url");
    else if (label === "Quote") onModeChange("quote");
    else if (label === "File") {
      closeFromControl();
      fileRef.current?.click();
    } else if (label === "Screenshot") {
      focusTriggerRef.current = true;
      onScreenshot();
    } else {
      onClose();
      onAddSpace?.();
    }
  };
  return (
    <div
      ref={rootRef}
      className="add-menu compact-add"
      data-open={open && !mode}
      onKeyDownCapture={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        if (mode) onModeChange(null);
        else closeFromControl();
      }}
    >
      <input ref={fileRef} type="file" hidden tabIndex={-1} multiple onChange={pickFiles} />
      <div
        id={panelId}
        className="compact-add-stack"
        role="toolbar"
        aria-orientation="vertical"
        aria-label="Add to your library"
        aria-hidden={!open || Boolean(mode)}
        inert={!open || Boolean(mode)}
        onKeyDown={(event) => {
          if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const buttons = [
            ...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
          ];
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? buttons.length - 1
                : (index + (event.key === "ArrowUp" ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next]?.focus({ preventScroll: true });
        }}
      >
        {options.map((option, index) => (
          <button
            key={option.label}
            type="button"
            className="compact-add-option"
            style={{ "--add-index": index } as React.CSSProperties}
            aria-label={option.label}
            data-tooltip={option.label}
            disabled={saving}
            onClick={() => selectOption(option.label)}
          >
            <HugeiconsIcon icon={option.icon} size={16} />
          </button>
        ))}
      </div>
      {open && mode && (
        <div
          className="add-menu-panel compact-add-form"
          role="dialog"
          aria-label={`Add ${ADD_TITLES[mode]}`}
        >
          <div className="add-menu-header">
            <button
              type="button"
              className="add-menu-round"
              aria-label="Back"
              onClick={() => onModeChange(null)}
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} size={14} />
            </button>
            <span className="add-menu-title">{ADD_TITLES[mode]}</span>
            <button
              type="button"
              className="add-menu-round"
              aria-label="Close"
              onClick={closeFromControl}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={13} />
            </button>
          </div>
          <div className="add-menu-body">
            <AddForm mode={mode} saving={saving} drafts={drafts} onSubmit={onSubmit} />
            <AddError error={error} />
          </div>
        </div>
      )}
      <button
        ref={triggerRef}
        type="button"
        className="add-button codex-add-button"
        aria-label="Add"
        aria-expanded={open}
        aria-controls={panelId}
        data-tooltip="Add"
        disabled={saving}
        onClick={open ? closeFromControl : onOpen}
      >
        <HugeiconsIcon icon={PlusSignIcon} size={16} />
      </button>
    </div>
  );
}
