'use client';

// Shimmer placeholder shown while the first batch of real posts is loading, so
// the feed feels alive and structured instantly instead of staring at a spinner.
// Mirrors the shape of a real Post card (avatar row → image → caption lines).

function SkeletonCard() {
  return (
    <div className="px-4 pt-4 pb-2" style={{ borderBottom: '1px solid #14141d' }}>
      {/* Header: avatar + name */}
      <div className="flex items-center gap-3 mb-3">
        <div className="shimmer rounded-full" style={{ width: 38, height: 38 }} />
        <div className="flex-1">
          <div className="shimmer rounded-md mb-1.5" style={{ width: '45%', height: 11 }} />
          <div className="shimmer rounded-md" style={{ width: '28%', height: 9 }} />
        </div>
        <div className="shimmer rounded-full" style={{ width: 60, height: 24 }} />
      </div>
      {/* Image */}
      <div className="shimmer rounded-2xl w-full" style={{ aspectRatio: '4 / 5' }} />
      {/* Caption lines */}
      <div className="mt-3 flex flex-col gap-2">
        <div className="shimmer rounded-md" style={{ width: '80%', height: 11 }} />
        <div className="shimmer rounded-md" style={{ width: '62%', height: 11 }} />
      </div>
    </div>
  );
}

export default function FeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div aria-hidden className="pt-1">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
