import type { XPostEntity, XPostMedia, XPostMetadata } from "./types.ts";

// Well past the eight lines a card shows at any column width; a long post is up to 25,000.
const CARD_TEXT_LENGTH = 1_000;
const QUOTE_TEXT_LENGTH = 400;

/** The first `length` UTF-16 units of a post's text, never splitting an emoji's surrogate pair. */
function clipped(text: string, entities: readonly XPostEntity[] | undefined, length: number) {
  if (text.length <= length) return { text, ...(entities && { entities }) };
  const code = text.charCodeAt(length - 1);
  const end = code >= 0xd800 && code <= 0xdbff ? length - 1 : length;
  const kept = entities?.filter((entity) => entity.end <= end);
  return { text: text.slice(0, end), ...(kept?.length && { entities: kept }) };
}

// The library's own copy only: X's URL never reaches the card.
const localMedia = (media: readonly XPostMedia[] | undefined) =>
  media?.flatMap(({ kind, width, height, durationSeconds, path }) =>
    path ? [{ kind, width, height, ...(durationSeconds && { durationSeconds }), path }] : [],
  );

// The card crosses RPC as JSON, which has no undefined: a missing field is left out.
const defined = <T extends object>(value: T) =>
  Object.fromEntries(Object.entries(value).filter((entry) => entry[1] !== undefined)) as T;

/**
 * What a card draws of a saved post, sent with every card instead of the whole post: no embed
 * HTML, no remote picture URLs, and only as much text as a card can show.
 */
export function xPostCard(post: XPostMetadata) {
  const quote = post.quote;
  const card = post.linkCard;
  return defined({
    provider: post.provider,
    postUrl: post.postUrl,
    postId: post.postId,
    authorName: post.authorName,
    authorHandle: post.authorHandle,
    verified: post.verified,
    avatarPath: post.avatarPath,
    squareAvatar: post.squareAvatar,
    publishedDate: post.publishedDate,
    ...(post.text !== undefined && clipped(post.text, post.entities, CARD_TEXT_LENGTH)),
    media: localMedia(post.media),
    quote:
      quote &&
      defined({
        postId: quote.postId,
        postUrl: quote.postUrl,
        authorName: quote.authorName,
        authorHandle: quote.authorHandle,
        verified: quote.verified,
        avatarPath: quote.avatarPath,
        squareAvatar: quote.squareAvatar,
        publishedDate: quote.publishedDate,
        ...clipped(quote.text, quote.entities, QUOTE_TEXT_LENGTH),
        media: localMedia(quote.media)?.slice(0, 1),
      }),
    linkCard:
      card &&
      defined({
        url: card.url,
        domain: card.domain,
        title: card.title,
        imageWidth: card.imageWidth,
        imageHeight: card.imageHeight,
        imagePath: card.imagePath,
        large: card.large,
      }),
    poll: post.poll,
    replyTo: post.replyTo,
  });
}
