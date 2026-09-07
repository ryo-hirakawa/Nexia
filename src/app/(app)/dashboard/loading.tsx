export default function Loading() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="h-7 w-40 rounded bg-surface-2" />
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <div className="h-32 rounded-xl bg-navy/80 md:col-span-2 lg:col-span-1" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-line bg-surface" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-52 rounded-xl border border-line bg-surface" />
        ))}
      </div>
    </div>
  );
}
