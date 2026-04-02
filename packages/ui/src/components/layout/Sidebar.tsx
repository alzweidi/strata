import { NavLink } from "react-router-dom";

const routes = [
  { to: "/", label: "Overview" },
  { to: "/hotspots", label: "Hotspots" },
  { to: "/bus-factor", label: "Bus Factor" },
  { to: "/age", label: "Age" },
  { to: "/coupling", label: "Coupling" },
  { to: "/loc", label: "LOC" },
  { to: "/authors", label: "Authors" },
  { to: "/commits", label: "Commits" },
  { to: "/explorer", label: "Explorer" },
];

export function Sidebar() {
  return (
    <aside className="hidden border-r border-white/8 bg-black/15 px-5 py-6 lg:block">
      <div className="rounded-[1.75rem] border border-emerald-400/15 bg-gradient-to-br from-emerald-400/12 via-cyan-400/8 to-transparent p-5">
        <p className="font-mono text-xs uppercase tracking-[0.4em] text-emerald-300/70">
          Strata
        </p>
        <p className="mt-4 text-sm leading-6 text-white/68">
          Repository intelligence for people who want history, structure, and risk in
          one local surface.
        </p>
      </div>

      <nav className="mt-8 space-y-2">
        {routes.map((route) => (
          <NavLink
            key={route.to}
            to={route.to}
            className={({ isActive }) =>
              [
                "block rounded-2xl px-4 py-3 text-sm transition",
                isActive
                  ? "border border-emerald-400/35 bg-emerald-400/12 text-white shadow-[0_16px_48px_rgba(0,255,136,0.08)]"
                  : "border border-transparent text-white/60 hover:border-white/10 hover:bg-white/4 hover:text-white",
              ].join(" ")
            }
          >
            {route.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

