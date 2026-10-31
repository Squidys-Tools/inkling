// Every origin an embed frame loads from. The app's CSP frame-src is built from
// this list, so a frame URL must start with one of these origins or it renders empty.
export const FRAME_ORIGINS = {
  youtube: "https://www.youtube-nocookie.com",
  vimeo: "https://player.vimeo.com",
  loom: "https://www.loom.com",
  spotify: "https://open.spotify.com",
  soundcloud: "https://w.soundcloud.com",
  twitch: "https://player.twitch.tv",
  x: "https://platform.twitter.com",
} as const;

export function xPostFrameUrl(postId: string) {
  const params = new URLSearchParams({ id: postId, dnt: "true", theme: "light" });
  return `${FRAME_ORIGINS.x}/embed/Tweet.html?${params.toString()}`;
}
