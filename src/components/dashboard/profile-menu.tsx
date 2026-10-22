"use client";

import { ChevronDown, Keyboard, LogOut, Play, Settings, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { cn } from "@/lib/cn";
import { currentUser } from "@/lib/mock/people";

export function ProfileMenu({ onShowShortcuts }: { onShowShortcuts: () => void }) {
  const router = useRouter();
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
          <Avatar name={currentUser.name} color={currentUser.color} size="sm" status="online" />
          <ChevronDown
            className={cn("h-3.5 w-3.5 text-fg-subtle transition-transform duration-200", open && "rotate-180")}
          />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="flex items-center gap-3 px-2.5 pb-2 pt-2">
            <Avatar name={currentUser.name} color={currentUser.color} size="md" />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-fg">{currentUser.name}</p>
              <p className="truncate text-[12px] text-fg-subtle">{currentUser.email}</p>
            </div>
          </div>
          <p className="mx-1.5 mb-1 rounded-md bg-raised px-2 py-1.5 text-[11.5px] leading-4 text-fg-subtle">
            Sample profile — sign-in arrives in Phase 2.
          </p>
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
          <MenuItem icon={<LogOut />} disabled hint="Phase 2">
            Sign out
          </MenuItem>
        </>
      )}
    </Menu>
  );
}
