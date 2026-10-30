import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlayIcon } from "@hugeicons/core-free-icons";
import { autoplayEmbedUrl, providerLabel } from "../lib/ingestion/video-links";
import type { LibraryItem } from "../lib/types";
import { KindIcon } from "./ItemMedia";

const VIDEO_IFRAME_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";

const DETAIL_VIDEO =
  "relative h-full overflow-hidden bg-[#101010] [&_iframe]:block [&_iframe]:size-full [&_iframe]:border-0";

export function DetailVideoMedia({ item }: { item: LibraryItem }) {
  const [isPlaying, setIsPlaying] = useState(false);

  if (item.video) {
    const poster = item.image ?? item.video.posterUrl;
    return (
      <div className={DETAIL_VIDEO}>
        {isPlaying ? (
          // oxlint-disable-next-line react/iframe-missing-sandbox -- allowlisted players need scripts and same-origin, which would void a sandbox.
          <iframe
            src={autoplayEmbedUrl(item.video.embedUrl)}
            title={item.title}
            allow={VIDEO_IFRAME_ALLOW}
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            className="group relative block size-full cursor-pointer border-0 bg-[#101010] p-0"
            onClick={() => setIsPlaying(true)}
            aria-label={`Play video: ${item.title}`}
          >
            {poster && (
              <img
                src={poster}
                alt=""
                loading="lazy"
                decoding="async"
                className="size-full object-cover opacity-88 transition-opacity duration-200 ease-[ease] group-hover:opacity-100"
              />
            )}
            <span
              className="absolute inset-0 m-auto grid size-[54px] place-items-center rounded-full bg-[rgba(18,18,16,0.8)] text-[#f2ede2] shadow-[0_10px_28px_rgba(0,0,0,0.5),inset_0_0_0_1px_rgba(255,255,255,0.22)] transition-[scale] duration-200 ease-[ease] group-hover:scale-108"
              aria-hidden="true"
            >
              <HugeiconsIcon icon={PlayIcon} size={21} />
            </span>
            <span className="pointer-events-none absolute bottom-[11px] left-3 font-body text-[9px] tracking-[0.13em] text-[#b3ad8d] uppercase [text-shadow:0_1px_6px_rgba(0,0,0,0.7)]">
              {providerLabel(item.video.provider)}
            </span>
          </button>
        )}
      </div>
    );
  }

  if (item.fileUrl) {
    return (
      <div className={DETAIL_VIDEO}>
        {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- Captions are unavailable for this user-supplied file. */}
        <video
          className="block size-full bg-black object-contain"
          src={item.fileUrl}
          poster={item.image}
          controls
          preload="metadata"
        />
      </div>
    );
  }

  return (
    <div className={item.accent}>
      <KindIcon kind={item.kind} />
      <span>{item.kind}</span>
    </div>
  );
}
