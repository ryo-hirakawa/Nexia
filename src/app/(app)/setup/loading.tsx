export default function Loading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-7 w-40 rounded bg-surface-2" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-32 rounded-lg border border-line bg-surface" />
      ))}
    </div>
  );
}
