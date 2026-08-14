"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Protected from "@/lib/Protected";

const GREEN = "#FFB63C";
const GREEN_DK = "#c77f00";
const SLATE = "#1c2530";
const MUTED = "#7c8278";
const LINE = "#e7e4dd";

function normPhone(p) { return (p || "").replace(/[^0-9+]/g, ""); }
const money = (n) => "$ " + new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Math.round(n || 0));
const speciesLabel = (s) => (s === "cat" ? "Gato" : s === "dog" ? "Perro" : "Otro");

function ClientesInner() {
  const [clients, setClients] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);

  useEffect(() => {
    (async () => {
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
          if (!groups[key]) groups[key] = { key, phone: c.phone_e164 || "—", name: c.name || "", addr: "", cp: "", barrio: "", merged: 0, pets: [], orders: [], total: 0, food: 0, acc: 0, last: null };
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
    })();
  }, []);

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
            return (
              <div key={c.key} style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, marginBottom: 10, overflow: "hidden" }}>
                <div onClick={() => setOpen(isOpen ? null : c.key)} style={{ padding: 14, cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: SLATE }}>{c.name || "Sin nombre"}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: GREEN_DK }}>{money(c.total)}</span>
                  </div>
                  <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>{c.phone}{c.addr ? " · " + c.addr : ""}{c.cp ? " · CP " + c.cp : ""}{c.barrio ? " · " + c.barrio : ""}</div>
                  <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 12.5, color: MUTED }}>
                    <span>🐾 {c.pets.length}</span>
                    <span>🛒 {c.orders.length}</span>
                    {c.last && <span>última: {c.last.slice(0, 10)}</span>}
                    <span style={{ marginLeft: "auto", color: GREEN_DK }}>{isOpen ? "▲" : "▼"}</span>
                  </div>
                </div>

                {isOpen && (
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
