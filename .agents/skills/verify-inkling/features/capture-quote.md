# Capture a quote

Capture a quote saves quote text with an optional attribution as a quote card. Status: **driven** on 2026-11-02.

## Sub-features

- `quote-open` opens the quote form from Add.
- `quote-save` saves the quote and shows its card in Everything.
- `quote-store` stores title, attribution and source label.

## How to get to it (user POV)

- Choose **Add**, then **Quote**.

## Driving it with agent-desktop

Preconditions: seeded library; leave `Source URL` empty to stay offline.

- **Open.** `$I ad expand "$($I ref menubutton Add)"`, then `$I ad click "$($I ref menuitem Quote)"`. Route `#/add/quote`; textfields `Quote text`, `Attribution`, `Source URL`; `Save to library` is disabled until quote text is set.
- **Fill.** `$I ad set-value "$($I ref textfield 'Quote text')" 'Small steps cross oceans'` and `$I ad set-value "$($I ref textfield Attribution)" 'Ada Probe, Notes'`. `$I shot q1`.
- **Save.** `$I ad click "$($I ref button 'Save to library')"`.
- **Proof.** `$I tree | grep -E 'Everything|Quote:'` shows `Everything` +1 and a group `Quote: Small steps cross oceans`; `$I shot q2`; `$I db "SELECT kind,title,description,body,source_label,metadata FROM items ORDER BY created_at DESC LIMIT 1"` → kind `quote`, title = the quote, description = `Ada Probe, Notes`, body `''`, source_label `Ada Probe`, metadata `captureSource` `quick quote` plus `quoteText` and `attribution`.

## Gotchas

- Unlike the note editor, the fields are plain textfields.
- A filled `Source URL` triggers a network fetch: leave it empty.
- Attribution is stored whole in `description`; `source_label` is the part before the first comma.
