"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Protected from "@/lib/Protected";
import { barrioFromCP } from "@/lib/cpBarrios";

const GREEN = "#FFB63C";
const GREEN_DK = "#c77f00";
const SLATE = "#1c2530";
const MUTED = "#7c8278";
const LINE = "#e7e4dd";

function normPhone(p) { return (p || "").replace(/[^0-9+]/g, ""); }
const money = (n) => "$ " + new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Math.round(n || 0));
const speciesLabel = (s) => (s === "cat" ? "Gato" : s === "dog" ? "Perro" : "Otro");
const editInput = { width: "100%", border: "1px solid #e7e4dd", borderRadius: 9, padding: "9px 11px", fontSize: 14, color: "#1c2530", background: "#fff", outline: "none", boxSizing: "border-box" };

function ClientesInner() {
  const [clients, setClients] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);
  const [editingKey, setEditingKey] = useState(null);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const [cs, ps, os, ois, prs] = await Promise.all([
        supabase.from("customers").select("id,name,phone_e164,created_at,address_full,postal_code,barrio"),
        supabase.from("pets").select("customer_id,name,species,weight_kg,life_stage"),
        supabase.from("orders").select("id,customer_id,total,ordered_at"),
        supabase.from("order_items").select("order_id,product_id,qty,unit_price"),
        supabase.from("products").select("id,name,is_consumable"),
      ]);
      if (cs.error) throw cs.error;
      const customers = cs.data || [], pets = ps.data || [], orders = os.data || [], items = ois.data || [], products = prs.data || [];

      const prodById = {}; products.forEach((p) => (prodById[p.id] = p));
      const itemsByOrder = {}; items.forEach((it) => { (itemsByOrder[it.order_id] = itemsByOrder[it.order_id] || []).push(it); });

      const idToKey = {}; const groups = {};
      customers.forEach((c) => {
        const key = normPhone(c.phone_e164) || "sintel-" + c.id;
        idToKey[c.id] = key;
        if (!groups[key]) groups[key] = { key, ids: [], phone: c.phone_e164 || "—", name: c.name || "", addr: "", cp: "", barrio: "", merged: 0, pets: [], orders: [], total: 0, food: 0, acc: 0, last: null };
        groups[key].ids.push(c.id);
        groups[key].merged += 1;
        if (c.name && !groups[key].name) groups[key].name = c.name;
        if (c.address_full && !groups[key].addr) groups[key].addr = c.address_full;
        if (c.postal_code && !groups[key].cp) groups[key].cp = c.postal_code;
        if (c.barrio && !groups[key].barrio) groups[key].barrio = c.barrio;
      });
      pets.forEach((p) => { const k = idToKey[p.customer_id]; if (groups[k]) groups[k].pets.push(p); });
      orders.forEach((o) => {
        const k = idToKey[o.customer_id]; if (!groups[k]) return;
        const its = itemsByOrder[o.id] || [];
        const names = its.map((it) => (prodById[it.product_id] ? prodById[it.product_id].name : "Producto"));
        its.forEach((it) => { const pr = prodById[it.product_id]; if (pr && pr.is_consumable) groups[k].food += 1; else if (pr) groups[k].acc += 1; });
        groups[k].orders.push({ id: o.id, date: o.ordered_at, total: Number(o.total) || 0, names });
        groups[k].total += Number(o.total) || 0;
        if (!groups[k].last || o.ordered_at > groups[k].last) groups[k].last = o.ordered_at;
      });
      Object.values(groups).forEach((g) => g.orders.sort((a, b) => (a.date < b.date ? 1 : -1)));
      setClients(Object.values(groups).sort((a, b) => b.total - a.total));
    } catch (e) { setError(e.message || "Error al cargar clientes"); }
  }
  useEffect(() => { load(); }, []);

  function startEdit(c) {
    setEditingKey(c.key);
    setOpen(c.key);
    setDraft({ name: c.name || "", phone: c.phone === "—" ? "" : c.phone, addr: c.addr || "", cp: c.cp || "", barrio: c.barrio || "" });
  }
  function cancelEdit() { setEditingKey(null); setDraft({}); }

  async function saveEdit(c) {
    setSaving(true);
    try {
      const patch = {
        name: draft.name.trim() || null,
        phone_e164: draft.phone.trim() || null,
        address_full: draft.addr.trim() || null,
        postal_code: draft.cp.trim() || null,
        barrio: draft.barrio.trim() || null,
      };
      const { error: err } = await supabase.from("customers").update(patch).in("id", c.ids);
      if (err) throw err;
      setEditingKey(null); setDraft({});
      await load();
    } catch (e) { alert("No pude guardar: " + (e.message || e)); }
    setSaving(false);
  }

  function exportCSV() {
    if (!clients || !clients.length) return;
    const header = ["nombre", "telefono", "direccion", "cp", "barrio", "mascotas", "compras", "total_gastado", "pct_alimento", "ultima_compra"];
    const rows = [header];
    clients.forEach((c) => {
      const tot = c.food + c.acc; const pct = tot ? Math.round((c.food / tot) * 100) : 0;
      rows.push([c.name, c.phone, c.addr, c.cp, c.barrio, c.pets.length, c.orders.length, c.total, pct + "%", c.last ? c.last.slice(0, 10) : ""]);
    });
    const csv = rows.map((r) => r.map((v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"').join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "clientes-reko.csv"; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px 50px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Clientes</h1>
        <a href="/importar" style={{ fontSize: 13, fontWeight: 600, color: GREEN_DK }}>+ Importar historial</a>
      </div>
      <p style={{ fontSize: 13, color: MUTED, margin: "0 0 14px" }}>Unificados por número de teléfono. Tocá un cliente para ver su perfil.</p>

      {error && <p style={{ color: "#b04b3f", fontSize: 14 }}>{error}</p>}
      {!clients && !error && <p style={{ color: MUTED }}>Cargando…</p>}

      {clients && (
        <>
          <button onClick={exportCSV} disabled={!clients.length} style={{ width: "100%", padding: "11px", fontSize: 14, fontWeight: 700, color: SLATE, background: clients.length ? GREEN : "#c2c8bd", border: "none", borderRadius: 11, cursor: clients.length ? "pointer" : "default", marginBottom: 14 }}>
            Exportar CSV ({clients.length})
          </button>
          {!clients.length && <p style={{ color: MUTED }}>Todavía no hay clientes. Cargá una venta o importá historial.</p>}

          {clients.map((c) => {
            const tot = c.food + c.acc; const pct = tot ? Math.round((c.food / tot) * 100) : 0;
            const isOpen = open === c.key;
            const isEditing = editingKey === c.key;
            return (
              <div key={c.key} style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, marginBottom: 10, overflow: "hidden" }}>
                <div onClick={() => !isEditing && setOpen(isOpen ? null : c.key)} style={{ padding: 14, cursor: isEditing ? "default" : "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: SLATE }}>{c.name || "Sin nombre"}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: GREEN_DK }}>{money(c.total)}</span>
                  </div>
                  <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>{c.phone}{c.addr ? " · " + c.addr : ""}{(c.barrio || barrioFromCP(c.cp)) ? " · " + (c.barrio || barrioFromCP(c.cp)) : ""}</div>
                  <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 12.5, color: MUTED, alignItems: "center" }}>
                    <span>🐾 {c.pets.length}</span>
                    <span>🛒 {c.orders.length}</span>
                    {c.last && <span>última: {c.last.slice(0, 10)}</span>}
                    <span
                      onClick={(e) => { e.stopPropagation(); isEditing ? cancelEdit() : startEdit(c); }}
                      style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 700, color: GREEN_DK, cursor: "pointer" }}
                    >
                      {isEditing ? "Cancelar" : "✎ Editar"}
                    </span>
                    {!isEditing && <span style={{ color: GREEN_DK }}>{isOpen ? "▲" : "▼"}</span>}
                  </div>
                </div>

                {isEditing && (
                  <div style={{ borderTop: `1px solid ${LINE}`, padding: 14, background: "#fdf6e9" }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: MUTED, marginBottom: 10 }}>EDITAR CLIENTE{c.merged > 1 ? " (" + c.merged + " registros unificados)" : ""}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 4 }}>Nombre</label>
                        <input style={editInput} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 4 }}>WhatsApp</label>
                        <input style={editInput} inputMode="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder="+54 9 11 ..." />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 4 }}>Dirección</label>
                        <input style={editInput} value={draft.addr} onChange={(e) => setDraft({ ...draft, addr: e.target.value })} />
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 4 }}>Cód. postal</label>
                          <input style={editInput} value={draft.cp} onChange={(e) => setDraft({ ...draft, cp: e.target.value })} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 4 }}>Barrio</label>
                          <input style={editInput} value={draft.barrio} onChange={(e) => setDraft({ ...draft, barrio: e.target.value })} />
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      <button onClick={() => saveEdit(c)} disabled={saving} style={{ flex: 1, padding: "11px", fontSize: 14, fontWeight: 700, color: SLATE, background: saving ? "#c2c8bd" : GREEN, border: "none", borderRadius: 10, cursor: saving ? "default" : "pointer" }}>
                        {saving ? "Guardando…" : "Guardar cambios"}
                      </button>
                      <button onClick={cancelEdit} style={{ padding: "11px 16px", fontSize: 14, fontWeight: 600, color: SLATE, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 10, cursor: "pointer" }}>Cancelar</button>
                    </div>
                  </div>
                )}

                {isOpen && !isEditing && (
                  <div style={{ borderTop: `1px solid ${LINE}`, padding: 14, background: "#fafaf8" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: MUTED, marginBottom: 6 }}>MASCOTAS</div>
                    {c.pets.length ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                        {c.pets.map((p, i) => (
                          <span key={i} style={{ fontSize: 13, fontWeight: 600, color: SLATE, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 999, padding: "6px 12px" }}>
                            {p.name || speciesLabel(p.species)} · {speciesLabel(p.species)}{p.weight_kg ? " · " + p.weight_kg + "kg" : ""}
                          </span>
                        ))}
                      </div>
                    ) : <p style={{ fontSize: 13, color: MUTED, marginBottom: 14 }}>Sin mascotas registradas.</p>}

                    <div style={{ fontSize: 12.5, fontWeight: 700, color: MUTED, marginBottom: 6 }}>ALIMENTO vs ACCESORIOS</div>
                    {tot ? (
                      <>
                        <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", marginBottom: 4 }}>
                          <div style={{ width: pct + "%", background: GREEN }} />
                          <div style={{ width: 100 - pct + "%", background: "#d9b382" }} />
                        </div>
                        <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 14 }}>{pct}% alimento · {100 - pct}% accesorios ({c.food + c.acc} ítems)</div>
                      </>
                    ) : <p style={{ fontSize: 13, color: MUTED, marginBottom: 14 }}>Sin ítems cargados.</p>}

                    <div style={{ fontSize: 12.5, fontWeight: 700, color: MUTED, marginBottom: 6 }}>HISTORIAL DE COMPRAS</div>
                    {c.orders.length ? c.orders.map((o, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "7px 0", borderBottom: i < c.orders.length - 1 ? `1px solid ${LINE}` : "none" }}>
                        <span style={{ color: SLATE }}>{o.date ? o.date.slice(0, 10) : "—"} · {o.names.length ? o.names.join(", ") : "venta"}</span>
                        <span style={{ color: MUTED, fontWeight: 600 }}>{money(o.total)}</span>
                      </div>
                    )) : <p style={{ fontSize: 13, color: MUTED }}>Sin compras.</p>}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Protected>
      <ClientesInner />
    </Protected>
  );
}
