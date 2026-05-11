"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/nav";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="sticky top-0 flex h-screen w-[220px] shrink-0 flex-col border-r"
      style={{
        background: "var(--color-bg-base)",
        borderColor: "var(--color-line-1)",
      }}
    >
      <div className="flex items-center gap-2 px-5 pt-6 pb-8">
        <TowerMark />
        <span
          className="text-[15px] font-semibold lowercase"
          style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.05em" }}
        >
          atlas
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-6">
        {NAV.map((group) => (
          <div key={group.group} className="mb-6">
            <div className="eyebrow px-2 pb-2">{group.group}</div>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`nav-item ${active ? "active" : ""}`}
                    >
                      <span>{item.label}</span>
                      {item.badge && (
                        <span
                          className="rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                          style={{
                            background: "var(--color-em-soft)",
                            color: "var(--color-em-2)",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div
        className="mx-3 mb-4 flex items-center gap-2 rounded-md border px-2 py-2 transition-colors duration-200"
        style={{
          background: "var(--color-bg-1)",
          borderColor: "var(--color-line-1)",
        }}
      >
        <div
          className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold"
          style={{
            background: "var(--color-em-mute)",
            color: "var(--color-em-2)",
            fontFamily: "var(--font-mono)",
          }}
        >
          CI
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-[12px]" style={{ color: "var(--color-text-1)" }}>
            Comfort Industries
          </span>
          <span className="text-[10px]" style={{ color: "var(--color-text-3)" }}>
            Panipat workspace
          </span>
        </div>
      </div>
    </aside>
  );
}

function TowerMark() {
  return (
    <svg width="14" height="16" viewBox="0 0 14 16" fill="none">
      <rect x="4" y="0" width="6" height="6" fill="var(--color-em)" />
      <rect x="0" y="6" width="14" height="10" fill="var(--color-em)" />
    </svg>
  );
}
