import { cn } from "@/lib/utils";

export function LazyModal({ open }: { open: boolean }) {
  if (!open) return null;
  return <div className={cn("modal")}>Lazy modal</div>;
}
