import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col gap-5">
      <span className="eyebrow">404 · page not built yet</span>
      <h1
        className="max-w-[560px] text-[36px] leading-[1.1]"
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          letterSpacing: "-0.03em",
        }}
      >
        This route exists in the nav but hasn&rsquo;t been built yet.{" "}
        <span style={{ color: "var(--color-em)" }}>Phase 1 starts with Create PI.</span>
      </h1>
      <Link
        href="/"
        className="inline-flex w-fit items-center gap-2 rounded-md border px-3 py-1.5 text-[12px]"
        style={{
          borderColor: "var(--color-line-2)",
          color: "var(--color-text-2)",
          background: "var(--color-bg-1)",
          fontFamily: "var(--font-mono)",
        }}
      >
        ← back to today
      </Link>
    </div>
  );
}
