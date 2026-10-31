import { useParams } from "@tanstack/react-router";
import { FocusEditor } from "../editor/FocusEditor.tsx";

export function FocusPage() {
  const { id } = useParams({ from: "/item/$id/write" });
  return <FocusEditor id={id} />;
}
