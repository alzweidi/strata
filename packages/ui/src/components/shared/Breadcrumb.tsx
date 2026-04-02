interface BreadcrumbProps {
  segments: readonly string[];
}

export function Breadcrumb({ segments }: BreadcrumbProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.3em] text-white/35">
      {segments.map((segment, index) => (
        <span key={`${segment}-${index}`} className="flex items-center gap-2">
          {index > 0 ? <span className="text-white/20">/</span> : null}
          <span>{segment}</span>
        </span>
      ))}
    </div>
  );
}

