/* Veraglo ERP — Sales AI intelligence (order planning, delivery & customer risk). */
(function (VG) {
  const { useMemo } = React;
  const { Icon, Card, Pill, Button } = VG.ui;
  const store = VG.store;
  const inr = VG.fmt.inr;
  const today = VG.fmt.todayISO;
  const { PageHead } = VG.fx;

  const RISK = { low: "#34d399", medium: "#f59e0b", high: "#ef4444" };

  function daysBetween(a, b) {
    return Math.round((new Date(b) - new Date(a)) / 86400000);
  }

  function stockForItem(itemId) {
    const sum = store.stockSummary().find((s) => s.id === itemId);
    return sum ? Number(sum.qty) || 0 : 0;
  }

  function analyzeOrder(so) {
    const stage = so.stage || so.status || "";
    const lines = so.lines || [];
    let shortage = 0;
    let covered = 0;
    lines.forEach((l) => {
      if (!l.itemId) return;
      const need = Number(l.qty) || 0;
      const have = stockForItem(l.itemId);
      if (have < need) shortage++;
      else covered++;
    });
    const delivery = so.deliveryDate || "";
    const daysLeft = delivery ? daysBetween(today(), delivery) : null;
    const delayed = delivery && delivery < today() && !["Closed", "Fully Dispatched", "Cancelled"].includes(stage);
    const inProd = ["Production In Progress", "Material Required", "Material Partially Issued", "Accepted by Production", "Sent to Production"].includes(stage);

    let risk = "low";
    let riskScore = 15;
    const factors = [];
    if (delayed) { risk = "high"; riskScore += 45; factors.push("Past delivery date"); }
    else if (daysLeft != null && daysLeft <= 7 && !["Ready for Dispatch", "Fully Dispatched"].includes(stage)) {
      risk = "high"; riskScore += 35; factors.push("Delivery within 7 days — not dispatch-ready");
    } else if (daysLeft != null && daysLeft <= 14 && inProd) {
      risk = "medium"; riskScore += 22; factors.push("Tight timeline while in production");
    }
    if (shortage > 0) {
      risk = risk === "low" ? "medium" : risk;
      riskScore += shortage * 12;
      factors.push(shortage + " line(s) with material shortage");
    }
    if (so.priority === "Urgent" || so.priority === "High") {
      riskScore += 10;
      factors.push("High priority order");
    }
    riskScore = Math.min(100, riskScore);

    const suggestions = [];
    if (shortage) suggestions.push("Raise purchase request or transfer stock for " + shortage + " short item(s)");
    if (delayed) suggestions.push("Contact customer on revised EDD; escalate production");
    else if (daysLeft != null && daysLeft <= 10 && inProd) suggestions.push("Confirm production plan and material issue status daily");
    if (!suggestions.length) suggestions.push("On track — maintain standard production cadence");

    const estDispatch = delivery || (daysLeft != null ? so.deliveryDate : "—");
    return {
      so,
      risk,
      riskScore,
      factors,
      suggestions,
      shortage,
      covered,
      daysLeft,
      delayed,
      estDispatch,
      stage,
    };
  }

  function customerRisk(customerId) {
    const invs = store.list("invoices").filter((i) => i.customerId === customerId);
    const overdue = invs.filter((i) => i.status !== "Paid" && i.dueDate && i.dueDate < today());
    const outstanding = invs.reduce((s, i) => s + Math.max(0, (Number(i.amount) || 0) - (Number(i.amountPaid) || 0)), 0);
    const orders = store.list("salesOrders").filter((o) => o.customerId === customerId);
    const delayedOrders = orders.filter((o) => o.deliveryDate && o.deliveryDate < today() && !["Closed", "Cancelled", "Fully Dispatched"].includes(o.stage || o.status));
    let score = 20;
    if (overdue.length) score += 25 + overdue.length * 8;
    if (outstanding > 500000) score += 15;
    else if (outstanding > 100000) score += 8;
    if (delayedOrders.length) score += delayedOrders.length * 10;
    const lost = store.list("quotations").filter((q) => q.customerId === customerId && q.status === "Lost").length;
    const won = store.list("quotations").filter((q) => q.customerId === customerId && q.status === "Won").length;
    if (won + lost > 2 && lost > won) score += 12;
    score = Math.min(100, score);
    const level = score >= 60 ? "high" : score >= 35 ? "medium" : "low";
    return { score, level, overdue: overdue.length, outstanding, delayedOrders: delayedOrders.length };
  }

  function planOrderPriority(analyses) {
    return analyses.slice().sort((a, b) => b.riskScore - a.riskScore);
  }

  VG.salesIntelligence = {
    analyzeOrder,
    customerRisk,
    planOrderPriority,
  };

  function RiskMeter({ score, color }) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 rounded-full glass overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: score + "%", background: color }} />
        </div>
        <span className="text-xs font-mono tabular-nums w-8">{score}</span>
      </div>
    );
  }

  function SalesIntelligencePage({ roleKey, can, go }) {
    VG.useDB();
    const openOrders = useMemo(() => store.list("salesOrders").filter((o) => !["Closed", "Cancelled"].includes(o.stage || o.status || "")), []);
    const analyses = useMemo(() => planOrderPriority(openOrders.map(analyzeOrder)), [openOrders.length]);
    const highRisk = analyses.filter((a) => a.risk === "high");
    const customers = useMemo(() => {
      const ids = {};
      openOrders.forEach((o) => { if (o.customerId) ids[o.customerId] = true; });
      return Object.keys(ids).map((id) => {
        const c = store.get("customers", id) || {};
        const r = customerRisk(id);
        return { id, name: c.name || id, ...r };
      }).sort((a, b) => b.score - a.score).slice(0, 12);
    }, [openOrders.length]);

    return (
      <div>
        <PageHead title="Sales Intelligence" desc="AI-assisted order planning, delivery risk and customer risk scores (rule-based engine)" />
        <div className="grid sm:grid-cols-3 gap-3 mb-6">
          <Card className="p-4">
            <div className="text-2xl font-bold text-rose-400 tabular-nums">{highRisk.length}</div>
            <div className="text-xs opacity-60 mt-1">High delivery risk orders</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold tabular-nums">{analyses.filter((a) => a.shortage > 0).length}</div>
            <div className="text-xs opacity-60 mt-1">Orders with material gaps</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-amber-400 tabular-nums">{customers.filter((c) => c.level === "high").length}</div>
            <div className="text-xs opacity-60 mt-1">High-risk customers</div>
          </Card>
        </div>

        <Card className="p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm font-semibold">Order planning queue</div>
              <div className="text-xs opacity-50">Sorted by delivery risk — act on top items first</div>
            </div>
            {go && <Button variant="soft" onClick={() => go("orders")}>All orders</Button>}
          </div>
          {analyses.length === 0 ? (
            <div className="text-sm opacity-50 py-8 text-center">No open sales orders</div>
          ) : (
            <div className="space-y-3">
              {analyses.slice(0, 15).map((a) => (
                <div key={a.so.id} className="glass rounded-xl p-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="flex-1 min-w-[200px]">
                      <div className="font-mono text-sm">{a.so.no}</div>
                      <div className="text-xs opacity-60 mt-1">{((store.get("customers", a.so.customerId) || {}).name) || "—"} · {a.stage}</div>
                      <div className="text-xs opacity-50 mt-1">Delivery: {a.so.deliveryDate || "—"}{a.daysLeft != null ? " · " + a.daysLeft + "d left" : ""}</div>
                    </div>
                    <Pill color={RISK[a.risk]}>{a.risk} risk</Pill>
                  </div>
                  <div className="mt-2"><RiskMeter score={a.riskScore} color={RISK[a.risk]} /></div>
                  {a.factors.length > 0 && (
                    <ul className="mt-2 text-xs opacity-70 list-disc pl-4 space-y-0.5">
                      {a.factors.map((f, i) => <li key={i}>{f}</li>)}
                    </ul>
                  )}
                  <div className="mt-2 text-xs rounded-lg p-2" style={{ background: "rgba(99,102,241,0.12)" }}>
                    <Icon name="sparkle" size={12} className="inline mr-1 opacity-70" />
                    {a.suggestions[0]}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="text-sm font-semibold mb-3">Customer risk radar</div>
          <div className="space-y-2">
            {customers.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 text-sm glass rounded-lg p-2">
                <span className="flex-1 min-w-[140px] truncate">{c.name}</span>
                <Pill color={RISK[c.level]}>{c.level}</Pill>
                <span className="text-xs opacity-50">{inr(c.outstanding)} due</span>
                <div className="w-24"><RiskMeter score={c.score} color={RISK[c.level]} /></div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  VG.SalesIntelligencePage = SalesIntelligencePage;
})(window.VG);
