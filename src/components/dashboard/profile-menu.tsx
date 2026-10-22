"use client";

import { ChevronDown, Keyboard, LogOut, Play, Settings, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { cn } from "@/lib/cn";
import { signOut } from "@/server/actions/auth";

export function ProfileMenu({
  user,
  onShowShortcuts,
}: {
  user: { name: string; email: string };
  onShowShortcuts: () => void;
}) {
  const router = useRouter();
  const [signingOut, startSignOut] = useTransition();
  return (
    <Menu
      label="Account"
      trigger={({ toggle, open, ...aria }) => (
        <button
          type="button"
          onClick={toggle}
          {...aria}
          aria-label="Open account menu"
          className={cn(
            "flex items-center gap-1.5 rounded-full p-0.5 pr-1.5 transition-colors duration-150 hover:bg-hover",
            open && "bg-hover",
          )}
        >
          <Avatar name={user.name} color="accent" size="sm" status="online" />
          <ChevronDown
            className={cn("h-3.5 w-3.5 text-fg-subtle transition-transform duration-200", open && "rotate-180")}
          />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="flex items-center gap-3 px-2.5 pb-2 pt-2">
            <Avatar name={user.name} color="accent" size="md" />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-fg">{user.name}</p>
              <p className="truncate text-[12px] text-fg-subtle">{user.email}</p>
            </div>
          </div>
          <MenuSeparator />
          <MenuItem
            icon={<Play />}
            onSelect={() => {
              close();
              router.push("/workspace/demo");
            }}
          >
            Open demo workspace
          </MenuItem>
          <MenuItem
            icon={<Keyboard />}
            hint="?"
            onSelect={() => {
              close();
              onShowShortcuts();
            }}
          >
            Keyboard shortcuts
          </MenuItem>
          <MenuItem icon={<UserRound />} disabled hint="Soon">
            Profile
          </MenuItem>
          <MenuItem icon={<Settings />} disabled hint="Soon">
            Settings
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            icon={<LogOut />}
            disabled={signingOut}
            onSelect={() => {
              close();
              startSignOut(() => signOut());
            }}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </MenuItem>
        </>
      )}
    </Menu>
  );
}
