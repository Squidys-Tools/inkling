import { isAbsolute, relative, sep } from "node:path";

/** True when `candidate` is `root` or under it. Both paths must already be resolved. */
export function isInside(candidate: string, root: string) {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot === "" ||
    (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !isAbsolute(pathFromRoot))
  );
}
