"use client";

import { Menu as MenuIcon, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const nav = [
  { href: "/#product", label: "Product" },
  { href: "/#features", label: "Features" },
  { href: "/docs", label: "Documentation" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="nav-scrolled sticky top-0 z-40 border-b border-line bg-canvas/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-6 px-5 sm:px-8">
        <div className="flex items-center gap-9">
          <Logo />
          <nav aria-label="Primary" className="hidden items-center gap-0.5 md:flex">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-2.5 py-1.5 text-[13.5px] text-fg-subtle transition-colors duration-150 hover:text-fg"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="hidden items-center gap-1.5 md:flex">
          <ButtonLink href="/login" variant="ghost" size="sm">
            Sign in
          </ButtonLink>
          <ButtonLink href="/dashboard" variant="primary" size="sm">
            Open your workspace
          </ButtonLink>
        </div>
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-hover hover:text-fg md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
        </button>
      </div>
      <nav
        id="mobile-nav"
        aria-label="Mobile"
        inert={!open}
        className={cn(
          "grid overflow-hidden border-line px-5 transition-[grid-template-rows,opacity,border-color] duration-300 ease-out md:hidden",
          open ? "grid-rows-[1fr] border-t opacity-100" : "grid-rows-[0fr] border-transparent opacity-0",
        )}
      >
        <div className="min-h-0">
          <div className="flex flex-col py-3">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-1 py-3 text-[16px] text-fg-muted hover:text-fg"
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="flex flex-col gap-2 border-t border-line pb-5 pt-4">
            <ButtonLink href="/dashboard" variant="primary" size="lg" onClick={() => setOpen(false)}>
              Open your workspace
            </ButtonLink>
            <ButtonLink href="/login" variant="secondary" size="lg" onClick={() => setOpen(false)}>
              Sign in
            </ButtonLink>
          </div>
        </div>
      </nav>
    </header>
  );
}
