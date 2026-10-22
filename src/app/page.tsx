import { ArrowRight, GitBranch } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Features } from "@/components/landing/features";
import { ProductPreview } from "@/components/landing/product-preview";
import { SiteHeader } from "@/components/landing/site-header";
import { Walkthrough } from "@/components/landing/walkthrough";
import { AvatarStack } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Eyebrow, Kbd } from "@/components/ui/primitives";
import { people } from "@/lib/mock/people";

const benefits = [
  { title: "Nothing to install", body: "A workspace opens in any modern browser." },
  { title: "Multiplayer by default", body: "Every file is shared the moment it opens." },
  { title: "Calls beside the code", body: "Voice and video without a second app." },
  { title: "Keyboard-first", body: "Panels, runs and calls all have shortcuts." },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1 overflow-x-clip">
        {/* ---------------------------------------------------------- Hero */}
        <section className="relative pb-10 pt-14 sm:pt-20">
          <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
            <div className="stagger">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Eyebrow className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" /> Early preview
                </Eyebrow>
                <span className="hidden h-3 w-px bg-line-strong sm:block" />
                <Link
                  href="/docs"
                  className="group inline-flex items-center gap-1 text-[13px] text-fg-subtle transition-colors hover:text-fg"
                >
                  What&apos;s in the preview
                  <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              </div>

              <h1 className="mt-7 font-display text-[clamp(3.4rem,10vw,8.25rem)] font-normal leading-[0.92] tracking-[-0.025em] text-fg">
                Good code happens <br className="hidden md:block" />
                <em className="italic text-accent">together.</em>
              </h1>

              <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <div>
                  <p className="max-w-[31rem] text-[17px] leading-[1.65] text-fg-muted sm:text-[18px]">
                    A shared workspace for writing, debugging, and building together — with your team
                    right beside you.
                  </p>
                  <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <ButtonLink href="/dashboard" variant="primary" size="lg">
                      Open your workspace
                    </ButtonLink>
                    <ButtonLink href="#product" variant="secondary" size="lg" className="group">
                      Explore the product
                      <ArrowRight className="h-4 w-4 text-fg-subtle transition-transform duration-200 group-hover:translate-x-0.5" />
                    </ButtonLink>
                  </div>
                </div>

                {/* Technical metadata — what you'll find in the demo */}
                <dl className="hidden w-64 divide-y divide-line border-y border-line font-mono text-[12px] lg:block">
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="text-fg-subtle">session</dt>
                    <dd className="flex items-center gap-2 text-fg-muted">
                      <AvatarStack people={[people.priya, people.leo, people.mei]} size="xs" />3 live
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="text-fg-subtle">branch</dt>
                    <dd className="flex items-center gap-1.5 text-fg-muted">
                      <GitBranch className="h-3 w-3" /> orbit/main
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="text-fg-subtle">run</dt>
                    <dd className="flex gap-1">
                      <Kbd>⌘</Kbd>
                      <Kbd>↵</Kbd>
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>

          <div className="mx-auto mt-14 max-w-[1240px] px-3 sm:mt-20 sm:px-8">
            <ProductPreview />
          </div>
        </section>

        {/* -------------------------------------------------- Benefit strip */}
        <section aria-label="Why CodeLab" className="mx-auto max-w-[1200px] px-5 sm:px-8">
          <ul className="grid border-t border-line sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map((b) => (
              <li key={b.title} className="border-b border-line py-5 sm:py-6 lg:border-b-0 lg:pr-8">
                <p className="text-[14px] font-medium text-fg">{b.title}</p>
                <p className="mt-1 text-[13.5px] leading-[1.55] text-fg-subtle">{b.body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* ------------------------------------------------------- Features */}
        <section id="features" className="scroll-mt-14">
          <div className="mx-auto max-w-[1200px] px-5 py-24 sm:px-8 sm:py-32">
            <div className="reveal grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end">
              <div>
                <h2 className="max-w-[14ch] font-display text-[clamp(2.6rem,5.5vw,4.25rem)] leading-[1] tracking-[-0.02em]">
                  One workspace for the whole conversation.
                </h2>
              </div>
              <p className="max-w-md text-[16px] leading-7 text-fg-muted lg:pb-2">
                The editor, the terminal and the call share one surface, so context never gets
                lost between tabs, tools and screenshots.
              </p>
            </div>
            <div className="mt-14">
              <Features />
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------- Walkthrough */}
        <section id="product" className="scroll-mt-14 border-t border-line bg-panel">
          <div className="mx-auto max-w-[1200px] px-5 py-24 sm:px-8 sm:py-32">
            <div className="reveal mb-12 flex flex-col gap-4 sm:mb-16 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="max-w-[16ch] font-display text-[clamp(2.6rem,5.5vw,4.25rem)] leading-[1] tracking-[-0.02em]">
                  From blank file to shipped, in one place.
                </h2>
              </div>
              <p className="max-w-xs text-[15px] leading-6 text-fg-muted">
                A short tour of the preview. Every step is available in the demo workspace.
              </p>
            </div>
            <div className="reveal">
              <Walkthrough />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ Final CTA */}
        <section className="border-t border-line">
          <div className="reveal mx-auto grid max-w-[1200px] gap-10 px-5 py-24 sm:px-8 sm:py-28 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end">
            <h2 className="max-w-[16ch] font-display text-[clamp(2.4rem,5vw,4rem)] leading-[1.02] tracking-[-0.02em]">
              Bring your team into the same file.
            </h2>
            <div className="lg:pb-2">
              <p className="max-w-sm text-[15.5px] leading-7 text-fg-muted">
                Open the demo to edit, run and debug alongside a sample team, or start a project of
                your own.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                <ButtonLink href="/dashboard" variant="primary" size="lg">
                  Open your workspace
                </ButtonLink>
                <ButtonLink href="/workspace/demo" variant="ghost" size="lg" className="group">
                  Explore the demo
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </ButtonLink>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-8 px-5 py-10 text-[13px] text-fg-subtle sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="flex items-center gap-4">
            <Logo />
            <span className="text-fg-subtle">© 2026</span>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/#product" className="transition-colors hover:text-fg">
              Product
            </Link>
            <Link href="/#features" className="transition-colors hover:text-fg">
              Features
            </Link>
            <Link href="/docs" className="transition-colors hover:text-fg">
              Documentation
            </Link>
            <Link href="/dashboard" className="transition-colors hover:text-fg">
              Dashboard
            </Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
