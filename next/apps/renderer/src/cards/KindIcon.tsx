import {
  AtSignIcon,
  Bookmark01Icon,
  FileTextIcon,
  Image01Icon,
  Link01Icon,
  PlayIcon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { ItemKind } from "../library/cardModel.ts";

const icons: Record<ItemKind, IconSvgElement> = {
  Article: Link01Icon,
  Image: Image01Icon,
  Note: SparklesIcon,
  PDF: FileTextIcon,
  Quote: Bookmark01Icon,
  Video: PlayIcon,
  Post: AtSignIcon,
  File: SparklesIcon,
};

export function KindIcon({ kind, size = 13 }: { kind: ItemKind; size?: number }) {
  return <HugeiconsIcon icon={icons[kind]} size={size} aria-hidden="true" />;
}
