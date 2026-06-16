"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Protected from "@/lib/Protected";

const GREEN = "#FFB63C";
const GREEN_DK = "#c77f00";
const SLATE = "#1c2530";
const MUTED = "#7c8278";
const LINE = "#e7e4dd";

const COLS = ["telefono", "nombre", "direccion", "cp", "mascota", "especie", "peso_kg", "edad", "producto", "pack_kg", "precio", "fecha"];
const CAT_COLS = ["producto", "tipo", "especie", "pack_kg", "precio"];
const CHANNELS = [["manual", "Mostrador"], ["mercadolibre", "MercadoLibre"], ["whatsapp", "WhatsApp"]];
function mapSpeciesCat(s) { const v = (s || "").toLowerCase(); if (v === "dog" || v === "perro") return "dog"; if (v === "cat" || v === "gato") return "cat"; return v ? "other" : null; }

function parseCSV(text) {
  text = text.replace(/^\uFEFF/, "");
  const rows = [];
  let field = "", row = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (ch === "\r") { /* skip */ }
      else field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).filter((r) => r.some((c) => c && c.trim())).map((r) => {
    const o = {};
    header.forEach((h, idx) => { o[h] = (r[idx] || "").trim(); });
    return o;
  });
}

function mapSpecies(s) {
  const v = (s || "").toLowerCase();
  if (v === "dog" || v === "perro") return "dog";
  if (v === "cat" || v === "gato") return "cat";
  return "other";
}
function num(v) { const n = parseFloat(v); return isNaN(n) ? null : n; }

function ImportarInner() {
  const [rows, setRows] = useState(null);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("historial");
  const [channel, setChannel] = useState("manual");

  function onFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseCSV(String(reader.result));
        setRows(parsed);
        setStatus(parsed.length + " filas leídas. Revisá y confirmá la importación.");
      } catch (err) { setStatus("No pude leer el archivo: " + err.message); }
    };
    reader.readAsText(f);
  }

  async function doImportCatalog() {
    if (!rows || !rows.length) return;
    setBusy(true); setStatus("Importando catálogo…"); setProgress(0);
    let ok = 0, err = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        if (!r.producto) { err++; setProgress(Math.round(((i + 1) / rows.length) * 100)); continue; }
        const ch = (r.canal || "").trim() ? (r.canal.trim().toLowerCase() === "mostrador" ? "manual" : r.canal.trim().toLowerCase()) : channel;
        const e = await supabase.from("catalog_items").insert({ channel: ch, name: r.producto, species: mapSpeciesCat(r.especie), type: r.tipo || (r.pack_kg ? "alimento" : "accesorio"), pack_kg: num(r.pack_kg), price: num(r.precio) });
        if (e.error) throw e.error;
        ok++;
      } catch (e) { err++; }
      setProgress(Math.round(((i + 1) / rows.length) * 100));
    }
    setBusy(false);
    setStatus("Catálogo importado: " + ok + " productos" + (err ? ", " + err + " con error." : "."));
    setRows(null);
  }

  function downloadCatTemplate() {
    const csv = CAT_COLS.join(",") + "\n" + "Royal Canin Maxi Adult,alimento,perro,15,30000\nRoyal Canin Maxi Adult,alimento,perro,3,9500\nCollar regulable,accesorio,,,4500\n";
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "catalogo-reko.csv"; a.click(); URL.revokeObjectURL(url);
  }

  async function doImport() {
    if (!rows || !rows.length) return;
    setBusy(true); setStatus("Importando…"); setProgress(0);
    let ok = 0, err = 0;
    const phoneCache = {};
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        const phone = (r.telefono || "").trim();
        if (!phone) { err++; setProgress(Math.round(((i + 1) / rows.length) * 100)); continue; }
        let cid = phoneCache[phone];
        if (!cid) {
          const ex = await supabase.from("customers").select("id").eq("phone_e164", phone).limit(1).maybeSingle();
          if (ex.data) cid = ex.data.id;
          else {
            const c = await supabase.from("customers").insert({ name: r.nombre || null, phone_e164: phone, channel_origin: "csv", lifecycle_stage: "active", address_full: r.direccion || null, postal_code: r.cp || null }).select("id").single();
            if (c.error) throw c.error;
            cid = c.data.id;
          }
          phoneCache[phone] = cid;
        }
        let pid = null;
        const isFood = !!r.pack_kg;
        if (r.producto) {
          const pr = await supabase.from("products").insert({ name: r.producto, species: r.especie ? mapSpecies(r.especie) : null, net_weight_g: isFood ? Math.round(num(r.pack_kg) * 1000) : null, is_consumable: isFood, price: num(r.precio) }).select("id").single();
          if (!pr.error) pid = pr.data.id;
        }
        if (r.mascota) {
          await supabase.from("pets").insert({ customer_id: cid, name: r.mascota, species: mapSpecies(r.especie), weight_kg: num(r.peso_kg) });
        }
        let when = new Date();
        if (r.fecha) { const d = new Date(r.fecha); if (!isNaN(d.getTime())) when = d; }
        const o = await supabase.from("orders").insert({ customer_id: cid, channel: "csv", total: num(r.precio) || 0, status: "paid", ordered_at: when.toISOString(), delivery_address: r.direccion || null, delivery_postal_code: r.cp || null }).select("id").single();
        if (o.error) throw o.error;
        if (pid) {
          await supabase.from("order_items").insert({ order_id: o.data.id, product_id: pid, qty: 1, unit_price: num(r.precio), net_weight_g_snapshot: isFood ? Math.round(num(r.pack_kg) * 1000) : null });
        }
        ok++;
      } catch (e) { err++; }
      setProgress(Math.round(((i + 1) / rows.length) * 100));
    }
    setBusy(false);
    setStatus("Importación terminada: " + ok + " filas cargadas" + (err ? ", " + err + " con error (revisá el formato)." : "."));
    setRows(null);
  }

  function downloadTemplate() {
    const csv = COLS.join(",") + "\n" + "+5491155550000,Maria Gonzalez,Av. Cazon 1234 Tigre,1648,Toto,perro,28,3,Royal Canin Maxi,15,28000,2026-05-01\n";
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "plantilla-reko.csv"; a.click(); URL.revokeObjectURL(url);
  }

  const box = { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: 16, marginBottom: 14 };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 10px" }}>Importar</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button onClick={() => { setMode("historial"); setRows(null); setStatus(""); }} style={{ flex: 1, padding: "11px", fontSize: 14, fontWeight: 700, border: `1px solid ${mode === "historial" ? GREEN : LINE}`, background: mode === "historial" ? GREEN : "#fff", color: SLATE, borderRadius: 11, cursor: "pointer" }}>Historial de ventas</button>
        <button onClick={() => { setMode("catalogo"); setRows(null); setStatus(""); }} style={{ flex: 1, padding: "11px", fontSize: 14, fontWeight: 700, border: `1px solid ${mode === "catalogo" ? GREEN : LINE}`, background: mode === "catalogo" ? GREEN : "#fff", color: SLATE, borderRadius: 11, cursor: "pointer" }}>Catálogo de productos</button>
      </div>
      <p style={{ fontSize: 13, color: MUTED, margin: "0 0 16px" }}>{mode === "historial" ? "Cargá un CSV con ventas pasadas. Los clientes se unifican por teléfono automáticamente." : "Cargá tu lista de productos por canal, así el autocompletado al cargar ventas ya filtra producto, presentación y precio según el canal."}</p>

      <div style={box}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>1. Formato del archivo</div>
        {mode === "historial" ? (
          <p style={{ fontSize: 13, color: MUTED, margin: "0 0 10px", lineHeight: 1.5 }}>
            Columnas (la única obligatoria es <b>telefono</b>):<br />
            <code style={{ fontSize: 12 }}>{COLS.join(", ")}</code>
          </p>
        ) : (
          <>
            <p style={{ fontSize: 13, color: MUTED, margin: "0 0 10px", lineHeight: 1.5 }}>
              Columnas (la única obligatoria es <b>producto</b>):<br />
              <code style={{ fontSize: 12 }}>{CAT_COLS.join(", ")}</code><br />
              <span style={{ fontSize: 12 }}>Repetí el mismo producto con distinto <b>pack_kg</b>/<b>precio</b> para cargar sus presentaciones. Opcional: columna <b>canal</b> para mezclar canales en un archivo.</span>
            </p>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 5 }}>Canal de este archivo</label>
              <select value={channel} onChange={(e) => setChannel(e.target.value)} style={{ width: "100%", border: `1px solid ${LINE}`, borderRadius: 10, padding: 11, fontSize: 15, background: "#fff", color: SLATE }}>
                {CHANNELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </>
        )}
        <button onClick={mode === "historial" ? downloadTemplate : downloadCatTemplate} style={{ width: "auto", padding: "9px 14px", fontSize: 13, fontWeight: 600, color: SLATE, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 10, cursor: "pointer" }}>Descargar plantilla</button>
      </div>

      <div style={box}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>2. Subir archivo</div>
        <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ fontSize: 14 }} />
      </div>

      {rows && (
        <div style={box}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>3. Confirmar</div>
          <p style={{ fontSize: 13, color: MUTED, margin: "0 0 10px" }}>{rows.length} filas listas para importar.</p>
          <button onClick={mode === "historial" ? doImport : doImportCatalog} disabled={busy} style={{ width: "100%", padding: 14, fontSize: 15, fontWeight: 700, color: SLATE, background: busy ? "#c2c8bd" : GREEN, border: "none", borderRadius: 11, cursor: busy ? "default" : "pointer" }}>
            {busy ? "Importando… " + progress + "%" : (mode === "historial" ? "Importar " + rows.length + " ventas" : "Importar " + rows.length + " productos (" + CHANNELS.find((c) => c[0] === channel)[1] + ")")}
          </button>
        </div>
      )}

      {status && <p style={{ fontSize: 13.5, color: status.indexOf("error") >= 0 || status.indexOf("pude") >= 0 ? "#b04b3f" : GREEN_DK, fontWeight: 600 }}>{status}</p>}

      <p style={{ marginTop: 16 }}><a href="/clientes" style={{ fontSize: 13, fontWeight: 600, color: GREEN_DK }}>← Ver clientes</a></p>
    </div>
  );
}

export default function Page() {
  return (
    <Protected>
      <ImportarInner />
    </Protected>
  );
}
