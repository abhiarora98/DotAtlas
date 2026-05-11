"use client";

import { useEffect, useState } from "react";

type TimeBucket = "morning" | "midday" | "evening" | "night";

function bucketFor(d: Date): TimeBucket {
  const h = d.getHours();
  if (h < 11) return "morning";
  if (h < 16) return "midday";
  if (h < 21) return "evening";
  return "night";
}

const HEROES: Record<
  TimeBucket,
  { eb: string; headline: React.ReactNode; when: string[] }
> = {
  morning: {
    eb: "today · morning brief",
    headline: (
      <>
        <span className="em">Three things</span> matter{" "}
        <span className="accent">before 11 AM</span>. The shell is up; the
        first real surface is <b>Create PI</b>.
      </>
    ),
    when: ["morning brief", "operate · sense · studio"],
  },
  midday: {
    eb: "today · midday ops",
    headline: (
      <>
        <span className="em">Wheels turning</span>,{" "}
        <span className="accent">paper clean</span>. The shell is up; the
        first real surface is <b>Create PI</b>.
      </>
    ),
    when: ["midday ops", "operate · sense · studio"],
  },
  evening: {
    eb: "today · evening wrap",
    headline: (
      <>
        <span className="em">Close the day</span>,{" "}
        <span className="accent">queue tomorrow</span>. The shell is up; the
        first real surface is <b>Create PI</b>.
      </>
    ),
    when: ["evening wrap", "operate · sense · studio"],
  },
  night: {
    eb: "today · after hours",
    headline: (
      <>
        <span className="em">Quiet hours</span>.{" "}
        <span className="accent">Tomorrow drafts</span> are warming up. The
        shell is up; the first real surface is <b>Create PI</b>.
      </>
    ),
    when: ["after hours", "operate · sense · studio"],
  },
};

function fmtClock(d: Date) {
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function fmtDate(d: Date) {
  return d
    .toLocaleDateString("en-IN", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    })
    .toUpperCase();
}

export default function TodayPage() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const bucket: TimeBucket = now ? bucketFor(now) : "midday";
  const hero = HEROES[bucket];

  return (
    <div className="flex flex-col gap-8">
      <section className="hero">
        <div className="flex items-end justify-between gap-10">
          <div className="flex flex-col">
            <span className="eyebrow mb-3.5">
              <span className="live-dot" aria-hidden />
              {hero.eb}
            </span>
            <h1>{hero.headline}</h1>
          </div>

          <div className="when shrink-0">
            <div>
              <b>{now ? fmtClock(now) : "—"}</b>
            </div>
            <div>{now ? fmtDate(now) : "—"}</div>
            <div className="mt-1">{hero.when[0]}</div>
            <div style={{ opacity: 0.6 }}>{hero.when[1]}</div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-4">
        {[
          {
            eb: "Phase 0",
            label: "Scaffold + shell",
            value: "shipped",
            valueColor: "var(--color-em)",
            sub: "Next.js, tokens, sidebar, topbar.",
          },
          {
            eb: "Phase 1",
            label: "Create PI → Sheets",
            value: "next",
            valueColor: "var(--color-blue)",
            sub: "Multi-line form, Apps Script, live totals.",
          },
          {
            eb: "Phase 2+",
            label: "Other 10 pages",
            value: "queued",
            valueColor: "var(--color-text-3)",
            sub: "Orders, Parties, Inventory, Dispatch, ...",
          },
        ].map((c) => (
          <article key={c.eb} className="card">
            <div className="eyebrow mb-3">
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: c.valueColor,
                  display: "inline-block",
                }}
                aria-hidden
              />
              {c.eb}
            </div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                fontSize: 22,
                letterSpacing: "-0.02em",
                color: "var(--color-text-1)",
              }}
            >
              {c.label}
            </div>
            <div
              className="mt-3 inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-[10px] uppercase tracking-wider"
              style={{
                color: c.valueColor,
                background: "var(--color-bg-2)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {c.value}
            </div>
            <p
              className="mt-3 text-[12.5px]"
              style={{ color: "var(--color-text-3)" }}
            >
              {c.sub}
            </p>
          </article>
        ))}
      </section>

      <section className="flex items-center gap-3">
        <span className="chip emerald">create pi</span>
        <span className="chip">orders</span>
        <span className="chip">parties</span>
        <span className="chip">inventory</span>
        <span style={{ color: "var(--color-text-3)", fontSize: 12 }}>
          ← hover any to feel the motion
        </span>
      </section>
    </div>
  );
}
