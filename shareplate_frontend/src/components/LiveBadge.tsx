const LiveBadge = ({ label = "Live updates" }: { label?: string }) => (
  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
    {label}
  </span>
);

export default LiveBadge;
