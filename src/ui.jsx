/* Veraglo ERP — reusable UI primitives: icons, glass cards, KPI cards,
   and dependency-free SVG charts. Exposed on VG.ui. */
(function (VG) {
  const { useState, useEffect, useRef } = React;

  /* ---------------- Icon system (inline SVG, stroke based) ---------------- */
  const P = {
    trending: "M3 17l6-6 4 4 8-8M21 7v6h-6",
    inbox: "M4 13h4l1.5 3h5L16 13h4M4 13l2.5-7h11L20 13v6H4z",
    box: "M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8",
    cart: "M3 4h2l2.5 12h11l2-8H6M9 20a1 1 0 102 0 1 1 0 10-2 0M17 20a1 1 0 102 0 1 1 0 10-2 0",
    handshake: "M8 12l3-3 3 3 3-3M3 9l4-3 5 3 5-3 4 3v6l-4 3-3-3M3 9v6l4 3 3-3",
    factory: "M3 21h18M5 21V9l5 4V9l5 4V5h4v16M9 17h2M14 17h2",
    shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3zM9 12l2 2 4-4",
    users: "M16 19v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 9a3 3 0 100-6 3 3 0 000 6M22 19v-2a4 4 0 00-3-3.9M16 3.1A4 4 0 0116 11",
    clock: "M12 22a10 10 0 100-20 10 10 0 000 20zM12 7v5l3 2",
    truck: "M1 6h13v9H1zM14 9h4l3 3v3h-7M5 18a1.5 1.5 0 103 0 1.5 1.5 0 10-3 0M16 18a1.5 1.5 0 103 0 1.5 1.5 0 10-3 0",
    rupee: "M7 5h10M7 9h10M7 5c5 0 7 1 7 4s-3 4-7 4l6 6M7 13h3",
    chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
    headset: "M4 13a8 8 0 0116 0M4 13v4a2 2 0 002 2h1v-7H6a2 2 0 00-2 2zM20 13v4a2 2 0 01-2 2h-1v-7h1a2 2 0 012 2z",
    folder: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z",
    settings:
      "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1V21a2 2 0 11-4 0v-.1A1.6 1.6 0 007 19.4a1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00-1.1-2.7H1a2 2 0 110-4h.1A1.6 1.6 0 002.6 7a1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H7a1.6 1.6 0 001-1.5V1a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V7a1.6 1.6 0 001.5 1H23a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z",
    search: "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3",
    bell: "M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0",
    message: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z",
    alert: "M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
    sun: "M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
    moon: "M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z",
    logout: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9",
    grid: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
    menu: "M3 12h18M3 6h18M3 18h18",
    chevron: "M6 9l6 6 6-6",
    chevronLeft: "M15 18l-6-6 6-6",
    chevronRight: "M9 18l6-6-6-6",
    user: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z",
    plus: "M12 5v14M5 12h14",
    check: "M20 6L9 17l-5-5",
    x: "M18 6L6 18M6 6l12 12",
    calendar: "M3 5h18v16H3zM3 9h18M8 3v4M16 3v4",
    download: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3",
    upload: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 9l5-5 5 5M12 4v12",
    cloud: "M7 18a4 4 0 01-.5-7.97 5.5 5.5 0 0110.6-1.5A3.5 3.5 0 0117 18H7z",
    server: "M4 4h16v6H4zM4 14h16v6H4zM7 7h.01M7 17h.01",
    database: "M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6",
    refresh: "M21 12a9 9 0 11-2.6-6.4M21 4v5h-5",
    printer: "M6 9V3h12v6M6 18H4a2 2 0 01-2-2v-3a2 2 0 012-2h16a2 2 0 012 2v3a2 2 0 01-2 2h-2M6 14h12v7H6z",
    filter: "M3 4h18l-7 8v6l-4 2v-8z",
    sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z",
    flow: "M4 6h6M14 6h6M4 18h6M14 18h6M10 6a2 2 0 012-2h0a2 2 0 012 2M10 18a2 2 0 012 2h0a2 2 0 012-2M12 8v8",
    link: "M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71",
    dot: "M12 12h.01",
    lock: "M5 11h14v10H5zM8 11V7a4 4 0 018 0v4",
    eye: "M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z M12 15a3 3 0 100-6 3 3 0 000 6",
    add: "M12 5v14M5 12h14",
    edit: "M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z",
    trash: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14",
    star: "M12 3l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 18l-5.9 3 1.2-6.5L2.5 9.9 9 9z",
    activity: "M22 12h-4l-3 9L9 3l-3 9H2",
  };

  function Icon({ name, size = 18, className = "", strokeWidth = 1.8, style }) {
    const d = P[name] || P.dot;
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        style={style}
        aria-hidden="true"
      >
        <path d={d} />
      </svg>
    );
  }

  /* ---------------- Charts (pure SVG) ---------------- */
  function Sparkline({ data, color = "var(--accent)", height = 64, fill = true, id }) {
    const w = 280;
    const h = height;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = max - min || 1;
    const pts = data.map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - 6 - ((v - min) / span) * (h - 14);
      return [x, y];
    });
    const line = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    const area = `0,${h} ${line} ${w},${h}`;
    const gid = "spark-" + (id || color.replace(/[^a-z0-9]/gi, ""));
    return (
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.32" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {fill && <polygon points={area} fill={`url(#${gid})`} />}
        <polyline points={line} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3.4" fill={color} />
      </svg>
    );
  }

  function Bars({ data, color = "var(--accent)", height = 120 }) {
    const max = Math.max(...data) || 1;
    return (
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((v, i) => (
          <div key={i} className="flex-1 rounded-t-md transition-all duration-500"
            style={{
              height: `${(v / max) * 100}%`,
              background: `linear-gradient(180deg, ${color}, ${color}55)`,
              minHeight: 4,
            }}
            title={String(v)}
          />
        ))}
      </div>
    );
  }

  function Donut({ data, size = 140, thickness = 16 }) {
    const total = data.reduce((s, d) => s + d.value, 0) || 1;
    const r = (size - thickness) / 2;
    const c = 2 * Math.PI * r;
    let offset = 0;
    return (
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity="0.10" strokeWidth={thickness} />
          {data.map((d, i) => {
            const len = (d.value / total) * c;
            const seg = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={d.color}
                strokeWidth={thickness}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
                style={{ transition: "stroke-dasharray .6s ease" }}
              />
            );
            offset += len;
            return seg;
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="text-xl font-semibold leading-none">{total}</div>
            <div className="text-[10px] uppercase tracking-wider opacity-60 mt-1">total</div>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- Building blocks ---------------- */
  function Card({ className = "", children, glow = false, hover = false, ...rest }) {
    return (
      <div
        className={
          "vg-panel rounded-xl " + (glow ? "accent-ring " : "") + (hover ? "vg-panel-hover " : "") + className
        }
        {...rest}
      >
        {children}
      </div>
    );
  }

  function SectionTitle({ icon, title, action }) {
    return (
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon && <Icon name={icon} size={16} className="opacity-70" />}
          <h3 className="text-sm font-semibold tracking-wide">{title}</h3>
        </div>
        {action}
      </div>
    );
  }

  function KpiCard({ kpi, delay = 0 }) {
    const up = kpi.trend === "up";
    const down = kpi.trend === "down";
    const tone = up ? "#34d399" : down ? "#f87171" : "#94a3b8";
    return (
      <Card className="vg-kpi-card vg-kpi-card-compact p-3 sm:p-3.5 animate-fade-up overflow-hidden relative vg-panel-hover" style={{ animationDelay: delay + "ms" }}>
        <div className="text-xl sm:text-2xl font-semibold font-display text-[var(--vg-heading)] leading-none tabular-nums">{kpi.value}</div>
        <div className="mt-2.5 flex items-center gap-2 min-w-0">
          <span className="vg-kpi-foot-icon grid place-items-center w-8 h-8 rounded-lg shrink-0 text-white" style={{ background: "var(--accent)" }}>
            <Icon name={up ? "trending" : down ? "chart" : "chart"} size={15} />
          </span>
          <span className="text-xs sm:text-sm font-medium opacity-80 truncate">{kpi.label}</span>
        </div>
        {kpi.delta && (
          <div className="mt-1.5 pl-10 flex items-center gap-1 text-[10px] font-medium" style={{ color: tone }}>
            <Icon name={up ? "trending" : down ? "chart" : "dot"} size={11} />
            <span>{kpi.delta}</span>
          </div>
        )}
      </Card>
    );
  }

  function Pill({ children, color, className = "" }) {
    const c = color || "#94a3b8";
    return (
      <span
        className={"vg-status-badge " + className}
        style={{
          background: "color-mix(in srgb, " + c + " 14%, transparent)",
          color: c,
          borderColor: "color-mix(in srgb, " + c + " 28%, transparent)",
        }}
      >
        {children}
      </span>
    );
  }

  function Button({ children, variant = "solid", icon, className = "", ...rest }) {
    const base =
      "vg-btn-premium inline-flex items-center justify-center gap-2 rounded-xl font-semibold px-4 py-2.5 disabled:opacity-40 disabled:cursor-not-allowed";
    const styles = {
      solid: "vg-btn-solid",
      soft: "vg-btn-soft",
      ghost: "opacity-85 hover:opacity-100 hover:bg-white/10",
    };
    return (
      <button className={`${base} ${styles[variant] || styles.soft} ${className}`} {...rest}>
        {icon && <Icon name={icon} size={15} />}
        {children}
      </button>
    );
  }

  function Toggle({ on, onChange, labels = ["", ""] }) {
    return (
      <button
        onClick={() => onChange(!on)}
        className="relative inline-flex h-7 w-12 items-center rounded-full transition-colors glass"
        aria-pressed={on}
      >
        <span
          className="inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-300"
          style={{ transform: on ? "translateX(24px)" : "translateX(4px)" }}
        />
      </button>
    );
  }

  function useClock() {
    const [now, setNow] = useState(new Date());
    useEffect(() => {
      const t = setInterval(() => setNow(new Date()), 1000 * 30);
      return () => clearInterval(t);
    }, []);
    return now;
  }

  VG.ui = { Icon, Sparkline, Bars, Donut, Card, SectionTitle, KpiCard, Pill, Button, Toggle, useClock };
})(window.VG);
