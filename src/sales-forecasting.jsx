/* Veraglo ERP — Predictive sales analytics (forecasting, profitability). */
(function (VG) {
  const { useMemo } = React;
  const { Card, Pill, Button } = VG.ui;
  const store = VG.store;
  const inr = VG.fmt.inr;
  const { PageHead } = VG.fx;

  function monthKeys(n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      out.push(d.toISOString().slice(0, 7));
    }
    return out;
  }

  function linearForecast(series, ahead) {
    const n = series.length;
    if (n < 2) return Array(ahead).fill(series[n - 1] || 0);
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += i; sumY += series[i]; sumXY += i * series[i]; sumX2 += i * i;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX || 1);
    const intercept = (sumY - slope * sumX) / n;
    const out = [];
    for (let j = 1; j <= ahead; j++) {
      out.push(Math.max(0, Math.round(intercept + slope * (n - 1 + j))));
    }
    return out;
  }

  function futureMonthLabels(ahead) {
    const out = [];
    for (let i = 1; i <= ahead; i++) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() + i);
      out.push(d.toISOString().slice(0, 7).slice(5));
    }
    return out;
  }

  function SalesForecastingPage({ roleKey, can }) {
    VG.useDB();
    const months = useMemo(() => monthKeys(6), []);
    const invoices = store.list("invoices").filter((i) => i.status !== "Cancelled");

    const revenueByMonth = useMemo(() => months.map((ym) =>
      invoices.filter((i) => String(i.date || "").slice(0, 7) === ym)
        .reduce((s, i) => s + (Number((i.fxTotals && i.fxTotals.grandTotalInr) || i.amount) || 0), 0)
    ), [invoices]);

    const forecast = useMemo(() => linearForecast(revenueByMonth, 3), [revenueByMonth]);
    const forecastLabels = futureMonthLabels(3);
    const avgGrowth = revenueByMonth.length >= 2
      ? Math.round(((revenueByMonth[revenueByMonth.length - 1] - revenueByMonth[0]) / Math.max(revenueByMonth[0], 1)) * 100)
      : 0;

    const profitability = useMemo(() => {
      const byCustomer = {};
      store.list("invoices").forEach((inv) => {
        if (inv.status === "Cancelled") return;
        const cid = inv.customerId || "—";
        const rev = Number((inv.fxTotals && inv.fxTotals.grandTotalInr) || inv.amount) || 0;
        let cost = 0;
        (inv.lines || []).forEach((l) => {
          cost += (store.itemUnitCost ? store.itemUnitCost(l.itemId) : 0) * (Number(l.qty) || 0);
        });
        if (!byCustomer[cid]) byCustomer[cid] = { revenue: 0, cost: 0, invoices: 0 };
        byCustomer[cid].revenue += rev;
        byCustomer[cid].cost += cost;
        byCustomer[cid].invoices++;
      });
      return Object.keys(byCustomer).map((id) => {
        const c = store.get("customers", id) || {};
        const row = byCustomer[id];
        const margin = row.revenue - row.cost;
        const marginPct = row.revenue > 0 ? Math.round((margin / row.revenue) * 1000) / 10 : 0;
        return { id, name: c.name || id, ...row, margin, marginPct };
      }).sort((a, b) => b.margin - a.margin).slice(0, 10);
    }, [invoices]);

    const productProfit = useMemo(() => {
      const m = {};
      invoices.forEach((inv) => {
        (inv.lines || []).forEach((l) => {
          if (!l.itemId) return;
          const it = store.get("items", l.itemId) || {};
          const rev = (Number(l.qty) || 0) * (Number(l.rate) || 0);
          const cost = (store.itemUnitCost ? store.itemUnitCost(l.itemId) : 0) * (Number(l.qty) || 0);
          const k = l.itemId;
          if (!m[k]) m[k] = { sku: it.sku || l.sku, name: it.name || l.name, revenue: 0, cost: 0 };
          m[k].revenue += rev;
          m[k].cost += cost;
        });
      });
      return Object.values(m).map((r) => ({
        ...r,
        margin: r.revenue - r.cost,
        marginPct: r.revenue > 0 ? Math.round(((r.revenue - r.cost) / r.revenue) * 1000) / 10 : 0,
      })).sort((a, b) => b.margin - a.margin).slice(0, 8);
    }, [invoices]);

    function exportForecast() {
      const rows = [["Month", "Type", "INR"]];
      months.forEach((m, i) => rows.push([m, "actual", revenueByMonth[i]]));
      forecastLabels.forEach((m, i) => rows.push([m, "forecast", forecast[i]]));
      const csv = rows.map((r) => r.join(",")).join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      a.download = "sales-forecast.csv";
      a.click();
      VG.toast("Forecast exported");
    }

    const maxRev = Math.max.apply(null, revenueByMonth.concat(forecast).concat([1]));

    return (
      <div>
        <PageHead title="Sales Forecasting" desc="Revenue projection and profitability — 3-month linear forecast from invoice history" />
        <div className="flex justify-end mb-4 gap-2">
          <Pill color="#8b5cf6">{avgGrowth >= 0 ? "+" : ""}{avgGrowth}% 6-mo trend</Pill>
          {can("export") && <Button variant="soft" icon="download" onClick={exportForecast}>Export</Button>}
        </div>

        <Card className="p-4 mb-6">
          <div className="text-sm font-semibold mb-3">Revenue forecast (INR)</div>
          <div className="flex items-end gap-1.5 h-32 mb-2">
            {revenueByMonth.map((v, i) => (
              <div key={"a" + i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full rounded-t min-h-[6px]" style={{ height: Math.max(8, (v / maxRev) * 100) + "%", background: "#6366f1", opacity: 0.9 }} title={inr(v)} />
                <span className="text-[9px] opacity-45">{months[i].slice(5)}</span>
              </div>
            ))}
            {forecast.map((v, i) => (
              <div key={"f" + i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full rounded-t min-h-[6px] border border-dashed border-violet-400/50" style={{ height: Math.max(8, (v / maxRev) * 100) + "%", background: "rgba(139,92,246,0.35)" }} title={inr(v) + " (forecast)"} />
                <span className="text-[9px] opacity-45 text-violet-300">{forecastLabels[i]}</span>
              </div>
            ))}
          </div>
          <div className="text-[10px] opacity-45">Solid = actual invoices · Dashed = projected</div>
        </Card>

        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="text-sm font-semibold mb-3">Customer profitability</div>
            <div className="space-y-2">
              {profitability.length === 0 ? <div className="text-sm opacity-50 py-4 text-center">No invoice data</div> : profitability.map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-sm glass rounded-lg p-2">
                  <span className="flex-1 truncate">{r.name}</span>
                  <span className="text-xs tabular-nums opacity-70">{inr(r.margin)}</span>
                  <Pill color={r.marginPct >= 20 ? "#22c55e" : r.marginPct >= 10 ? "#f59e0b" : "#ef4444"}>{r.marginPct}%</Pill>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-sm font-semibold mb-3">Product margin leaders</div>
            <div className="space-y-2">
              {productProfit.map((r) => (
                <div key={r.sku + r.name} className="flex items-center gap-2 text-sm glass rounded-lg p-2">
                  <span className="flex-1 truncate font-mono text-xs">{r.sku}</span>
                  <span className="text-xs opacity-60 truncate max-w-[120px]">{r.name}</span>
                  <Pill color="#34d399">{r.marginPct}%</Pill>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  VG.SalesForecastingPage = SalesForecastingPage;
})(window.VG);
