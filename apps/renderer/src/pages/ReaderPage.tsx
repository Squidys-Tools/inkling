import { useParams } from "@tanstack/react-router";
import { ReaderView } from "../reader/ReaderView.tsx";

export function ReaderPage() {
  const { id } = useParams({ from: "/item/$id/read" });
  return <ReaderView id={id} />;
}
