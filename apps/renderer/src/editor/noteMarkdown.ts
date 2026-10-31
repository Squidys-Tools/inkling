import type { Extensions } from "@tiptap/core";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";

/** A class name for each node the editor draws. The editor passes StyleX classes; parsing needs none. */
export type NoteClasses = {
  paragraph: string;
  heading: string;
  bulletList: string;
  orderedList: string;
  listItem: string;
  taskList: string;
  taskItem: string;
  taskItemDone: string;
  blockquote: string;
  codeBlock: string;
  code: string;
  link: string;
  horizontalRule: string;
};

const withClass = (className: string | undefined) => (className ? { class: className } : {});

export function noteExtensions(classes?: NoteClasses): Extensions {
  // TaskItem's node view writes rendered attributes on every update but its
  // static HTMLAttributes only once, so the checked state carries the class.
  const taskItem = TaskItem.extend({
    addAttributes() {
      return {
        checked: {
          default: false,
          keepOnSplit: false,
          parseHTML: (element: HTMLElement) => {
            const checked = element.getAttribute("data-checked");
            return checked === "" || checked === "true";
          },
          renderHTML: (attributes: { checked?: boolean }) => ({
            "data-checked": attributes.checked,
            ...withClass(
              classes &&
                (attributes.checked
                  ? `${classes.taskItem} ${classes.taskItemDone}`
                  : classes.taskItem),
            ),
          }),
        },
      };
    },
  });
  return [
    StarterKit.configure({
      paragraph: { HTMLAttributes: withClass(classes?.paragraph) },
      heading: { levels: [1, 2, 3], HTMLAttributes: withClass(classes?.heading) },
      bulletList: { HTMLAttributes: withClass(classes?.bulletList) },
      orderedList: { HTMLAttributes: withClass(classes?.orderedList) },
      listItem: { HTMLAttributes: withClass(classes?.listItem) },
      blockquote: { HTMLAttributes: withClass(classes?.blockquote) },
      codeBlock: { HTMLAttributes: withClass(classes?.codeBlock) },
      code: { HTMLAttributes: withClass(classes?.code) },
      horizontalRule: { HTMLAttributes: withClass(classes?.horizontalRule) },
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: "https",
        HTMLAttributes: {
          ...withClass(classes?.link),
          target: "_blank",
          rel: "noopener noreferrer nofollow",
        },
      },
    }),
    TaskList.configure({ HTMLAttributes: withClass(classes?.taskList) }),
    taskItem.configure({ nested: true }),
    Markdown.configure({ markedOptions: { gfm: true } }),
  ];
}
