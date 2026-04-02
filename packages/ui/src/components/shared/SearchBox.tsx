interface SearchBoxProps {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}

export function SearchBox({
  value,
  placeholder = "Search files or authors",
  onChange,
}: SearchBoxProps) {
  return (
    <label className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80">
      <span className="font-mono text-xs uppercase tracking-[0.3em] text-white/40">
        Find
      </span>
      <input
        className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

