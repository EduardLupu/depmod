import { cn } from "@/lib/utils";
import type { User } from "@/lib/utils";

export interface HeaderProps {
  user: User | null;
}

export function Header({ user }: HeaderProps) {
  return (
    <header className={cn("header", user && "header--logged-in")}>
      {user ? user.name : "Guest"}
    </header>
  );
}
