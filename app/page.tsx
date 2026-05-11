export default function TodayPage() {
  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="live-dot" aria-hidden />
            <span className="eyebrow">Today · live</span>
          </div>
          <h1
            className="max-w-[640px] text-[44px] leading-[1.05]"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              letterSpacing: "-0.03em",
            }}
          >
            The shell is up.{" "}
            <span style={{ color: "var(--color-em)" }}>
              Pages land here, one at a time.
            </span>
          </h1>
          <p
            className="max-w-[560px] text-[14px]"
            style={{ color: "var(--color-text-2)" }}
          >
            atlas just moved from a static prototype to a real Next.js app on
            this URL. Nothing is wired to your sheet yet — that&rsquo;s next.
            The first real page will be{" "}
            <span style={{ color: "var(--color-text-1)" }}>Create PI</span>,
            built from your Masters columns and writing back to Google Sheets
            via Apps Script.
          </p>
        </div>

        <div
          className="flex flex-col items-end gap-1 rounded-md border px-4 py-3"
          style={{
            borderColor: "var(--color-line-1)",
            background: "var(--color-bg-1)",
          }}
        >
          <span className="eyebrow">Status</span>
          <span
            className="text-[12px]"
            style={{ color: "var(--color-text-1)", fontFamily: "var(--font-mono)" }}
          >
            phase 0 · shell only
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          {
            title: "Phase 0",
            sub: "Scaffold + shell",
            status: "shipped",
            statusColor: "var(--color-em)",
          },
          {
            title: "Phase 1",
            sub: "Create PI → Sheets",
            status: "next",
            statusColor: "var(--color-blue)",
          },
          {
            title: "Phase 2+",
            sub: "Other 10 pages",
            status: "queued",
            statusColor: "var(--color-text-3)",
          },
        ].map((p) => (
          <div
            key={p.title}
            className="rounded-lg border p-5"
            style={{
              borderColor: "var(--color-line-1)",
              background: "var(--color-bg-1)",
            }}
          >
            <div className="eyebrow pb-3">{p.title}</div>
            <div
              className="text-[18px]"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                color: "var(--color-text-1)",
              }}
            >
              {p.sub}
            </div>
            <div
              className="mt-3 inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-[10px] uppercase tracking-wider"
              style={{
                color: p.statusColor,
                background: "var(--color-bg-2)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {p.status}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
