import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex h-14 w-full max-w-[1200px] items-center px-5 sm:px-8">
        <Logo />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-[8vh] sm:items-center sm:pt-0">
        <div className="w-full max-w-[400px] animate-rise">{children}</div>
      </main>
    </div>
  );
}
