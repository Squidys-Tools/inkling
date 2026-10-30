import type { ReactNode } from "react";
import { DetailVideoMedia } from "../../components/DetailVideoMedia";
import { KindIcon, NoteArtwork, PdfArtwork, PostArtwork } from "../../components/ItemMedia";
import { XPostEmbed } from "../../components/XPostEmbed";
import type { LibraryItem } from "../../lib/types";
import { cx } from "../../ui/cx";
import { ZoomableImage } from "./ZoomableImage";

// `post-art` can sit inside the X embed's fallback, a level below the art box.
const ART_BOX =
  "h-[min(100%,520px)] w-[min(100%,720px)] overflow-hidden rounded-[12px] [&>*,&_.post-art]:m-0 [&>*,&_.post-art]:h-full [&>*,&_.post-art]:min-h-0 [&>*,&_.post-art]:rounded-none group-data-flying/item:size-full group-data-flying/item:rounded-none";

function ArtBox({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx(ART_BOX, className)}>{children}</div>;
}

export function ItemStageMedia({ item }: { item: LibraryItem }) {
  if (item.kind === "Note" && !item.image) {
    return (
      <ArtBox>
        <NoteArtwork item={item} />
      </ArtBox>
    );
  }

  if (item.social?.provider === "x") {
    return (
      <ArtBox className="bg-white">
        <XPostEmbed
          key={item.social.postUrl}
          social={item.social}
          fallback={
            item.post ? <PostArtwork post={item.post} /> : <div>Post preview unavailable.</div>
          }
        />
      </ArtBox>
    );
  }

  if (item.kind === "Video") {
    return (
      <ArtBox>
        <DetailVideoMedia key={item.id} item={item} />
      </ArtBox>
    );
  }

  if (item.kind === "PDF") {
    return (
      <ArtBox>
        <PdfArtwork item={item} />
      </ArtBox>
    );
  }

  if (item.image) {
    return (
      <ZoomableImage
        key={item.id}
        src={item.image}
        originalSrc={item.kind === "Image" ? item.fileUrl : undefined}
        alt={item.imageAlt ?? item.title}
      />
    );
  }

  if (item.kind === "Quote") {
    return (
      <ArtBox>
        <div className="bg-yellow-soft text-[#b3ad8d]">
          <span className="block font-[Georgia,serif] text-[64px]/[0.8]">“</span>
          <span>{item.kind}</span>
        </div>
      </ArtBox>
    );
  }

  if (item.kind === "Post" && item.post) {
    return (
      <ArtBox>
        <PostArtwork post={item.post} />
      </ArtBox>
    );
  }

  return (
    <ArtBox>
      <div className={item.accent}>
        <KindIcon kind={item.kind} />
        <span>{item.kind}</span>
      </div>
    </ArtBox>
  );
}
