import { createAtom, useSelector } from "@tanstack/react-store";

type ViewState = {
  sidebarOpen: boolean;
  /** The mascot reads this to look attentive while search has focus. */
  searchFocused: boolean;
};

/** The shell around the library; it outlives any one page. */
const viewState = createAtom<ViewState>({
  sidebarOpen: true,
  searchFocused: false,
});

export const useViewState = <Selected>(select: (state: ViewState) => Selected) =>
  useSelector(viewState, select);

export const setSidebarOpen = (sidebarOpen: boolean) =>
  viewState.set((state) => ({ ...state, sidebarOpen }));
export const toggleSidebar = () =>
  viewState.set((state) => ({ ...state, sidebarOpen: !state.sidebarOpen }));
export const setSearchFocused = (searchFocused: boolean) =>
  viewState.set((state) => ({ ...state, searchFocused }));
