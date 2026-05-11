"use client";

import { usePathname } from "next/navigation";
import { NAV } from "@/lib/nav";

function crumbFor(pathname: string): string {
  for (const group of NAV) {
    for (const item of group.items) {
      if (item.href === pathname) return `${group.group} · ${item.label}`;
      if (pathname.startsWith(item.href + "/")) return `${group.group} · ${item.label}`;
    }
  }
  return "atlas";
}

export function Topbar() {
  const pathname = usePathname();
  const crumb = crumbFor(pathname);

  return (
    <header
      className="sticky top-0 z-10 flex h-14 items-center justify-between border-b px-12 backdrop-blur"
      style={{
        background: "rgba(5, 10, 20, 0.72)",
        borderColor: "var(--color-line-1)",
      }}
    >
      <div className="flex items-center gap-3">
        <span className="eyebrow">{crumb}</span>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-[12px] transition-colors"
          style={{
            borderColor: "var(--color-line-2)",
            color: "var(--color-text-2)",
            background: "var(--color-bg-1)",
          }}
        >
          <span style={{ fontFamily: "var(--font-mono)" }}>ask atlas</span>
          <kbd
            className="rounded px-1 py-0.5 text-[10px]"
            style={{
              background: "var(--color-bg-3)",
              color: "var(--color-text-3)",
              fontFamily: "var(--font-mono)",
            }}
          >
            ⌘K
          </kbd>
        </button>
      </div>
    </header>
  );
}
