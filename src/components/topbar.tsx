import { LogOut } from "lucide-react";

import { signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { LocaleSwitcher } from "@/components/locale-switcher";

export function Topbar({ user }: { user: { name?: string | null; email?: string | null } }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-end gap-3 border-b bg-background px-6">
      <LocaleSwitcher />
      <div className="text-sm text-muted-foreground">{user.name ?? user.email}</div>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/sign-in" });
        }}
      >
        <Button variant="ghost" size="sm" type="submit">
          <LogOut className="h-4 w-4" />
        </Button>
      </form>
    </header>
  );
}
