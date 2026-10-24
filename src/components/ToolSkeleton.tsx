export default function ToolSkeleton() {
  return (
    <div className="grid h-full gap-3 p-3 md:grid-cols-2" aria-hidden="true" data-testid="tool-skeleton">
      <div className="animate-pulse rounded-[10px] border border-border-subtle bg-surface" />
      <div className="animate-pulse rounded-[10px] border border-border-subtle bg-surface" />
    </div>
  );
}
