export default function Loading() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="h-7 w-24 rounded bg-surface-2" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-line bg-surface" />
        ))}
      </div>
      <div className="h-64 rounded-xl border border-line bg-surface" />
      <div className="h-40 rounded-xl border border-line bg-surface" />
    </div>
  );
}
