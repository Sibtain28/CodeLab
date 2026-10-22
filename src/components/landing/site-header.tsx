"use client";

import { ArrowRight, Menu as MenuIcon, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/brand/logo";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { Menu } from "@/components/ui/menu";
import { cn } from "@/lib/cn";

const nav = [
  { href: "/#product", label: "Product" },
  { href: "/#features", label: "Features" },
  { href: "/docs", label: "Documentation" },
];

function SignInNote() {
  return (
    <div className="w-72 p-3">
      <p className="text-[13px] font-medium text-fg">Accounts are on the way</p>
      <p className="mt-1 text-[12.5px] leading-5 text-fg-subtle">
        Sign-in arrives in the next phase. Until then the dashboard runs on sample data — no
        account needed.
      </p>
      <ButtonLink href="/dashboard" variant="secondary" size="sm" className="mt-3 w-full">
        Continue to dashboard <ArrowRight className="h-3.5 w-3.5" />
      </ButtonLink>
    </div>
  );
}

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
          <Menu
            label="Sign in"
            trigger={({ toggle, open: menuOpen, ...aria }) => (
              <button
                type="button"
                onClick={toggle}
                {...aria}
                className={cn(buttonClasses({ variant: "ghost", size: "sm" }), menuOpen && "bg-hover text-fg")}
              >
                Sign in
              </button>
            )}
          >
            {() => <SignInNote />}
          </Menu>
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
            <p className="text-center text-[12px] text-fg-subtle">
              Sign-in arrives in the next phase — the dashboard runs on sample data.
            </p>
          </div>
        </div>
      </nav>
    </header>
  );
}
