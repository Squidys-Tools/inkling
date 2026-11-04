import { createAtom, useSelector } from "@tanstack/react-store";

type ViewState = {
  list: boolean;
  /** The grid↔list transition keeps new cards hidden while their entrance runs. */
  entering: boolean;
  sidebarOpen: boolean;
  settingsSheetOpen: boolean;
  /** The mascot reads this to look attentive while search has focus. */
  searchFocused: boolean;
};

/** How the library is shown; it outlives any one page. */
export const viewState = createAtom<ViewState>({
  list: false,
  entering: false,
  sidebarOpen: true,
  settingsSheetOpen: false,
  searchFocused: false,
});

export const useViewState = <Selected>(select: (state: ViewState) => Selected) =>
  useSelector(viewState, select);

export const setListMode = (list: boolean) => viewState.set((state) => ({ ...state, list }));
export const setEntering = (entering: boolean) =>
  viewState.set((state) => (state.entering === entering ? state : { ...state, entering }));
export const setSidebarOpen = (sidebarOpen: boolean) =>
  viewState.set((state) => ({ ...state, sidebarOpen }));
export const toggleSidebar = () =>
  viewState.set((state) => ({ ...state, sidebarOpen: !state.sidebarOpen }));
export const setSettingsSheetOpen = (settingsSheetOpen: boolean) =>
  viewState.set((state) => ({ ...state, settingsSheetOpen }));
export const setSearchFocused = (searchFocused: boolean) =>
  viewState.set((state) => ({ ...state, searchFocused }));
