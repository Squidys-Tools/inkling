import { expect, test } from "bun:test";
import { mentionsSubject, smartSpaceSubjects, visualSubjectQuery } from "./photo-subjects.ts";

test("a subject query is a list of photographable nouns, not any text that mentions one", () => {
  expect(visualSubjectQuery("Cats")).toEqual(["cat"]);
  expect(visualSubjectQuery("photos of kittens and dogs")).toEqual(["cat", "dog"]);
  expect(visualSubjectQuery("My Cats & Dogs!")).toEqual(["cat", "dog"]);
  for (const text of [
    "cat training notes",
    "screenshot of a cat",
    "category",
    "Chats",
    "Katzen",
    "",
  ])
    expect(visualSubjectQuery(text)).toBeNull();
});

test("only a subject name or subject text makes a Smart Space a photo collection", () => {
  const space = { kind: "smart", name: " Cats ", query: {} };
  expect(smartSpaceSubjects(space)).toEqual(["cat"]);
  expect(smartSpaceSubjects({ ...space, name: "Everything" })).toBeNull();
  expect(smartSpaceSubjects({ ...space, name: "Inbox", query: { text: "dogs" } })).toEqual(["dog"]);
  expect(smartSpaceSubjects({ ...space, query: { text: "  " } })).toEqual(["cat"]);
  expect(smartSpaceSubjects({ ...space, query: { text: "tabby notes" } })).toBeNull();
  expect(smartSpaceSubjects({ ...space, query: { tag: "pets" } })).toBeNull();
  expect(smartSpaceSubjects({ ...space, query: { kind: "note" } })).toBeNull();
  expect(smartSpaceSubjects({ ...space, kind: "regular" })).toBeNull();
});

test("text names a subject only as a whole word or one of its aliases", () => {
  expect(mentionsSubject("my-kitten.jpg", ["cat"])).toBe(true);
  expect(mentionsSubject("Dogs at the park", ["cat", "dog"])).toBe(true);
  for (const text of ["category.png", "concatenate", "IMG_0001.jpg", "dog.png"])
    expect(mentionsSubject(text, ["cat"])).toBe(false);
});
