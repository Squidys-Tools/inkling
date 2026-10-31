/**
 * "/", "/space/$id" and "/archive" draw nothing themselves: the library grid
 * stays mounted in the shell under every page and reads its scope from the
 * route (see LibraryHost).
 */
export function LibraryRoute() {
  return null;
}
