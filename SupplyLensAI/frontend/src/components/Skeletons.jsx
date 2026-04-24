export function SkeletonCard({ className = "" }) {
  return <div className={`skeleton ${className}`.trim()} aria-hidden="true" />;
}

export function PageSkeleton({ blocks = 4 }) {
  return (
    <div className="page-grid">
      <div className="metric-grid">
        {Array.from({ length: blocks }, (_, index) => (
          <SkeletonCard key={index} className="skeleton--metric" />
        ))}
      </div>
      <SkeletonCard className="skeleton--panel" />
      <SkeletonCard className="skeleton--panel" />
    </div>
  );
}
