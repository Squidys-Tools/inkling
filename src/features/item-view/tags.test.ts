import { expect, test } from "bun:test";
import { tagToAdd } from "./tags";

test.each([
  [[], "Reading", "reading"],
  [[], "## Reading ", "reading"],
  [["foo"], "# foo", null],
  [["Foo"], "foo", null],
  [[], " # ", null],
  [[], "c#", "c#"],
])("adding to %p the tag %p adds %p", (tags, input, added) => {
  expect(tagToAdd(tags, input)).toBe(added);
});
