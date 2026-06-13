/* Veraglo ERP — Sales analytics (funnel, win/loss, territory, export trends). */
(function (VG) {
  const { useMemo } = React;
  const { Icon, Card, Pill, Button } = VG.ui;
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

  function countByMonth(rows, dateKey) {
    const months = monthKeys(6);
    return months.map((ym) => rows.filter((r) => String(r[dateKey] || "").slice(0, 7) === ym).length);
  }

  function sumByMonth(rows, dateKey, valFn) {
    const months = monthKeys(6);
    return months.map((ym) => rows.filter((r) => String(r[dateKey] || "").slice(0, 7) === ym).reduce((s, r) => s + (valFn(r) || 0), 0));
  }

  function BarChart({ title, labels, data, color, format }) {
    const max = Math.max.apply(null, data.concat([1]));
    return (
      <Card className="p-4">
        <div className="text-sm font-semibold mb-3">{title}</div>
        <div className="flex items-end gap-1.5 h-28">
          {data.map((v, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <div className="w-full rounded-t min-h-[6px] transition-all" style={{ height: Math.max(8, (v / max) * 100) + "%", background: color || "var(--accent)", opacity: v ? 0.92 : 0.2 }} title={format ? format(v) : String(v)} />
              <span className="text-[9px] opacity-45 truncate w-full text-center">{labels[i] ? labels[i].slice(5) : ""}</span>
            </div>
          ))}
        </div>
        <div className="text-[10px] opacity-45 mt-2">Total: {format ? format(data.reduce((a, b) => a + b, 0)) : data.reduce((a, b) => a + b, 0)}</div>
      </Card>
    );
  }

  function FunnelStep({ label, count, pct, color }) {
    const width = Math.max(28, Math.min(100, pct));
    return (
      <div className="flex items-center gap-3">
        <div className="w-28 text-xs opacity-70 shrink-0">{label}</div>
        <div className="flex-1 h-8 rounded-lg overflow-hidden glass relative">
          <div className="h-full rounded-lg flex items-center px-2 text-xs font-semibold tabular-nums" style={{ width: width + "%", background: color, minWidth: count ? "3rem" : "0" }}>{count}</div>
        </div>
        <span className="text-xs opacity-50 w-10 text-right tabular-nums">{pct}%</span>
      </div>
    );
  }

  function SalesAnalyticsPage({ roleKey, can }) {
    VG.useDB();
    const months = useMemo(() => monthKeys(6), []);
    const monthLabels = months.map((m) => m.slice(5));

    const enquiries = store.list("enquiries");
    const quotations = store.list("quotations");
    const orders = store.list("salesOrders");
    const invoices = store.list("invoices");
    const customers = store.list("customers");

    const funnel = useMemo(() => {
      const e = enquiries.length;
      const q = quotations.length;
      const o = orders.length;
      const i = invoices.length;
      const base = Math.max(e, 1);
      return [
        { label: "Enquiries", count: e, pct: 100, color: "#60a5fa" },
        { label: "Quotations", count: q, pct: Math.round((q / base) * 100), color: "#a78bfa" },
        { label: "Sales orders", count: o, pct: Math.round((o / base) * 100), color: "#6366f1" },
        { label: "Invoices", count: i, pct: Math.round((i / base) * 100), color: "#34d399" },
      ];
    }, [enquiries.length, quotations.length, orders.length, invoices.length]);

    const winLoss = useMemo(() => {
      const won = quotations.filter((q) => q.status === "Won").length;
      const lost = quotations.filter((q) => q.status === "Lost").length;
      const open = quotations.filter((q) => !["Won", "Lost", "Revised"].includes(q.status)).length;
      const total = Math.max(won + lost + open, 1);
      return { won, lost, open, winRate: won + lost ? Math.round((won / (won + lost)) * 100) : 0, total };
    }, [quotations]);

    const territory = useMemo(() => {
      const m = {};
      invoices.forEach((inv) => {
        const c = store.get("customers", inv.customerId) || {};
        const st = c.state || inv.buyerState || "Unknown";
        m[st] = (m[st] || 0) + (Number(inv.amount) || 0);
      });
      return Object.keys(m).map((k) => ({ state: k, value: m[k] })).sort((a, b) => b.value - a.value).slice(0, 8);
    }, [invoices]);

    const exportInvoices = useMemo(() => invoices.filter((i) => VG.isExportInvoiceType && VG.isExportInvoiceType(i.invoiceType)), [invoices]);
    const exportByMonth = useMemo(() => sumByMonth(exportInvoices, "date", (r) => Number((r.fxTotals && r.fxTotals.grandTotalInr) || r.amount) || 0), [exportInvoices]);
    const quoteByMonth = useMemo(() => countByMonth(quotations, "date"), [quotations]);
    const wonByMonth = useMemo(() => countByMonth(quotations.filter((q) => q.status === "Won"), "date"), [quotations]);

    function exportCsv() {
      const rows = [
        ["Metric", "Value"],
        ["Enquiries", enquiries.length],
        ["Quotations", quotations.length],
        ["Sales orders", orders.length],
        ["Invoices", invoices.length],
        ["Won", winLoss.won],
        ["Lost", winLoss.lost],
        ["Win rate %", winLoss.winRate],
        ["Export invoices", exportInvoices.length],
      ];
      territory.forEach((t) => rows.push(["Territory: " + t.state, inr(t.value)]));
      const csv = rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "sales-analytics-" + new Date().toISOString().slice(0, 10) + ".csv";
      a.click();
      VG.toast("Analytics exported");
    }

    return (
      <div>
        <PageHead title="Sales Analytics" desc="Funnel, win/loss, territory and export trends — last 6 months" />
        <div className="flex justify-end mb-4">
          {can("export") && <Button variant="soft" icon="download" onClick={exportCsv}>Export CSV</Button>}
        </div>

        <div className="grid lg:grid-cols-2 gap-4 mb-6">
          <Card className="p-4">
            <div className="text-sm font-semibold mb-4">Sales funnel</div>
            <div className="space-y-3">
              {funnel.map((s) => <FunnelStep key={s.label} {...s} />)}
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm font-semibold mb-4">Win / loss analysis</div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="glass rounded-xl p-3 text-center">
                <div className="text-2xl font-bold text-emerald-400 tabular-nums">{winLoss.won}</div>
                <div className="text-xs opacity-60 mt-1">Won</div>
              </div>
              <div className="glass rounded-xl p-3 text-center">
                <div className="text-2xl font-bold text-rose-400 tabular-nums">{winLoss.lost}</div>
                <div className="text-xs opacity-60 mt-1">Lost</div>
              </div>
              <div className="glass rounded-xl p-3 text-center">
                <div className="text-2xl font-bold tabular-nums">{winLoss.winRate}%</div>
                <div className="text-xs opacity-60 mt-1">Win rate</div>
              </div>
            </div>
            <div className="flex h-3 rounded-full overflow-hidden">
              <div style={{ width: (winLoss.won / winLoss.total * 100) + "%", background: "#22c55e" }} />
              <div style={{ width: (winLoss.lost / winLoss.total * 100) + "%", background: "#ef4444" }} />
              <div style={{ flex: 1, background: "#94a3b8", opacity: 0.35 }} />
            </div>
            <div className="text-[10px] opacity-45 mt-2">{winLoss.open} quotations still open</div>
          </Card>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <BarChart title="Quotations / month" labels={monthLabels} data={quoteByMonth} color="#a78bfa" />
          <BarChart title="Won quotes / month" labels={monthLabels} data={wonByMonth} color="#22c55e" />
          <BarChart title="Export sales (INR) / month" labels={monthLabels} data={exportByMonth} color="#06b6d4" format={(v) => inr(v)} />
        </div>

        <Card className="p-4">
          <div className="text-sm font-semibold mb-3">Territory — invoice value by state</div>
          {territory.length === 0 ? (
            <div className="text-sm opacity-50 py-6 text-center">No invoiced sales yet</div>
          ) : (
            <div className="space-y-2">
              {territory.map((t) => {
                const max = territory[0].value || 1;
                return (
                  <div key={t.state} className="flex items-center gap-3 text-sm">
                    <span className="w-32 truncate opacity-80">{t.state}</span>
                    <div className="flex-1 h-2 rounded-full glass overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: Math.max(4, (t.value / max) * 100) + "%", background: "var(--accent)" }} />
                    </div>
                    <span className="text-xs tabular-nums opacity-70 w-24 text-right">{inr(t.value)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    );
  }

  VG.SalesAnalyticsPage = SalesAnalyticsPage;
})(window.VG);
