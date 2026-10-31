// What the user typed on an Add page and left without saving. It stays for as
// long as the window is open, as the old Add menu's drafts did, so Back or
// Escape never loses text; a save clears it.
export const drafts = {
  note: "",
  quote: { body: "", attribution: "", sourceUrl: "" },
  link: { url: "", title: "" },
};
