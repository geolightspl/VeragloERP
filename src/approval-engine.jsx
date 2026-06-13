/* Veraglo ERP — multi-level approval engine (Phase 2). */
(function (VG) {
  const store = VG.store;

  function workflowFor(process) {
    return store.list("approvalWorkflows").find((w) => w.process === process && w.active !== false) || null;
  }

  function canApprove(roleKey, wf) {
    if (!wf) return roleKey === "admin" || roleKey === "super";
    const roles = wf.roleApprovers || ["admin"];
    return roles.includes(roleKey) || roleKey === "admin" || roleKey === "super";
  }

  function findOpenRequest(entityType, entityId) {
    return store.list("approvalRequests").find(
      (r) => r.entityType === entityType && r.entityId === entityId && r.status === "Pending"
    );
  }

  function pushApprovalNotification(req, title, tone) {
    if (!store.pushNotification) return;
    store.pushNotification({
      module: "sales",
      section: "approvals",
      title: title || ("Approval: " + (req.entityNo || req.process)),
      body: req.process + " · Level " + (req.currentLevel || 1) + " of " + (req.levels || 1),
      tone: tone || "#f59e0b",
      refType: "approvalRequests",
      refId: req.id,
      roles: req.approvers || ["admin"],
    });
  }

  function submitRequest(opts) {
    const wf = workflowFor(opts.process);
    const levels = Math.max(1, Number(wf && wf.levels) || 1);
    const amount = Number(opts.amount) || 0;
    if (wf && wf.autoApproveBelow > 0 && amount > 0 && amount < Number(wf.autoApproveBelow)) {
      return { autoApproved: true, reason: "below_threshold" };
    }
    const existing = findOpenRequest(opts.entityType, opts.entityId);
    if (existing) return existing;
    const approvers = (wf && wf.roleApprovers && wf.roleApprovers.length) ? wf.roleApprovers.slice() : ["admin"];
    const req = store.create("approvalRequests", {
      process: opts.process,
      entityType: opts.entityType,
      entityId: opts.entityId,
      entityNo: opts.entityNo || "",
      amount,
      status: "Pending",
      currentLevel: 1,
      levels,
      submittedBy: opts.actor || "system",
      submittedAt: Date.now(),
      approvers,
      reason: opts.reason || "",
      trail: [{ level: 1, action: "submitted", by: opts.actor || "system", at: Date.now(), remarks: opts.reason || "" }],
    }, opts.actor || "system");
    pushApprovalNotification(req, "Approval required: " + (opts.entityNo || opts.process));
    if (store.maybeSendApprovalEmail) store.maybeSendApprovalEmail(req);
    return req;
  }

  function advanceOrComplete(req, actor, remarks, action) {
    const wf = workflowFor(req.process);
    const trail = (req.trail || []).concat({
      level: req.currentLevel,
      action,
      by: actor,
      at: Date.now(),
      remarks: remarks || "",
    });
    if (action === "rejected") {
      store.update("approvalRequests", req.id, { status: "Rejected", trail, resolvedAt: Date.now(), resolvedBy: actor }, actor);
      return { done: true, approved: false };
    }
    if (req.currentLevel >= req.levels) {
      store.update("approvalRequests", req.id, { status: "Approved", trail, resolvedAt: Date.now(), resolvedBy: actor }, actor);
      return { done: true, approved: true };
    }
    const nextLevel = req.currentLevel + 1;
    store.update("approvalRequests", req.id, { currentLevel: nextLevel, trail, escalatedAt: Date.now() }, actor);
    const updated = store.get("approvalRequests", req.id);
    pushApprovalNotification(updated, "Level " + nextLevel + " approval: " + (req.entityNo || req.process));
    return { done: false, approved: false, level: nextLevel };
  }

  function approveRequest(requestId, actor, remarks) {
    const req = store.get("approvalRequests", requestId);
    if (!req || req.status !== "Pending") return { ok: false, reason: "not_pending" };
    const wf = workflowFor(req.process);
    if (!canApprove(actor, wf)) return { ok: false, reason: "no_rights" };
    if (wf && wf.remarksMandatory && !String(remarks || "").trim()) return { ok: false, reason: "remarks_required" };
    const result = advanceOrComplete(req, actor, remarks, "approved");
    if (result.done && result.approved) applyDocumentApproval(req, actor);
    return { ok: true, ...result };
  }

  function rejectRequest(requestId, actor, remarks) {
    const req = store.get("approvalRequests", requestId);
    if (!req || req.status !== "Pending") return { ok: false, reason: "not_pending" };
    const wf = workflowFor(req.process);
    if (!canApprove(actor, wf)) return { ok: false, reason: "no_rights" };
    advanceOrComplete(req, actor, remarks || "Rejected", "rejected");
    applyDocumentRejection(req, actor, remarks);
    return { ok: true, approved: false };
  }

  function applyDocumentApproval(req, actor) {
    if (req.entityType === "quotations") {
      store.update("quotations", req.entityId, {
        status: "Approved",
        approvedBy: actor,
        discountApproved: true,
        approvalRequestId: req.id,
      }, actor);
    } else if (req.entityType === "salesOrders" && req.process === "Sales order") {
      store.approveSalesOrderRevision(req.entityId, actor);
    }
  }

  function applyDocumentRejection(req, actor, remarks) {
    if (req.entityType === "quotations") {
      store.update("quotations", req.entityId, {
        status: "Draft",
        rejectionRemarks: remarks || "",
        approvalRequestId: req.id,
      }, actor);
    } else if (req.entityType === "salesOrders") {
      store.rejectSalesOrderRevision(req.entityId, actor, remarks);
    }
  }

  function onQuotationSubmitted(q, actor, grandTotal, reason) {
    if (!q || !q.id) return null;
    const wf = workflowFor("Quotation discount");
    const threshold = wf ? Number(wf.amountThreshold) || 0 : 0;
    const amount = Number(grandTotal) || 0;
    const needs = q.needsDiscountApproval || q.status === "Pending Approval" || (threshold > 0 && amount >= threshold);
    if (!needs) return null;
    return submitRequest({
      process: "Quotation discount",
      entityType: "quotations",
      entityId: q.id,
      entityNo: q.no,
      amount,
      actor,
      reason: reason || "Discount / value threshold approval",
    });
  }

  function approveQuotation(quotationId, actor, remarks) {
    const req = findOpenRequest("quotations", quotationId);
    if (req) return approveRequest(req.id, actor, remarks);
    store.update("quotations", quotationId, { status: "Approved", approvedBy: actor, discountApproved: true }, actor);
    return { ok: true, done: true, approved: true };
  }

  function rejectQuotation(quotationId, actor, remarks) {
    const req = findOpenRequest("quotations", quotationId);
    if (req) return rejectRequest(req.id, actor, remarks);
    store.update("quotations", quotationId, { status: "Draft", rejectionRemarks: remarks || "" }, actor);
    return { ok: true, approved: false };
  }

  function listPending(filter) {
    let rows = store.list("approvalRequests").filter((r) => r.status === "Pending");
    if (filter === "quotations") rows = rows.filter((r) => r.entityType === "quotations");
    if (filter === "revisions") rows = rows.filter((r) => r.entityType === "salesOrders");
    return rows.slice().sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0));
  }

  function pendingCount() {
    return listPending().length;
  }

  function runEscalations() {
    const now = Date.now();
    let escalated = 0;
    store.list("approvalWorkflows").forEach((wf) => {
      if (!wf.active || !wf.escalationHours) return;
      const ms = Number(wf.escalationHours) * 3600000;
      store.list("approvalRequests").forEach((req) => {
        if (req.status !== "Pending" || req.process !== wf.process) return;
        const age = now - (req.submittedAt || req.createdAt || now);
        if (age < ms || req.escalatedAt) return;
        store.update("approvalRequests", req.id, { escalatedAt: now, status: "Escalated" }, "system");
        if (store.pushNotification) {
          store.pushNotification({
            module: "sales",
            section: "approvals",
            title: "Escalated: " + (req.entityNo || req.process),
            body: "Pending over " + wf.escalationHours + "h — needs attention",
            tone: "#ef4444",
            refType: "approvalRequests",
            refId: req.id,
            roles: ["admin", "super"],
          });
        }
        escalated++;
      });
    });
    return escalated;
  }

  function backfillQuotationRequests() {
    store.list("quotations").forEach((q) => {
      if (q.status !== "Pending Approval") return;
      if (findOpenRequest("quotations", q.id)) return;
      const t = q.totals || {};
      onQuotationSubmitted(q, q.preparedBy || "system", t.grand || 0, "Backfilled approval request");
    });
  }

  VG.approvalEngine = {
    workflowFor,
    canApprove,
    submitRequest,
    approveRequest,
    rejectRequest,
    onQuotationSubmitted,
    approveQuotation,
    rejectQuotation,
    listPending,
    pendingCount,
    runEscalations,
    backfillQuotationRequests,
    findOpenRequest,
  };
})(window.VG);
