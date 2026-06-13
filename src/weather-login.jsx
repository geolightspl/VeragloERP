/* Veraglo ERP — login page sunlight shell (weather UI removed; admin preview APIs kept). */
(function (VG) {
  const { useState, useEffect, useMemo } = React;
  const { Icon } = VG.ui;
  const CACHE_KEY = "veraglo-weather-login-cache";

  const STOCK_WALLPAPERS = {
    clear: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1600&q=80&auto=format&fit=crop",
    cloudy: "https://images.unsplash.com/photo-1534088568595-a066f410bcda?w=1600&q=80&auto=format&fit=crop",
    rain: "https://images.unsplash.com/photo-1428908728789-d2de25dbd4e2?w=1600&q=80&auto=format&fit=crop",
    fog: "https://images.unsplash.com/photo-1487621167305-5d79abf1eb26?w=1600&q=80&auto=format&fit=crop",
    storm: "https://images.unsplash.com/photo-1527482792272-97bdb9df0e2f?w=1600&q=80&auto=format&fit=crop",
    night: "https://images.unsplash.com/photo-1419242902214-272b403f7e42?w=1600&q=80&auto=format&fit=crop",
    snow: "https://images.unsplash.com/photo-1491002057636-b23be59eee26?w=1600&q=80&auto=format&fit=crop",
    default: "assets/happy-employees.png",
  };

  const THEME_STYLES = {
    clear: {
      gradient: "linear-gradient(115deg, rgba(14,116,190,.55) 0%, rgba(56,189,248,.35) 45%, rgba(15,23,42,.75) 100%)",
      accent: "#38bdf8",
      heroText: "#f8fafc",
    },
    cloudy: {
      gradient: "linear-gradient(115deg, rgba(71,85,105,.72) 0%, rgba(100,116,139,.45) 50%, rgba(15,23,42,.82) 100%)",
      accent: "#94a3b8",
      heroText: "#f1f5f9",
    },
    rain: {
      gradient: "linear-gradient(115deg, rgba(51,65,85,.85) 0%, rgba(71,85,105,.55) 40%, rgba(15,23,42,.9) 100%)",
      accent: "#64748b",
      heroText: "#e2e8f0",
    },
    fog: {
      gradient: "linear-gradient(115deg, rgba(120,113,108,.65) 0%, rgba(148,163,184,.4) 50%, rgba(30,41,59,.85) 100%)",
      accent: "#a8a29e",
      heroText: "#f5f5f4",
    },
    storm: {
      gradient: "linear-gradient(115deg, rgba(30,41,59,.92) 0%, rgba(51,65,85,.7) 45%, rgba(2,6,23,.95) 100%)",
      accent: "#818cf8",
      heroText: "#e2e8f0",
    },
    night: {
      gradient: "linear-gradient(115deg, rgba(15,23,42,.92) 0%, rgba(30,27,75,.75) 50%, rgba(2,6,23,.95) 100%)",
      accent: "#818cf8",
      heroText: "#e2e8f0",
    },
    snow: {
      gradient: "linear-gradient(115deg, rgba(148,163,184,.55) 0%, rgba(226,232,240,.35) 40%, rgba(30,41,59,.85) 100%)",
      accent: "#cbd5e1",
      heroText: "#f8fafc",
    },
    default: {
      gradient: "linear-gradient(110deg, rgba(8,13,24,.88) 0%, rgba(8,13,24,.65) 38%, rgba(8,13,24,.35) 100%)",
      accent: "#6366f1",
      heroText: "#f8fafc",
    },
  };

  const WEATHER_ICONS = {
    clear: "sun",
    cloudy: "cloud",
    rain: "cloud",
    fog: "cloud",
    storm: "alert",
    night: "moon",
    snow: "cloud",
    default: "sun",
  };

  function readCache(maxAgeMins) {
    try {
      const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (!raw || !raw.updatedAt) return null;
      const age = Date.now() - new Date(raw.updatedAt).getTime();
      if (age > (maxAgeMins || 30) * 60000) return null;
      return raw;
    } catch (e) {
      return null;
    }
  }

  function writeCache(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  function buildTheme(weather, settings) {
    const condition = (weather && weather.condition) || "default";
    const style = THEME_STYLES[condition] || THEME_STYLES.default;
    const wpCustom = settings && settings.wallpapers && settings.wallpapers[condition];
    const wallpaper = wpCustom || STOCK_WALLPAPERS[condition] || (settings && settings.defaultWallpaper) || STOCK_WALLPAPERS.default;
    return {
      condition,
      wallpaper,
      gradient: style.gradient,
      accent: style.accent,
      heroText: style.heroText,
      weather: weather || null,
      unavailable: !weather || weather.unavailable,
    };
  }

  function defaultTheme(settings) {
    const s = settings || {};
    return buildTheme(null, {
      defaultWallpaper: s.defaultWallpaper || STOCK_WALLPAPERS.default,
      wallpapers: s.wallpapers || {},
    });
  }

  async function fetchWeatherSettings() {
    const base = VG.apiBase != null ? String(VG.apiBase) : "";
    const res = await fetch(base + "/api/weather/settings");
    if (!res.ok) return { enabled: true, locationSource: "company", refreshIntervalMins: 30, defaultWallpaper: STOCK_WALLPAPERS.default, wallpapers: {} };
    const data = await res.json();
    return data;
  }

  function browserCoords() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 8000, maximumAge: 600000 }
      );
    });
  }

  async function fetchCurrentWeather(settings, coords) {
    const base = VG.apiBase != null ? String(VG.apiBase) : "";
    const source = settings.locationSource || "company";
    const params = new URLSearchParams({ source });
    if (source === "manual" && settings.manualCity) params.set("city", settings.manualCity);
    if (coords && coords.lat != null) {
      params.set("lat", String(coords.lat));
      params.set("lon", String(coords.lon));
      params.set("source", "browser");
    }
    const res = await fetch(base + "/api/weather/current?" + params.toString());
    return res.json();
  }

  function useLoginWeather() {
    const [theme, setTheme] = useState(() => defaultTheme());
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      let cancelled = false;
      (async () => {
        let settings = { enabled: true, locationSource: "company", refreshIntervalMins: 30 };
        try {
          settings = await fetchWeatherSettings();
        } catch (e) {}

        if (!settings.enabled) {
          if (!cancelled) {
            setTheme(defaultTheme(settings));
            setLoading(false);
          }
          return;
        }

        const cached = readCache(settings.refreshIntervalMins || 30);
        if (cached && cached.condition) {
          if (!cancelled) setTheme(buildTheme(cached, settings));
        } else if (!cancelled) {
          setTheme(defaultTheme(settings));
        }

        try {
          let coords = null;
          let effectiveSettings = settings;
          if (settings.locationSource === "browser") {
            coords = await browserCoords();
            if (!coords) effectiveSettings = { ...settings, locationSource: "company" };
          }
          const wx = await fetchCurrentWeather(effectiveSettings, coords);
          if (cancelled) return;
          if (wx && wx.ok) {
            const merged = { ...wx, settings: { wallpapers: settings.wallpapers, defaultWallpaper: settings.defaultWallpaper } };
            writeCache(wx);
            setTheme(buildTheme(wx, { wallpapers: settings.wallpapers, defaultWallpaper: settings.defaultWallpaper }));
          } else if (wx && wx.unavailable) {
            setTheme(buildTheme({ ...cached, unavailable: true, condition: cached?.condition || "default" }, settings));
          }
        } catch (e) {
          if (!cancelled) setTheme((t) => ({ ...t, unavailable: true }));
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => { cancelled = true; };
    }, []);

    return { theme, loading };
  }

  function WeatherLoginWidget({ theme, loading }) {
    const wx = theme.weather;
    const icon = WEATHER_ICONS[theme.condition] || "sun";
    const updated = wx && wx.updatedAt
      ? new Date(wx.updatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
      : null;

    return (
      <div className="vg-weather-widget glass rounded-2xl px-4 py-3 text-sm max-w-[240px] backdrop-blur-md border border-white/15 shadow-lg">
        {loading && !wx ? (
          <div className="flex items-center gap-2 opacity-70">
            <Icon name="clock" size={16} />
            <span className="text-xs">Loading weather…</span>
          </div>
        ) : wx && wx.ok !== false && wx.temperature != null ? (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider opacity-55 truncate">{wx.location || "Location"}</div>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-2xl font-display font-bold tabular-nums">{wx.temperature}°</span>
                  <span className="text-xs opacity-70">C</span>
                </div>
                <div className="text-xs opacity-80 mt-0.5">{wx.conditionLabel || "—"}</div>
              </div>
              <span className="grid place-items-center w-10 h-10 rounded-xl bg-white/10 shrink-0">
                <Icon name={icon} size={20} />
              </span>
            </div>
            <div className="mt-2 pt-2 border-t border-white/10 text-[10px] opacity-55 space-y-0.5">
              {wx.forecastSummary && <div className="line-clamp-2">{wx.forecastSummary}</div>}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                {wx.isRaining != null && <span>{wx.isRaining ? "Rain" : "Dry"}</span>}
                {wx.humidity != null && <span>Humidity {wx.humidity}%</span>}
                {wx.windSpeed != null && <span>Wind {wx.windSpeed} km/h</span>}
              </div>
              {updated && <div>Updated {updated}{wx.cached ? " · cached" : ""}</div>}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 text-xs opacity-60">
            <Icon name="cloud" size={16} />
            <span>Weather unavailable</span>
          </div>
        )}
      </div>
    );
  }

  function LoginWeatherShell({ children, header, hero }) {
    return (
      <div className="relative min-h-screen w-full overflow-hidden vg-login-sunlight">
        <div className="vg-sunlight-bg" aria-hidden="true" />
        <div className="vg-sunlight-rays" aria-hidden="true" />
        <div className="vg-sunlight-glow" aria-hidden="true" />

        <div className="relative z-10 min-h-screen flex flex-col">
          <div className="flex items-start justify-between gap-4 px-6 sm:px-10 py-6">
            <div className="flex-1 min-w-0">{header}</div>
          </div>

          <div className="flex-1 grid lg:grid-cols-2 items-center gap-10 px-6 sm:px-10 pb-14">
            {hero && (
              <div className="min-w-0 max-w-xl animate-fade-up hidden lg:block text-slate-800">
                {hero}
              </div>
            )}
            <div className="min-w-0 w-full max-w-md justify-self-center lg:justify-self-end animate-scale-in">
              {children}
            </div>
          </div>
        </div>
      </div>
    );
  }

  VG.useLoginWeather = useLoginWeather;
  VG.LoginWeatherShell = LoginWeatherShell;
  VG.WeatherLoginWidget = WeatherLoginWidget;
  VG.WEATHER_LOGIN_WALLPAPERS = STOCK_WALLPAPERS;
})(window.VG);
