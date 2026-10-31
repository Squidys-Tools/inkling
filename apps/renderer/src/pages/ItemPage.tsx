import { useParams } from "@tanstack/react-router";
import { ItemView } from "../item/ItemView.tsx";

export function ItemPage() {
  const { id } = useParams({ from: "/item/$id" });
  return <ItemView id={id} />;
}
