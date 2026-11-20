import { expect, test } from "bun:test";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/reactivity";
import type { PhoneCard } from "../desktop";
import { cardsView } from "./library";

test("an empty search or collection shows no cards, not the previous view's", () => {
  const card = { id: "a" } as PhoneCard;
  const previous = AsyncResult.success({ items: [card], done: false });
  const empty = AsyncResult.failWithPrevious(new Cause.NoSuchElementError(), {
    previous: Option.some(previous),
  });
  expect(cardsView(empty)).toEqual({ cards: [], more: false, loading: false, failed: false });
});
