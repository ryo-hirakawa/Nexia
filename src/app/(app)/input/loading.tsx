export default function Loading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-7 w-32 rounded bg-surface-2" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-28 rounded-lg border border-line bg-surface" />
      ))}
    </div>
  );
}
