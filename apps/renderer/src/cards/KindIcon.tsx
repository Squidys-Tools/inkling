import AtSignIcon from "@inkling/ui/icons/AtSign";
import BookmarkIcon from "@inkling/ui/icons/Bookmark";
import FileTextIcon from "@inkling/ui/icons/FileText";
import ImageIcon from "@inkling/ui/icons/Image";
import LinkIcon from "@inkling/ui/icons/Link";
import PlayIcon from "@inkling/ui/icons/Play";
import SparklesIcon from "@inkling/ui/icons/Sparkles";
import { Icon, type IconData } from "@inkling/ui";
import type { ItemKind } from "../library/cardModel.ts";

const icons: Record<ItemKind, IconData> = {
  Article: LinkIcon,
  Image: ImageIcon,
  Note: SparklesIcon,
  PDF: FileTextIcon,
  Quote: BookmarkIcon,
  Video: PlayIcon,
  Post: AtSignIcon,
  File: SparklesIcon,
};

export function KindIcon({ kind, size = 13 }: { kind: ItemKind; size?: number }) {
  return <Icon icon={icons[kind]} size={size} aria-hidden="true" />;
}
