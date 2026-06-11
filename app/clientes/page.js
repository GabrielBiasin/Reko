"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Protected from "@/lib/Protected";

const GREEN = "#0f9b76";
const SLATE = "#1c2530";
const MUTED = "#7c8278";
const LINE = "#e7e4dd";

function normPhone(p) {
  return (p || "").replace(/[^0-9+]/g, "");
}

function ClientesInner() {
  const [clients, setClients] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [cs, os, ps] = await Promise.all([
          supabase.from("customers").select("id,name,phone_e164,created_at"),
          supabase.from("orders").select("customer_id,total,ordered_at"),
          supabase.from("pets").select("customer_id"),
        ]);
        if (cs.error) throw cs.error;
        const customers = cs.data || [];
        const orders = os.data || [];
        const pets = ps.data || [];

        const idToKey = {};
        const groups = {};
        customers.forEach((c) => {
          const key = normPhone(c.phone_e164) || "sintel-" + c.id;
          idToKey[c.id] = key;
          if (!groups[key]) groups[key] = { phone: c.phone_e164 || "—", name: c.name || "", merged: 0, pets: 0, orders: 0, total: 0, last: null };
          groups[key].merged += 1;
          if (c.name && !groups[key].name) groups[key].name = c.name;
        });
        pets.forEach((p) => { const k = idToKey[p.customer_id]; if (groups[k]) groups[k].pets += 1; });
        orders.forEach((o) => {
          const k = idToKey[o.customer_id];
          if (groups[k]) {
            groups[k].orders += 1;
            groups[k].total += Number(o.total) || 0;
            if (!groups[k].last || o.ordered_at > groups[k].last) groups[k].last = o.ordered_at;
          }
        });
        setClients(Object.values(groups).sort((a, b) => b.total - a.total));
      } catch (e) {
        setError(e.message || "Error al cargar clientes");
      }
    })();
  }, []);

  function exportCSV() {
    if (!clients || !clients.length) return;
    const header = ["nombre", "telefono", "mascotas", "compras", "total_gastado", "ultima_compra", "cargas_unificadas"];
    const rows = [header];
    clients.forEach((c) => rows.push([c.name, c.phone, c.pets, c.orders, c.total, c.last ? c.last.slice(0, 10) : "", c.merged]));
    const csv = rows.map((r) => r.map((v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"').join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "clientes-reko.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const money = (n) => "$ " + new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Math.round(n || 0));

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Clientes</h1>
        <a href="/importar" style={{ fontSize: 13, fontWeight: 600, color: GREEN }}>+ Importar historial</a>
      </div>
      <p style={{ fontSize: 13, color: MUTED, margin: "0 0 14px" }}>Unificados por número de teléfono.</p>

      {error && <p style={{ color: "#b04b3f", fontSize: 14 }}>{error}</p>}
      {!clients && !error && <p style={{ color: MUTED }}>Cargando…</p>}

      {clients && (
        <>
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <button onClick={exportCSV} disabled={!clients.length} style={{ flex: 1, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", background: clients.length ? GREEN : "#c2c8bd", border: "none", borderRadius: 11, cursor: clients.length ? "pointer" : "default" }}>
              Exportar CSV ({clients.length})
            </button>
          </div>

          {!clients.length && <p style={{ color: MUTED }}>Todavía no hay clientes. Cargá una venta o importá historial.</p>}

          {clients.map((c, i) => (
            <div key={i} style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: 14, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: SLATE }}>{c.name || "Sin nombre"}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: GREEN }}>{money(c.total)}</span>
              </div>
              <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>{c.phone}</div>
              <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 12.5, color: MUTED }}>
                <span>🐾 {c.pets}</span>
                <span>🛒 {c.orders}</span>
                {c.last && <span>última: {c.last.slice(0, 10)}</span>}
                {c.merged > 1 && <span style={{ color: GREEN }}>· {c.merged} cargas unificadas</span>}
              </div>
            </div>
          ))}
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
