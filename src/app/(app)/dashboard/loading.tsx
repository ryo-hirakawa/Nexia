export default function Loading() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="h-28 rounded-xl border border-line bg-surface" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl border border-line bg-surface" />
        ))}
      </div>
      <div className="h-20 rounded-xl border border-line bg-surface" />
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-52 rounded-xl border border-line bg-surface" />
        ))}
      </div>
    </div>
  );
}
