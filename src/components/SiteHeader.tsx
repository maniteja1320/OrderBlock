"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "./ThemeProvider";

const links = [
  { href: "/terminal", label: "Terminal" },
  { href: "/structure", label: "Structure" },
  { href: "/smart-money", label: "Smart Money" },
  { href: "/journal", label: "Journal" },
  { href: "/learn", label: "Learn" },
  { href: "/community", label: "Community" },
  { href: "/updates", label: "Updates" },
  { href: "/about", label: "About" },
];

export function SiteHeader({ solid = false }: { solid?: boolean }) {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();

  return (
    <header
      className={`sticky top-0 z-40 border-b ${
        solid
          ? "border-[var(--border)] bg-[var(--bg)]"
          : "border-transparent bg-[var(--bg)]/80 backdrop-blur-md"
      }`}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[var(--accent)] text-xs font-bold text-white">
            OB
          </span>
          <span>OrderBlock</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-md px-3 py-1.5 text-sm transition ${
                pathname?.startsWith(l.href)
                  ? "bg-[var(--surface-2)] text-[var(--fg)]"
                  : "text-[var(--muted)] hover:text-[var(--fg)]"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            aria-label="Toggle theme"
            className="rounded-md border border-[var(--border)] px-2.5 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--fg)]"
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
          <Link
            href="/login"
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            Sign in
          </Link>
        </div>
      </div>
    </header>
  );
}
