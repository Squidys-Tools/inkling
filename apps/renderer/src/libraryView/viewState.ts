import { createStore, useStore } from "../library/store.ts";

type ViewState = {
  list: boolean;
  sidebarOpen: boolean;
  settingsSheetOpen: boolean;
  /** The mascot reads this to look attentive while search has focus. */
  searchFocused: boolean;
};

/** How the library is shown; it outlives any one page. */
const viewState = createStore<ViewState>({
  list: false,
  sidebarOpen: true,
  settingsSheetOpen: false,
  searchFocused: false,
});

export const useViewState = <Selected>(select: (state: ViewState) => Selected) =>
  useStore(viewState, select);

export const setListMode = (list: boolean) => viewState.set((state) => ({ ...state, list }));
export const setSidebarOpen = (sidebarOpen: boolean) =>
  viewState.set((state) => ({ ...state, sidebarOpen }));
export const toggleSidebar = () =>
  viewState.set((state) => ({ ...state, sidebarOpen: !state.sidebarOpen }));
export const setSettingsSheetOpen = (settingsSheetOpen: boolean) =>
  viewState.set((state) => ({ ...state, settingsSheetOpen }));
export const setSearchFocused = (searchFocused: boolean) =>
  viewState.set((state) => ({ ...state, searchFocused }));
