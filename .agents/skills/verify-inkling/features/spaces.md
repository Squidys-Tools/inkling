# Spaces

## User flow

Choose **Add a Space** in the sidebar. Name the Space, keep the default Smart kind or choose Regular, then choose **Create Space**. Smart Spaces show matching search results; Regular Spaces start empty and hold items filed by hand. Space rows also have color and move up/down controls, plus rename and delete. Deleting a Space removes its memberships and keeps its items in the library.

To file an active item, open its detail view and choose **Keep in a Space**, or right-click its card. Both menus offer **Add to <name>** or **Remove from <name>** for each Regular Space.

## Driving it with `scripts/drive.mjs`

Smart Space creation from a search is covered in [search.md](search.md). This recipe drives the Regular Space lifecycle with an empty Space. The native item-filing attempt is shown below.

```json
[
  {"label":"open Space form","click":"button[aria-label='Add a Space']"},
  {"label":"name field","wait":"input[aria-label='Space name']"},
  {"label":"name Regular Space","fill":"input[aria-label='Space name']","text":"Verify Regular"},
  {"label":"choose Regular","clickText":{"selector":"label","text":"Regular"}},
  {"label":"Regular selected","expect":"document.querySelector(\"input[type='radio'][value='regular']\").checked"},
  {"label":"create","clickText":{"selector":"button[type=submit]","text":"Create Space"}},
  {"label":"Space opened","wait":"button[aria-label='Rename Verify Regular']"},
  {"label":"empty state","expect":"document.body.textContent.includes('Verify Regular is empty.')"},
  {"label":"start rename","click":"button[aria-label='Rename Verify Regular']"},
  {"label":"rename field","wait":"input[aria-label='Rename Verify Regular']"},
  {"label":"new name","fill":"input[aria-label='Rename Verify Regular']","text":"Verify Renamed"},
  {"label":"commit","key":"Enter"},
  {"label":"renamed row","wait":"button[aria-label='Rename Verify Renamed']"},
  {"label":"delete empty Space","click":"button[aria-label='Delete Verify Renamed']"},
  {"label":"Space gone","expect":"!document.querySelector(\"button[aria-label='Rename Verify Renamed']\")"},
  {"label":"return to Everything","expect":"window.location.hash === '#/'"}
]
```

Read `spaces` to prove create uses `kind = 'regular'` and `query = '{}'`, rename changes `name`, and delete removes the Space row. Read `items` to confirm the active library rows remain.

## Native menu limit

In the full app, **Keep in a Space** and a card's right-click menu open Electron native context menus. Filing is available only when a Regular Space exists; archived items do not show it. The CDP driver can trigger the detail-view menu but cannot inspect or select native entries, so membership add/remove is `verified-unreachable` in this harness. Deleting a populated Regular Space also uses a native confirmation. `apps/renderer/src/menu/contextMenu.tsx` handles the native menu route; `apps/renderer/src/item/ActionBar.tsx` and `apps/renderer/src/cards/cardActions.ts` define the filing actions.

Return to Everything first if a newly created Space is still selected, then attempt the route with an active note and a Regular Space:

```json
[
  {"label":"return to Everything","clickText":{"selector":"a","text":"Everything"}},
  {"label":"open note","click":"article[aria-label='Note: Untitled note']"},
  {"label":"item view","wait":"button[aria-label='Close']"},
  {"label":"open Keep in a Space menu","click":"button[aria-label='Keep in a Space']"}
]
```

The final menu is native to Electron, outside the page CDP can inspect. Record membership selection as `verified-unreachable` unless a native UI driver is available.

The card context menu offers the same Add/Remove actions. In a separate drive while Everything is selected and a Regular Space exists, trigger it with:

```json
[
  {"label":"open card menu","rightClick":"article[aria-label='Note: Untitled note']"},
  {"label":"record card menu attempt","shot":"card-space-menu-attempt.png"}
]
```

CDP sends the right-click but cannot inspect or select the native menu entries.

## Gotchas

- The new Space form defaults to Smart. **Save as Space** opens it with the query in a placeholder such as **Save “alpha” as…**; the field value is empty until the user types a name.
- Rename is labeled `Rename <name>` and commits with Enter or blur; Escape cancels.
- `apps/renderer/src/shell/SpaceRow.tsx` labels row controls `Change color of <name>`, `Move <name> up`, and `Move <name> down`.
- Deleting an empty Space needs no confirmation. A populated Regular Space asks first and says its items stay in the library.
- A Smart Space cannot hold hand-filed items. Only Regular Spaces appear in **Keep in a Space**.
