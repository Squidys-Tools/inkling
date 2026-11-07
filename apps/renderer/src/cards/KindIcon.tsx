import AtSignIcon from "@hugeicons/core-free-icons/AtSignIcon";
import Bookmark01Icon from "@hugeicons/core-free-icons/Bookmark01Icon";
import FileTextIcon from "@hugeicons/core-free-icons/FileTextIcon";
import Image01Icon from "@hugeicons/core-free-icons/Image01Icon";
import Link01Icon from "@hugeicons/core-free-icons/Link01Icon";
import PlayIcon from "@hugeicons/core-free-icons/PlayIcon";
import SparklesIcon from "@hugeicons/core-free-icons/SparklesIcon";
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
