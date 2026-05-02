"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { billingAwareErrorMessage } from "@/lib/billing-blocked-client";
import { useBillingGateProps } from "@/lib/useBillingHealth";
import { ProjectPicker } from "@/app/components/ProjectPicker";

type Item = {
  id: string;
  name: string;
  brand: string;
  model: string;
  vendor: string;
  meta: string;
  qty: string;
  condition: string;
  value: number;
  projectId: string | null;
  projectCode: string | null;
};

type Sub = {
  id: string;
  code: string;
  name: string;
  pinned: boolean;
  items: Item[];
};

type Dept = {
  id: string;
  code: string;
  name: string;
  icon: string;
  pinned: boolean;
  subcategories: Sub[];
};

type DeptManager = {
  id: string;
  code: string;
  name: string;
  pinned: boolean;
  hidden: boolean;
  subcategories: { id: string; code: string; name: string; pinned: boolean; hidden: boolean }[];
};

type Template = {
  id: string;
  name: string;
  scope: string | null;
  isDefault: boolean;
  isLocked: boolean;
  data: { fields?: { name: string; type: string; required?: boolean; options?: string[] }[] };
};

type Kpi = {
  totalItems: number;
  totalValue: number;
  allocated: number;
  lowStock: number;
  activeDepts: number;
};

const fmtMoney = (n: number) =>
  "$" + Math.round(n).toLocaleString("en-US");

export default function WarehouseClient(props: {
  departments: Dept[];
  allDeptsForManager: DeptManager[];
  templates: Template[];
  kpi: Kpi;
  canEdit: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());

  const [openDept, setOpenDept] = useState<string>(props.departments[0]?.code ?? "");
  const [activeSub, setActiveSub] = useState<string>(
    props.departments[0]?.subcategories[0]?.code ?? ""
  );

  const [modal, setModal] = useState<
    | null
    | { kind: "view-item"; item: Item }
    | { kind: "allocate"; item: Item }
    | { kind: "add-item" }
    | { kind: "templates" }
    | { kind: "category-manager" }
  >(null);

  const currentDept = props.departments.find((d) => d.code === openDept) ?? props.departments[0];
  const currentSub =
    currentDept?.subcategories.find((s) => s.code === activeSub) ??
    currentDept?.subcategories[0];

  const gate = useBillingGateProps();

  return (
    <div className="module active">
      <div className="proj-bar">
        <div className="proj-l">
          <span className="proj-addr">Warehouse — Company-wide inventory</span>
          <span className="proj-chip">CHG Software</span>
        </div>
        <div className="proj-r">
          <span className="proj-ts">All items can be allocated to any active project</span>
          <a className="btn-sm" href="/admin?panel=warehouse-settings">⚙ Warehouse settings</a>
        </div>
      </div>

      <div className="wh-kpi-strip">
        <div className="wh-kc">
          <div className="kpi-label">Total items</div>
          <div className="kpi-val">{props.kpi.totalItems}</div>
          <div className="kpi-sub">Across all depts</div>
        </div>
        <div className="wh-kc">
          <div className="kpi-label">Total value</div>
          <div className="kpi-val">{fmtMoney(props.kpi.totalValue)}</div>
          <div className="kpi-sub">On hand</div>
        </div>
        <div className="wh-kc">
          <div className="kpi-label">Allocated</div>
          <div className="kpi-val" style={{ color: "var(--blue)" }}>
            {props.kpi.allocated}
          </div>
          <div className="kpi-sub">To active projects</div>
        </div>
        <div className="wh-kc">
          <div className="kpi-label">Low stock</div>
          <div className="kpi-val amber">{props.kpi.lowStock}</div>
          <div className="kpi-sub">Below threshold</div>
        </div>
        <div className="wh-kc">
          <div className="kpi-label">Active depts</div>
          <div className="kpi-val">{props.kpi.activeDepts}</div>
          <div className="kpi-sub">In use</div>
        </div>
      </div>

      <div className="wh-layout">
        <div className="wh-left">
          <div className="wh-nav-scroll">
            {props.departments.length === 0 && (
              <div style={{ padding: "16px 10px", fontSize: 10, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
                No departments yet.
                {props.canManage && (
                  <span
                    style={{ color: "var(--blue)", cursor: "pointer", display: "block", marginTop: 6 }}
                    onClick={() => setModal({ kind: "category-manager" })}
                  >
                    ⚙ Set up categories →
                  </span>
                )}
              </div>
            )}
            {props.departments.map((d) => {
              const isOpen = openDept === d.code;
              return (
                <div key={d.id}>
                  <div
                    className={`wh-dept-hd${isOpen ? " active" : ""}`}
                    onClick={() => {
                      setOpenDept(d.code);
                      setActiveSub(d.subcategories[0]?.code ?? "");
                    }}
                  >
                    <span>
                      {d.pinned ? "📌 " : ""}
                      {d.name}
                    </span>
                    <span>{isOpen ? "▾" : "▸"}</span>
                  </div>
                  {isOpen && (
                    <div>
                      {d.subcategories.map((s) => (
                        <div
                          key={s.id}
                          className={`wh-sub-item${activeSub === s.code ? " active" : ""}`}
                          onClick={() => setActiveSub(s.code)}
                        >
                          <span>
                            {s.pinned ? "📌 " : ""}
                            {s.name}
                          </span>
                          <span className="wh-sub-ct">{s.items.length}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="wh-footer">
            <div className="tpl-link" onClick={() => setModal({ kind: "templates" })}>
              📐 Template library
            </div>
            {props.canManage && (
              <div
                className="tpl-link"
                onClick={() => setModal({ kind: "category-manager" })}
              >
                ⚙ Category manager
              </div>
            )}
          </div>
        </div>

        <div className="wh-main">
          {props.departments.length === 0 ? (
            <div style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 12,
              color: "var(--text-tertiary)", padding: 40,
            }}>
              <div style={{ fontSize: 32 }}>📦</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>
                No inventory categories set up yet
              </div>
              <div style={{ fontSize: 12, textAlign: "center", maxWidth: 320 }}>
                Create departments and subcategories first, then add items to track your company-wide inventory.
              </div>
              {props.canManage && (
                <button
                  className="btn-sm"
                  style={{ marginTop: 8 }}
                  onClick={() => setModal({ kind: "category-manager" })}
                >
                  ⚙ Set up categories
                </button>
              )}
            </div>
          ) : (
          <>
          <div className="action-bar" style={{ justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500 }}>
                {currentSub?.name ?? "—"}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                {currentDept?.name} department · {currentSub?.items.length ?? 0} items
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn-sm" onClick={() => setModal({ kind: "templates" })}>
                📐 Template library
              </button>
              {props.canEdit && (
                <button
                  className="btn-sm btn-green"
                  onClick={() => setModal({ kind: "add-item" })}
                  disabled={gate.disabled}
                  title={gate.title}
                  style={gate.style}
                  aria-disabled={gate.disabled || undefined}
                >
                  + Add item
                </button>
              )}
            </div>
          </div>

          <div className="wh-tbl-hd">
            <span className="col-label">Item & specs</span>
            <span className="col-label">Qty</span>
            <span className="col-label">Condition</span>
            <span className="col-label">Project</span>
            <span className="col-label" style={{ textAlign: "right" }}>
              Value
            </span>
            <span className="col-label">Action</span>
          </div>

          <div style={{ overflowY: "auto", flex: 1 }}>
            {(currentSub?.items ?? []).map((it) => {
              const allocated = !!it.projectCode;
              return (
                <div
                  key={it.id}
                  className={`wh-tbl-row${allocated ? " alloc-highlight" : ""}`}
                  onClick={() => setModal({ kind: "view-item", item: it })}
                >
                  <div>
                    <div className="cell-name">{it.name}</div>
                    <div className="cell-meta">{it.meta}</div>
                  </div>
                  <div style={{ fontSize: 11 }}>{it.qty}</div>
                  <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                    {it.condition}
                  </div>
                  {allocated ? (
                    <span className="proj-chip-alloc">{it.projectCode}</span>
                  ) : (
                    <span className="proj-chip-stock">General stock</span>
                  )}
                  <div style={{ fontSize: 11, fontWeight: 500, textAlign: "right" }}>
                    {fmtMoney(it.value)}
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      className="view-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setModal({ kind: "view-item", item: it });
                      }}
                    >
                      View
                    </button>
                    {props.canEdit && (
                      <button
                        className="view-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setModal({ kind: "allocate", item: it });
                        }}
                      >
                        Allocate
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {props.canEdit && currentSub && (
              <div
                className="add-bar-row"
                onClick={() => {
                  if (gate.disabled) return;
                  setModal({ kind: "add-item" });
                }}
                title={gate.title}
                aria-disabled={gate.disabled || undefined}
                style={gate.disabled ? gate.style : undefined}
              >
                + Add item to {currentSub.name}
              </div>
            )}
          </div>
          </>
          )}
        </div>
      </div>

      {modal?.kind === "view-item" && (
        <ItemDetailModal
          item={modal.item}
          onClose={() => setModal(null)}
          onAllocate={() => setModal({ kind: "allocate", item: modal.item })}
        />
      )}

      {modal?.kind === "allocate" && (
        <AllocateModal
          item={modal.item}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            refresh();
          }}
        />
      )}

      {modal?.kind === "add-item" && currentSub && (
        <AddItemModal
          subcategoryId={currentSub.id}
          subcategoryName={currentSub.name}
          templates={props.templates}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            refresh();
          }}
        />
      )}

      {modal?.kind === "templates" && (
        <TemplateLibraryModal
          templates={props.templates}
          canManage={props.canManage}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            refresh();
          }}
        />
      )}

      {modal?.kind === "category-manager" && (
        <CategoryManagerModal
          depts={props.allDeptsForManager}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ItemDetailModal(props: {
  item: Item;
  onClose: () => void;
  onAllocate: () => void;
}) {
  const it = props.item;
  return (
    <div className="modal-overlay open" onClick={props.onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <div>
            <div className="modal-title">{it.name}</div>
            <div className="modal-sub">{it.meta}</div>
          </div>
          <button className="modal-close" onClick={props.onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          {(it.brand || it.model || it.vendor) && (
            <div className="form-row" style={{ marginBottom: 4 }}>
              {it.brand && (
                <div className="form-group">
                  <div className="form-label">Brand</div>
                  <div style={{ fontSize: 13 }}>{it.brand}</div>
                </div>
              )}
              {it.model && (
                <div className="form-group">
                  <div className="form-label">Model</div>
                  <div style={{ fontSize: 13 }}>{it.model}</div>
                </div>
              )}
              {it.vendor && (
                <div className="form-group">
                  <div className="form-label">Vendor</div>
                  <div style={{ fontSize: 13 }}>{it.vendor}</div>
                </div>
              )}
            </div>
          )}
          {it.meta && (
            <div className="form-group">
              <div className="form-label">Specs / notes</div>
              <div style={{ fontSize: 13 }}>{it.meta}</div>
            </div>
          )}
          <div className="form-group">
            <div className="form-label">Quantity on hand</div>
            <div style={{ fontSize: 13 }}>{it.qty || "—"}</div>
          </div>
          <div className="form-group">
            <div className="form-label">Condition</div>
            <div style={{ fontSize: 13 }}>{it.condition || "—"}</div>
          </div>
          <div className="form-group">
            <div className="form-label">Value</div>
            <div style={{ fontSize: 13 }}>{fmtMoney(it.value)}</div>
          </div>
          <div className="form-group">
            <div className="form-label">Allocation</div>
            <div style={{ fontSize: 13 }}>
              {it.projectCode ? (
                <span className="proj-chip-alloc">{it.projectCode}</span>
              ) : (
                <span className="proj-chip-stock">General stock</span>
              )}
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn-sm" onClick={props.onClose}>
            Close
          </button>
          <button className="btn-sm btn-primary" onClick={props.onAllocate}>
            Allocate
          </button>
        </div>
      </div>
    </div>
  );
}

function AllocateModal(props: {
  item: Item;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [projectId, setProjectId] = useState<string>(props.item.projectId ?? "");
  const [quantity, setQuantity] = useState<string>(props.item.qty || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/warehouse/items/${props.item.id}/allocate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: projectId || null,
          quantity: quantity || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(billingAwareErrorMessage(res.status, j, "Save failed"));
      }
      props.onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-overlay open" onClick={props.onClose}>
      <div className="modal-box sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <div>
            <div className="modal-title">Allocate item</div>
            <div className="modal-sub">{props.item.name}</div>
          </div>
          <button className="modal-close" onClick={props.onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Quantity</label>
            <input
              className="form-input"
              type="text"
              value={quantity}
              placeholder={props.item.qty || "e.g. 12 units"}
              onChange={(e) => setQuantity(e.target.value)}
            />
            <div className="form-note">
              Available in stock: {props.item.qty || "—"}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Project</label>
            <ProjectPicker
              value={projectId}
              onChange={(id) => setProjectId(id)}
              disabled={busy}
              allowNone
              noneLabel="General stock (no project)"
            />
            <div className="form-note" style={{ marginTop: 6 }}>
              Allocating consumes inventory from company-wide stock and assigns it to
              the selected project.
            </div>
          </div>
          {err && <div className="login-error">{err}</div>}
        </div>
        <div className="modal-foot">
          <button className="btn-sm" onClick={props.onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn-sm btn-primary" onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Save allocation"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddItemModal(props: {
  subcategoryId: string;
  subcategoryName: string;
  templates: Template[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const defaultTpl = props.templates.find((t) => t.isDefault) ?? props.templates[0];
  const [templateId, setTemplateId] = useState<string>(defaultTpl?.id ?? "");
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [vendor, setVendor] = useState("");
  const [meta, setMeta] = useState("");
  const [qty, setQty] = useState("");
  const [condition, setCondition] = useState("New");
  const [value, setValue] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [templateValues, setTemplateValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const activeTpl = props.templates.find((t) => t.id === templateId);
  const tplFields = activeTpl?.data?.fields ?? [];

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/warehouse/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subcategoryId: props.subcategoryId,
          templateId: templateId || null,
          templateValues: templateId ? templateValues : undefined,
          name,
          brand: brand || null,
          model: model || null,
          vendor: vendor || null,
          notes: meta,
          unit: qty,
          condition,
          value: value ? Number(value) : 0,
          projectId: projectId || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(billingAwareErrorMessage(res.status, j, "Save failed"));
      }
      props.onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay open" onClick={props.onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <div>
            <div className="modal-title">Add item to {props.subcategoryName}</div>
            <div className="modal-sub">Pick a template, then fill the fields below</div>
          </div>
          <button className="modal-close" onClick={props.onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Template</label>
            <select
              className="form-select"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              <option value="">— No template —</option>
              {props.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.isDefault ? "(default)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">
              Name<span className="form-req">*</span>
            </label>
            <input
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Brand</label>
              <input
                className="form-input"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="e.g. DeWalt"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Model</label>
              <input
                className="form-input"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. DCD771C2"
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Vendor / Supplier</label>
            <input
              className="form-input"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="e.g. Home Depot"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Notes / specs</label>
            <input
              className="form-input"
              value={meta}
              onChange={(e) => setMeta(e.target.value)}
              placeholder="e.g. Tier 1 — Bulk"
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Quantity</label>
              <input
                className="form-input"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="e.g. 24 pcs"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Condition</label>
              <select
                className="form-select"
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
              >
                <option>New</option>
                <option>Good</option>
                <option>Fair</option>
                <option>Damaged</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Value (USD)</label>
              <input
                className="form-input"
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Allocate to (optional)</label>
              <ProjectPicker
                value={projectId}
                onChange={(id) => setProjectId(id)}
                allowNone
                noneLabel="General stock"
              />
            </div>
          </div>
          {tplFields.length > 0 && (
            <div className="form-group">
              <label className="form-label" style={{ marginBottom: 6 }}>
                Template fields
              </label>
              {tplFields.map((f) => (
                <div className="form-group" key={f.name} style={{ marginBottom: 8 }}>
                  <label className="form-label" style={{ fontSize: 10 }}>
                    {f.name}
                    {f.required && <span className="form-req">*</span>}
                  </label>
                  {f.type === "select" && f.options?.length ? (
                    <select
                      className="form-select"
                      value={templateValues[f.name] ?? ""}
                      onChange={(e) =>
                        setTemplateValues({ ...templateValues, [f.name]: e.target.value })
                      }
                    >
                      <option value="">— Select —</option>
                      {f.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : f.type === "number" ? (
                    <input
                      className="form-input"
                      type="number"
                      value={templateValues[f.name] ?? ""}
                      onChange={(e) =>
                        setTemplateValues({ ...templateValues, [f.name]: e.target.value })
                      }
                    />
                  ) : (
                    <input
                      className="form-input"
                      value={templateValues[f.name] ?? ""}
                      onChange={(e) =>
                        setTemplateValues({ ...templateValues, [f.name]: e.target.value })
                      }
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          {err && <div className="login-error">{err}</div>}
        </div>
        <div className="modal-foot">
          <button className="btn-sm" onClick={props.onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn-sm btn-green"
            onClick={submit}
            disabled={busy || !name.trim()}
          >
            {busy ? "Saving…" : "Save item"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TemplateLibraryModal(props: {
  templates: Template[];
  onClose: () => void;
  onSaved: () => void;
  canManage: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const setDefault = async (id: string) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/warehouse/templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isDefault: true }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setErr(billingAwareErrorMessage(res.status, body, "Failed to update template."));
        return;
      }
      props.onSaved();
    } finally {
      setBusy(false);
    }
  };

  const saveFields = async (
    id: string,
    fields: { name: string; type: string; required?: boolean; options?: string[] }[]
  ) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/warehouse/templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, data: { fields } }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setErr(billingAwareErrorMessage(res.status, body, "Failed to save template fields."));
        return;
      }
      props.onSaved();
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/warehouse/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          scope: scope || null,
          data: { fields: [] },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setErr(billingAwareErrorMessage(res.status, body, "Failed to create template."));
        return;
      }
      setAdding(false);
      setName("");
      setScope("");
      props.onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay open" onClick={props.onClose}>
      <div className="modal-box wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <div>
            <div className="modal-title">Template library</div>
            <div className="modal-sub">
              System templates are locked. Create company templates as needed.
            </div>
          </div>
          <button className="modal-close" onClick={props.onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          {err && <div className="login-error">{err}</div>}
          {props.templates.map((t) => (
            <div className="admin-row" key={t.id}>
              <div className="admin-info">
                <div className="admin-lbl">
                  {t.name}{" "}
                  {t.isLocked && <span className="perm-locked">🔒 Locked</span>}{" "}
                  {t.isDefault && (
                    <span className="s-ok" style={{ marginLeft: 4 }}>
                      Default
                    </span>
                  )}
                </div>
                <div className="admin-desc">
                  Scope: {t.scope || "—"} ·{" "}
                  {(t.data?.fields ?? []).length} field
                  {(t.data?.fields ?? []).length === 1 ? "" : "s"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {props.canManage && !t.isLocked && (
                  <button
                    className="btn-sm"
                    onClick={() =>
                      setEditingId((cur) => (cur === t.id ? null : t.id))
                    }
                  >
                    {editingId === t.id ? "Close" : "Edit fields"}
                  </button>
                )}
                {!t.isDefault && props.canManage && (
                  <button
                    className="btn-sm"
                    disabled={busy}
                    onClick={() => setDefault(t.id)}
                  >
                    Make default
                  </button>
                )}
              </div>
            </div>
          ))}
          {editingId &&
            (() => {
              const tpl = props.templates.find((x) => x.id === editingId);
              if (!tpl || tpl.isLocked) return null;
              return (
                <FieldBuilder
                  key={tpl.id}
                  initial={tpl.data?.fields ?? []}
                  busy={busy}
                  onSave={(fields) => saveFields(tpl.id, fields)}
                />
              );
            })()}
          {props.canManage && !adding && (
            <div className="add-bar-row" onClick={() => setAdding(true)}>
              + New company template
            </div>
          )}
          {adding && (
            <div style={{ marginTop: 12 }}>
              <div className="form-group">
                <label className="form-label">Template name</label>
                <input
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Scope (subcategory code, optional)</label>
                <input
                  className="form-input"
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  placeholder="e.g. kitchen-appl"
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                <button className="btn-sm" onClick={() => setAdding(false)}>
                  Cancel
                </button>
                <button className="btn-sm btn-green" onClick={create} disabled={busy}>
                  Create template
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn-sm" onClick={props.onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoryManagerModal(props: {
  depts: DeptManager[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toggleDept = async (id: string, field: "pinned" | "hidden", value: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/warehouse/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setErr(billingAwareErrorMessage(res.status, body, "Failed to update category."));
        return;
      }
      props.onSaved();
    } finally {
      setBusy(false);
    }
  };
  const toggleSub = async (id: string, field: "pinned" | "hidden", value: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/warehouse/subcategories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setErr(billingAwareErrorMessage(res.status, body, "Failed to update subcategory."));
        return;
      }
      props.onSaved();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-overlay open" onClick={props.onClose}>
      <div className="modal-box wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <div>
            <div className="modal-title">Category manager</div>
            <div className="modal-sub">Pin to top of sidebar, or hide from view.</div>
          </div>
          <button className="modal-close" onClick={props.onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          {err && <div className="login-error">{err}</div>}
          {props.depts.map((d) => (
            <div key={d.id} style={{ marginBottom: 14 }}>
              <div className="admin-row">
                <div className="admin-info">
                  <div className="admin-lbl">
                    {d.pinned ? "📌 " : ""}
                    {d.name}{" "}
                    {d.hidden && <span className="s-warn">Hidden</span>}
                  </div>
                  <div className="admin-desc">{d.subcategories.length} subcategories</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    className="btn-sm"
                    disabled={busy}
                    onClick={() => toggleDept(d.id, "pinned", !d.pinned)}
                  >
                    {d.pinned ? "Unpin" : "Pin"}
                  </button>
                  <button
                    className="btn-sm"
                    disabled={busy}
                    onClick={() => toggleDept(d.id, "hidden", !d.hidden)}
                  >
                    {d.hidden ? "Show" : "Hide"}
                  </button>
                </div>
              </div>
              <div style={{ paddingLeft: 20 }}>
                {d.subcategories.map((s) => (
                  <div className="admin-row" key={s.id}>
                    <div className="admin-info">
                      <div className="admin-lbl" style={{ fontSize: 11 }}>
                        {s.pinned ? "📌 " : ""}
                        {s.name}{" "}
                        {s.hidden && <span className="s-warn">Hidden</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        className="btn-sm"
                        disabled={busy}
                        onClick={() => toggleSub(s.id, "pinned", !s.pinned)}
                      >
                        {s.pinned ? "Unpin" : "Pin"}
                      </button>
                      <button
                        className="btn-sm"
                        disabled={busy}
                        onClick={() => toggleSub(s.id, "hidden", !s.hidden)}
                      >
                        {s.hidden ? "Show" : "Hide"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="modal-foot">
          <button className="btn-sm" onClick={props.onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

type TplField = { name: string; type: string; required?: boolean; options?: string[] };

function FieldBuilder({
  initial,
  busy,
  onSave,
}: {
  initial: TplField[];
  busy: boolean;
  onSave: (fields: TplField[]) => void;
}) {
  const [fields, setFields] = useState<TplField[]>(initial);

  const update = (idx: number, patch: Partial<TplField>) => {
    setFields((cur) => cur.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  };
  const remove = (idx: number) =>
    setFields((cur) => cur.filter((_, i) => i !== idx));
  const add = () =>
    setFields((cur) => [...cur, { name: "", type: "text", required: false }]);

  return (
    <div
      style={{
        marginTop: 10,
        padding: 10,
        border: "0.5px solid var(--border-lo)",
        borderRadius: 5,
        background: "var(--bg-secondary)",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 8 }}>
        Custom fields
      </div>
      {fields.length === 0 && (
        <div
          style={{
            fontSize: 11,
            color: "var(--text-tertiary)",
            marginBottom: 8,
          }}
        >
          No custom fields yet — items created from this template will use only
          the standard fields.
        </div>
      )}
      {fields.map((f, idx) => (
        <div
          key={idx}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 100px 80px 1fr 28px",
            gap: 6,
            marginBottom: 6,
          }}
        >
          <input
            className="form-input"
            placeholder="Field name"
            value={f.name}
            onChange={(e) => update(idx, { name: e.target.value })}
          />
          <select
            className="form-select"
            value={f.type}
            onChange={(e) => update(idx, { type: e.target.value })}
          >
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="select">Select</option>
          </select>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
            }}
          >
            <input
              type="checkbox"
              checked={!!f.required}
              onChange={(e) => update(idx, { required: e.target.checked })}
            />
            Required
          </label>
          {f.type === "select" ? (
            <input
              className="form-input"
              placeholder="Options (comma-separated)"
              value={(f.options ?? []).join(", ")}
              onChange={(e) =>
                update(idx, {
                  options: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          ) : (
            <div />
          )}
          <button
            className="btn-sm"
            onClick={() => remove(idx)}
            title="Remove field"
          >
            ×
          </button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button className="btn-sm" onClick={add}>
          + Add field
        </button>
        <button
          className="btn-sm btn-green"
          disabled={busy || fields.some((f) => !f.name.trim())}
          onClick={() => onSave(fields)}
        >
          Save fields
        </button>
      </div>
    </div>
  );
}
