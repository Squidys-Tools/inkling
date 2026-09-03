import { createContext, useContext, useState, type ComponentType, type CSSProperties, type ReactNode, type SVGProps } from "react";
import {
  Archive as LuArchive,
  AlertCircle as LuAlert,
  ArrowUpRight as LuArrowUpRight,
  AtSign as LuAtSign,
  BadgeCheck as LuBadgeCheck,
  BookOpen as LuBookOpen,
  Bookmark as LuBookmark,
  Camera as LuCamera,
  Check as LuCheck,
  ChevronLeft as LuChevronLeft,
  ChevronRight as LuChevronRight,
  CircleHelp as LuHelp,
  Clock3 as LuClock,
  Copy as LuCopy,
  ExternalLink as LuExternal,
  FileText as LuFileText,
  Grid2x2 as LuGrid,
  Heart as LuHeart,
  Image as LuImage,
  Layers3 as LuLayers,
  Link2 as LuLink,
  List as LuList,
  LoaderCircle as LuLoader,
  MessageCircle as LuMessage,
  Minus as LuMinus,
  PanelLeftClose as LuPanelClose,
  PanelLeftOpen as LuPanelOpen,
  Play as LuPlay,
  Plus as LuPlus,
  Repeat2 as LuRepeat,
  RotateCw as LuRotate,
  Search as LuSearch,
  Settings2 as LuSettings,
  Share2 as LuShare,
  Sparkles as LuSparkles,
  X as LuX,
} from "lucide-react";
import {
  TbArchive,
  TbAlertCircle,
  TbArrowUpRight,
  TbAt,
  TbRosetteDiscountCheck,
  TbBook2,
  TbBookmark,
  TbCamera,
  TbCheck,
  TbChevronLeft,
  TbChevronRight,
  TbHelpCircle,
  TbClock,
  TbCopy,
  TbExternalLink,
  TbFileText,
  TbLayoutGrid,
  TbHeart,
  TbPhoto,
  TbLayersIntersect,
  TbLink,
  TbList,
  TbLoader2,
  TbMessageCircle,
  TbMinus,
  TbLayoutSidebarLeftCollapse,
  TbLayoutSidebarLeftExpand,
  TbPlayerPlay,
  TbPlus,
  TbRepeat,
  TbRotateClockwise,
  TbSearch,
  TbSettings,
  TbShare2,
  TbSparkles,
  TbX,
} from "react-icons/tb";
import {
  HiArchiveBox,
  HiExclamationCircle,
  HiArrowUpRight,
  HiAtSymbol,
  HiCheckBadge,
  HiBookOpen,
  HiBookmark,
  HiCamera,
  HiCheck,
  HiChevronLeft,
  HiChevronRight,
  HiQuestionMarkCircle,
  HiClock,
  HiSquare2Stack,
  HiArrowTopRightOnSquare,
  HiDocumentText,
  HiSquares2X2,
  HiHeart,
  HiPhoto,
  HiSquare3Stack3D,
  HiLink,
  HiListBullet,
  HiArrowPath,
  HiChatBubbleLeft,
  HiMinus,
  HiChevronDoubleLeft,
  HiChevronDoubleRight,
  HiPlay,
  HiPlus,
  HiArrowPathRoundedSquare,
  HiMagnifyingGlass,
  HiCog6Tooth,
  HiShare,
  HiSparkles,
  HiXMark,
} from "react-icons/hi2";
import {
  PiArchive,
  PiWarningCircle,
  PiArrowUpRight,
  PiAt,
  PiSealCheck,
  PiBookOpen,
  PiBookmarkSimple,
  PiCamera,
  PiCheck,
  PiCaretLeft,
  PiCaretRight,
  PiQuestion,
  PiClock,
  PiCopy,
  PiArrowSquareOut,
  PiFileText,
  PiGridFour,
  PiHeart,
  PiImage,
  PiStack,
  PiLink,
  PiList,
  PiCircleNotch,
  PiChatCircle,
  PiMinus,
  PiArrowLineLeft,
  PiArrowLineRight,
  PiPlay,
  PiPlus,
  PiRepeat,
  PiArrowClockwise,
  PiMagnifyingGlass,
  PiGear,
  PiShareNetwork,
  PiSparkle,
  PiX,
} from "react-icons/pi";
import {
  BiArchive,
  BiErrorCircle,
  BiLinkExternal,
  BiAt,
  BiBadgeCheck,
  BiBookOpen,
  BiBookmark,
  BiCamera,
  BiCheck,
  BiChevronLeft,
  BiChevronRight,
  BiHelpCircle,
  BiTime,
  BiCopy,
  BiFile,
  BiGridAlt,
  BiHeart,
  BiImage,
  BiLayer,
  BiLink,
  BiListUl,
  BiLoaderCircle,
  BiMessageRounded,
  BiMinus,
  BiChevronsLeft,
  BiChevronsRight,
  BiPlay,
  BiPlus,
  BiRepeat,
  BiRotateRight,
  BiSearch,
  BiCog,
  BiShareAlt,
  BiStar,
  BiX,
} from "react-icons/bi";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Archive01Icon,
  AlertCircleIcon,
  ArrowUpRight01Icon,
  AtSignIcon,
  CheckmarkBadge01Icon,
  BookOpen01Icon,
  Bookmark01Icon,
  Camera01Icon,
  CheckmarkCircle01Icon,
  ChevronLeftIcon as HugeChevronLeftIcon,
  ChevronRightIcon as HugeChevronRightIcon,
  HelpCircleIcon,
  Clock01Icon,
  Copy01Icon,
  LinkSquare01Icon,
  FileTextIcon as HugeFileTextIcon,
  Grid2X2Icon,
  HeartIcon as HugeHeartIcon,
  Image01Icon,
  Layers01Icon,
  Link01Icon,
  ListViewIcon,
  Loading01Icon,
  Message01Icon,
  MinusSignIcon,
  SidebarLeftIcon,
  ViewSidebarLeftIcon,
  PlayIcon as HugePlayIcon,
  PlusSignIcon,
  RepeatIcon,
  RotateCwIcon as HugeRotateCwIcon,
  Search01Icon,
  Settings01Icon,
  Share08Icon,
  SparklesIcon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import {
  ArchiveIcon,
  WarningTriangleIcon,
  ArrowUpRightIcon,
  AtSignIcon as IconicAtSignIcon,
  BadgeIcon,
  BookIcon,
  BookmarkIcon as IconicBookmarkIcon,
  CameraIcon as IconicCameraIcon,
  CheckIcon,
  ChevronLeftIcon as IconicChevronLeftIcon,
  ChevronRightIcon as IconicChevronRightIcon,
  HelpCircleIcon as IconicHelpCircleIcon,
  ClockIcon,
  CopyIcon as IconicCopyIcon,
  FileTextIcon as IconicFileTextIcon,
  GridIcon,
  HeartIcon as IconicHeartIcon,
  LayersIcon,
  LinkIcon,
  MenuIcon,
  SpinnerIcon,
  MessageIcon,
  MinusIcon as IconicMinusIcon,
  PlayIcon as IconicPlayIcon,
  PlusIcon as IconicPlusIcon,
  RefreshIcon,
  SearchIcon,
  SettingsIcon as IconicSettingsIcon,
  ShareIcon,
  StarIcon,
  CloseIcon,
} from "@iconicicons/react";
import "@flaticon/flaticon-uicons/css/regular/rounded.css";

export type IconPackId =
  | "lucide"
  | "tabler"
  | "hugeicons"
  | "heroicons"
  | "uicons"
  | "phosphor"
  | "iconic"
  | "boxicons";

export type IconName =
  | "archive"
  | "alert"
  | "arrowUpRight"
  | "atSign"
  | "badgeCheck"
  | "bookOpen"
  | "bookmark"
  | "camera"
  | "check"
  | "chevronLeft"
  | "chevronRight"
  | "help"
  | "clock"
  | "copy"
  | "external"
  | "fileText"
  | "grid"
  | "heart"
  | "image"
  | "layers"
  | "link"
  | "list"
  | "loader"
  | "message"
  | "minus"
  | "panelClose"
  | "panelOpen"
  | "play"
  | "plus"
  | "repeat"
  | "rotate"
  | "search"
  | "settings"
  | "share"
  | "sparkles"
  | "x";

export type IconCommonProps = {
  size?: number | string;
  strokeWidth?: number | string;
  className?: string;
  style?: CSSProperties;
};

export type IconComponent = ComponentType<IconCommonProps>;

export const ICON_PACKS: { id: IconPackId; label: string; note: string }[] = [
  { id: "lucide", label: "Lucide", note: "Current default · ISC" },
  { id: "tabler", label: "Tabler", note: "Free · MIT" },
  { id: "hugeicons", label: "HugeIcons", note: "Free set · MIT" },
  { id: "heroicons", label: "Heroicons", note: "Free · MIT" },
  { id: "uicons", label: "Uicons", note: "Free · credit Flaticon if shipped" },
  { id: "phosphor", label: "Phosphor", note: "Free · MIT" },
  { id: "iconic", label: "Iconic", note: "200 free · do-wtf-you-want" },
  { id: "boxicons", label: "Boxicons", note: "Free · MIT" },
];

function huge(icon: IconSvgElement): IconComponent {
  return function HugeIconAdapter({ size = 16, strokeWidth = 1.8, className, style }: IconCommonProps) {
    return (
      <HugeiconsIcon
        icon={icon}
        size={size}
        strokeWidth={typeof strokeWidth === "string" ? Number(strokeWidth) || 1.8 : strokeWidth}
        className={className}
        style={style}
      />
    );
  };
}

function iconic(Cmp: ComponentType<SVGProps<SVGSVGElement>>): IconComponent {
  return function IconicAdapter({ size = 16, className, style }: IconCommonProps) {
    return <Cmp width={size} height={size} className={className} style={style} aria-hidden="true" focusable="false" />;
  };
}

function uicon(cls: string): IconComponent {
  return function UiconAdapter({ size = 16, className, style }: IconCommonProps) {
    return (
      <i
        aria-hidden="true"
        className={`fi ${cls}${className ? ` ${className}` : ""}`}
        style={{ fontSize: size, lineHeight: 1, ...style }}
      />
    );
  };
}

const LUCIDE: Record<IconName, IconComponent> = {
  archive: LuArchive,
  alert: LuAlert,
  arrowUpRight: LuArrowUpRight,
  atSign: LuAtSign,
  badgeCheck: LuBadgeCheck,
  bookOpen: LuBookOpen,
  bookmark: LuBookmark,
  camera: LuCamera,
  check: LuCheck,
  chevronLeft: LuChevronLeft,
  chevronRight: LuChevronRight,
  help: LuHelp,
  clock: LuClock,
  copy: LuCopy,
  external: LuExternal,
  fileText: LuFileText,
  grid: LuGrid,
  heart: LuHeart,
  image: LuImage,
  layers: LuLayers,
  link: LuLink,
  list: LuList,
  loader: LuLoader,
  message: LuMessage,
  minus: LuMinus,
  panelClose: LuPanelClose,
  panelOpen: LuPanelOpen,
  play: LuPlay,
  plus: LuPlus,
  repeat: LuRepeat,
  rotate: LuRotate,
  search: LuSearch,
  settings: LuSettings,
  share: LuShare,
  sparkles: LuSparkles,
  x: LuX,
};

const TABLER: Record<IconName, IconComponent> = {
  archive: TbArchive,
  alert: TbAlertCircle,
  arrowUpRight: TbArrowUpRight,
  atSign: TbAt,
  badgeCheck: TbRosetteDiscountCheck,
  bookOpen: TbBook2,
  bookmark: TbBookmark,
  camera: TbCamera,
  check: TbCheck,
  chevronLeft: TbChevronLeft,
  chevronRight: TbChevronRight,
  help: TbHelpCircle,
  clock: TbClock,
  copy: TbCopy,
  external: TbExternalLink,
  fileText: TbFileText,
  grid: TbLayoutGrid,
  heart: TbHeart,
  image: TbPhoto,
  layers: TbLayersIntersect,
  link: TbLink,
  list: TbList,
  loader: TbLoader2,
  message: TbMessageCircle,
  minus: TbMinus,
  panelClose: TbLayoutSidebarLeftCollapse,
  panelOpen: TbLayoutSidebarLeftExpand,
  play: TbPlayerPlay,
  plus: TbPlus,
  repeat: TbRepeat,
  rotate: TbRotateClockwise,
  search: TbSearch,
  settings: TbSettings,
  share: TbShare2,
  sparkles: TbSparkles,
  x: TbX,
};

const HEROICONS: Record<IconName, IconComponent> = {
  archive: HiArchiveBox,
  alert: HiExclamationCircle,
  arrowUpRight: HiArrowUpRight,
  atSign: HiAtSymbol,
  badgeCheck: HiCheckBadge,
  bookOpen: HiBookOpen,
  bookmark: HiBookmark,
  camera: HiCamera,
  check: HiCheck,
  chevronLeft: HiChevronLeft,
  chevronRight: HiChevronRight,
  help: HiQuestionMarkCircle,
  clock: HiClock,
  copy: HiSquare2Stack,
  external: HiArrowTopRightOnSquare,
  fileText: HiDocumentText,
  grid: HiSquares2X2,
  heart: HiHeart,
  image: HiPhoto,
  layers: HiSquare3Stack3D,
  link: HiLink,
  list: HiListBullet,
  loader: HiArrowPath,
  message: HiChatBubbleLeft,
  minus: HiMinus,
  panelClose: HiChevronDoubleLeft,
  panelOpen: HiChevronDoubleRight,
  play: HiPlay,
  plus: HiPlus,
  repeat: HiArrowPathRoundedSquare,
  rotate: HiArrowPath,
  search: HiMagnifyingGlass,
  settings: HiCog6Tooth,
  share: HiShare,
  sparkles: HiSparkles,
  x: HiXMark,
};

const PHOSPHOR: Record<IconName, IconComponent> = {
  archive: PiArchive,
  alert: PiWarningCircle,
  arrowUpRight: PiArrowUpRight,
  atSign: PiAt,
  badgeCheck: PiSealCheck,
  bookOpen: PiBookOpen,
  bookmark: PiBookmarkSimple,
  camera: PiCamera,
  check: PiCheck,
  chevronLeft: PiCaretLeft,
  chevronRight: PiCaretRight,
  help: PiQuestion,
  clock: PiClock,
  copy: PiCopy,
  external: PiArrowSquareOut,
  fileText: PiFileText,
  grid: PiGridFour,
  heart: PiHeart,
  image: PiImage,
  layers: PiStack,
  link: PiLink,
  list: PiList,
  loader: PiCircleNotch,
  message: PiChatCircle,
  minus: PiMinus,
  panelClose: PiArrowLineLeft,
  panelOpen: PiArrowLineRight,
  play: PiPlay,
  plus: PiPlus,
  repeat: PiRepeat,
  rotate: PiArrowClockwise,
  search: PiMagnifyingGlass,
  settings: PiGear,
  share: PiShareNetwork,
  sparkles: PiSparkle,
  x: PiX,
};

const BOXICONS: Record<IconName, IconComponent> = {
  archive: BiArchive,
  alert: BiErrorCircle,
  arrowUpRight: BiLinkExternal,
  atSign: BiAt,
  badgeCheck: BiBadgeCheck,
  bookOpen: BiBookOpen,
  bookmark: BiBookmark,
  camera: BiCamera,
  check: BiCheck,
  chevronLeft: BiChevronLeft,
  chevronRight: BiChevronRight,
  help: BiHelpCircle,
  clock: BiTime,
  copy: BiCopy,
  external: BiLinkExternal,
  fileText: BiFile,
  grid: BiGridAlt,
  heart: BiHeart,
  image: BiImage,
  layers: BiLayer,
  link: BiLink,
  list: BiListUl,
  loader: BiLoaderCircle,
  message: BiMessageRounded,
  minus: BiMinus,
  panelClose: BiChevronsLeft,
  panelOpen: BiChevronsRight,
  play: BiPlay,
  plus: BiPlus,
  repeat: BiRepeat,
  rotate: BiRotateRight,
  search: BiSearch,
  settings: BiCog,
  share: BiShareAlt,
  sparkles: BiStar,
  x: BiX,
};

const HUGEICONS: Record<IconName, IconComponent> = {
  archive: huge(Archive01Icon),
  alert: huge(AlertCircleIcon),
  arrowUpRight: huge(ArrowUpRight01Icon),
  atSign: huge(AtSignIcon),
  badgeCheck: huge(CheckmarkBadge01Icon),
  bookOpen: huge(BookOpen01Icon),
  bookmark: huge(Bookmark01Icon),
  camera: huge(Camera01Icon),
  check: huge(CheckmarkCircle01Icon),
  chevronLeft: huge(HugeChevronLeftIcon),
  chevronRight: huge(HugeChevronRightIcon),
  help: huge(HelpCircleIcon),
  clock: huge(Clock01Icon),
  copy: huge(Copy01Icon),
  external: huge(LinkSquare01Icon),
  fileText: huge(HugeFileTextIcon),
  grid: huge(Grid2X2Icon),
  heart: huge(HugeHeartIcon),
  image: huge(Image01Icon),
  layers: huge(Layers01Icon),
  link: huge(Link01Icon),
  list: huge(ListViewIcon),
  loader: huge(Loading01Icon),
  message: huge(Message01Icon),
  minus: huge(MinusSignIcon),
  panelClose: huge(SidebarLeftIcon),
  panelOpen: huge(ViewSidebarLeftIcon),
  play: huge(HugePlayIcon),
  plus: huge(PlusSignIcon),
  repeat: huge(RepeatIcon),
  rotate: huge(HugeRotateCwIcon),
  search: huge(Search01Icon),
  settings: huge(Settings01Icon),
  share: huge(Share08Icon),
  sparkles: huge(SparklesIcon),
  x: huge(Cancel01Icon),
};

const UICONS: Record<IconName, IconComponent> = {
  archive: uicon("fi-rr-archive"),
  alert: uicon("fi-rr-exclamation"),
  arrowUpRight: uicon("fi-rr-arrow-up-right"),
  atSign: uicon("fi-rr-at"),
  badgeCheck: uicon("fi-rr-badge-check"),
  bookOpen: uicon("fi-rr-book-open-reader"),
  bookmark: uicon("fi-rr-bookmark"),
  camera: uicon("fi-rr-camera"),
  check: uicon("fi-rr-check"),
  chevronLeft: uicon("fi-rr-angle-left"),
  chevronRight: uicon("fi-rr-angle-right"),
  help: uicon("fi-rr-interrogation"),
  clock: uicon("fi-rr-clock-three"),
  copy: uicon("fi-rr-copy"),
  external: uicon("fi-rr-arrow-up-right-from-square"),
  fileText: uicon("fi-rr-memo"),
  grid: uicon("fi-rr-grid"),
  heart: uicon("fi-rr-heart"),
  image: uicon("fi-rr-picture"),
  layers: uicon("fi-rr-layers"),
  link: uicon("fi-rr-link"),
  list: uicon("fi-rr-list"),
  loader: uicon("fi-rr-spinner"),
  message: uicon("fi-rr-comment"),
  minus: uicon("fi-rr-minus"),
  panelClose: uicon("fi-rr-sidebar"),
  panelOpen: uicon("fi-rr-sidebar-flip"),
  play: uicon("fi-rr-play"),
  plus: uicon("fi-rr-plus"),
  repeat: uicon("fi-rr-refresh"),
  rotate: uicon("fi-rr-rotate-right"),
  search: uicon("fi-rr-search"),
  settings: uicon("fi-rr-settings"),
  share: uicon("fi-rr-share"),
  sparkles: uicon("fi-rr-sparkles"),
  x: uicon("fi-rr-cross"),
};

const ICONIC: Record<IconName, IconComponent> = {
  archive: iconic(ArchiveIcon),
  alert: iconic(WarningTriangleIcon),
  arrowUpRight: iconic(ArrowUpRightIcon),
  atSign: iconic(IconicAtSignIcon),
  badgeCheck: iconic(BadgeIcon),
  bookOpen: iconic(BookIcon),
  bookmark: iconic(IconicBookmarkIcon),
  camera: iconic(IconicCameraIcon),
  check: iconic(CheckIcon),
  chevronLeft: iconic(IconicChevronLeftIcon),
  chevronRight: iconic(IconicChevronRightIcon),
  help: iconic(IconicHelpCircleIcon),
  clock: iconic(ClockIcon),
  copy: iconic(IconicCopyIcon),
  external: iconic(ArrowUpRightIcon),
  fileText: iconic(IconicFileTextIcon),
  grid: iconic(GridIcon),
  heart: iconic(IconicHeartIcon),
  image: iconic(IconicCameraIcon),
  layers: iconic(LayersIcon),
  link: iconic(LinkIcon),
  list: iconic(MenuIcon),
  loader: iconic(SpinnerIcon),
  message: iconic(MessageIcon),
  minus: iconic(IconicMinusIcon),
  panelClose: iconic(IconicChevronLeftIcon),
  panelOpen: iconic(IconicChevronRightIcon),
  play: iconic(IconicPlayIcon),
  plus: iconic(IconicPlusIcon),
  repeat: iconic(RefreshIcon),
  rotate: iconic(RefreshIcon),
  search: iconic(SearchIcon),
  settings: iconic(IconicSettingsIcon),
  share: iconic(ShareIcon),
  sparkles: iconic(StarIcon),
  x: iconic(CloseIcon),
};

const PACKS: Record<IconPackId, Record<IconName, IconComponent>> = {
  lucide: LUCIDE,
  tabler: TABLER,
  hugeicons: HUGEICONS,
  heroicons: HEROICONS,
  uicons: UICONS,
  phosphor: PHOSPHOR,
  iconic: ICONIC,
  boxicons: BOXICONS,
};

const STORAGE_KEY = "inkling-icon-pack";

function readStoredPack(): IconPackId {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && ICON_PACKS.some((p) => p.id === raw)) {
      return raw as IconPackId;
    }
  } catch {
    // Private mode / unavailable storage: fall through to default.
  }
  return "lucide";
}

const IconPackContext = createContext<{ pack: IconPackId; setPack: (pack: IconPackId) => void }>({
  pack: "lucide",
  setPack: () => {},
});

export function IconPackProvider({ children }: { children: ReactNode }) {
  const [pack, setPackState] = useState<IconPackId>(readStoredPack);
  const setPack = (next: IconPackId) => {
    setPackState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore persistence failures.
    }
  };
  return <IconPackContext.Provider value={{ pack, setPack }}>{children}</IconPackContext.Provider>;
}

export function useIconPack() {
  return useContext(IconPackContext);
}

export type AppIconProps = IconCommonProps & { name: IconName };

export function AppIcon({ name, size = 16, strokeWidth, className, style }: AppIconProps) {
  const { pack } = useIconPack();
  const Cmp = PACKS[pack][name];
  return <Cmp size={size} strokeWidth={strokeWidth} className={className} style={style} />;
}

export function IconPackSwitcher() {
  const { pack, setPack } = useIconPack();
  const active = ICON_PACKS.find((p) => p.id === pack);
  return (
    <label className="icon-pack-row" title={active ? `Icon library: ${active.label} — ${active.note}` : "Icon library"}>
      <span>Icons</span>
      <select value={pack} onChange={(event) => setPack(event.target.value as IconPackId)} aria-label="Icon library">
        {ICON_PACKS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
    </label>
  );
}
