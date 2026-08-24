"use client";
import { useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabaseClient";
import Protected from "@/lib/Protected";

const GREEN = "#FFB63C";
const GREEN_DK = "#c77f00";
const SLATE = "#1c2530";
const MUTED = "#7c8278";
const LINE = "#e7e4dd";

const COLS = ["telefono", "nombre", "direccion", "cp", "barrio", "mascota", "especie", "peso_kg", "edad", "producto", "pack_kg", "precio", "fecha"];
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

// Detecta teléfonos/números corrompidos por Excel (ej: "5,41126E+11" en vez del número real).
// Pasa esto cuando una celda numérica larga no tenía formato de Texto — el dato ya se perdió
// de forma irrecuperable, así que lo salteamos en vez de guardar basura.
function isCorruptedNumber(v) { return /^\d[.,]\d+e\+\d+$/i.test((v || "").trim()); }

// Lee un archivo .xlsx/.xls y lo devuelve en el mismo formato que parseCSV: un array de objetos
// con claves en minúscula (nombre de columna) y valores de texto ya recortados.
// raw:false hace que XLSX devuelva cada celda "como se ve" en Excel — así detectamos igual
// si una celda ya quedó corrompida en notación científica antes de subir el archivo.
function parseXLSX(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  return json
    .filter((row) => Object.values(row).some((v) => String(v).trim()))
    .map((row) => {
      const o = {};
      Object.keys(row).forEach((k) => { o[k.trim().toLowerCase()] = String(row[k] == null ? "" : row[k]).trim(); });
      return o;
    });
}

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
    const name = (f.name || "").toLowerCase();
    const isExcel = name.endsWith(".xlsx") || name.endsWith(".xls") || f.type.indexOf("spreadsheet") >= 0 || f.type === "application/vnd.ms-excel";
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = isExcel ? parseXLSX(reader.result) : parseCSV(String(reader.result));
        const corrupted = parsed.filter((r) => r.telefono && isCorruptedNumber(r.telefono)).length;
        setRows(parsed);
        setStatus(parsed.length + " filas leídas." + (corrupted ? " ⚠ " + corrupted + " tienen el teléfono dañado (notación científica de Excel) y se van a saltear al importar." : "") + " Revisá y confirmá la importación.");
      } catch (err) { setStatus("No pude leer el archivo: " + err.message); }
    };
    if (isExcel) reader.readAsArrayBuffer(f); else reader.readAsText(f);
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
    let ok = 0, err = 0, dupOrders = 0, dupPets = 0;
    const phoneCache = {};
    const productCache = {};
    const petCache = {};
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        const phone = (r.telefono || "").trim();
        if (!phone || isCorruptedNumber(phone)) { err++; setProgress(Math.round(((i + 1) / rows.length) * 100)); continue; }
        let cid = phoneCache[phone];
        if (!cid) {
          const ex = await supabase.from("customers").select("id").eq("phone_e164", phone).limit(1).maybeSingle();
          if (ex.data) {
            cid = ex.data.id;
            // Bug corregido: antes, si el cliente ya existía, la dirección/CP/barrio del CSV se descartaban.
            // Ahora, si la fila trae el dato, se actualiza el perfil del cliente con lo más reciente.
            const patch = {};
            if (r.direccion) patch.address_full = r.direccion;
            if (r.cp) patch.postal_code = r.cp;
            if (r.barrio) patch.barrio = r.barrio;
            if (Object.keys(patch).length) await supabase.from("customers").update(patch).eq("id", cid);
          } else {
            const c = await supabase.from("customers").insert({ name: r.nombre || null, phone_e164: phone, channel_origin: "csv", lifecycle_stage: "active", address_full: r.direccion || null, postal_code: r.cp || null, barrio: r.barrio || null }).select("id").single();
            if (c.error) throw c.error;
            cid = c.data.id;
          }
          phoneCache[phone] = cid;
        }
        let pid = null;
        const isFood = !!r.pack_kg;
        if (r.producto) {
          const prodName = r.producto.trim();
          const cacheKey = prodName.toLowerCase();
          if (productCache[cacheKey]) {
            pid = productCache[cacheKey];
          } else {
            // Bug corregido: antes se insertaba un producto nuevo por cada fila del CSV,
            // aunque el mismo producto ya existiera (por importaciones repetidas o filas duplicadas).
            // Ahora se busca primero por nombre (case-insensitive, match exacto) y se reutiliza si existe.
            const exProd = await supabase.from("products").select("id").ilike("name", prodName).limit(1).maybeSingle();
            if (exProd.data) {
              pid = exProd.data.id;
            } else {
              const pr = await supabase.from("products").insert({ name: prodName, species: r.especie ? mapSpecies(r.especie) : null, net_weight_g: isFood ? Math.round(num(r.pack_kg) * 1000) : null, is_consumable: isFood, price: num(r.precio) }).select("id").single();
              if (!pr.error) pid = pr.data.id;
            }
            if (pid) productCache[cacheKey] = pid;
          }
        }
        if (r.mascota) {
          const petName = r.mascota.trim();
          const petKey = cid + "|" + petName.toLowerCase();
          if (!petCache[petKey]) {
            // Evita duplicar la misma mascota si el cliente reimporta un archivo que se solapa
            // con datos ya cargados: busca por cliente+nombre antes de crear una nueva.
            const exPet = await supabase.from("pets").select("id").eq("customer_id", cid).ilike("name", petName).limit(1).maybeSingle();
            if (exPet.data) { dupPets++; } else { await supabase.from("pets").insert({ customer_id: cid, name: petName, species: mapSpecies(r.especie), weight_kg: num(r.peso_kg) }); }
            petCache[petKey] = true;
          }
        }
        let when = new Date();
        if (r.fecha) { const d = new Date(r.fecha); if (!isNaN(d.getTime())) when = d; }

        // Evita duplicar la misma venta si el archivo se solapa con ventas ya importadas antes:
        // mismo cliente + mismo día + mismo total ya cuenta como "es la misma compra".
        const dayStart = new Date(when); dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
        const total = num(r.precio) || 0;
        const dupCheck = await supabase.from("orders").select("id").eq("customer_id", cid).eq("total", total).gte("ordered_at", dayStart.toISOString()).lt("ordered_at", dayEnd.toISOString()).limit(1).maybeSingle();
        if (dupCheck.data) { dupOrders++; setProgress(Math.round(((i + 1) / rows.length) * 100)); continue; }

        const o = await supabase.from("orders").insert({ customer_id: cid, channel: "csv", total, status: "paid", ordered_at: when.toISOString(), delivery_address: r.direccion || null, delivery_postal_code: r.cp || null, delivery_barrio: r.barrio || null }).select("id").single();
        if (o.error) throw o.error;
        if (pid) {
          await supabase.from("order_items").insert({ order_id: o.data.id, product_id: pid, qty: 1, unit_price: num(r.precio), net_weight_g_snapshot: isFood ? Math.round(num(r.pack_kg) * 1000) : null });
        }
        ok++;
      } catch (e) { err++; }
      setProgress(Math.round(((i + 1) / rows.length) * 100));
    }
    setBusy(false);
    let msg = "Importación terminada: " + ok + " filas cargadas";
    if (dupOrders) msg += ", " + dupOrders + " ventas salteadas por estar duplicadas";
    if (dupPets) msg += ", " + dupPets + " mascotas ya existentes (no se duplicaron)";
    if (err) msg += ", " + err + " con error (revisá el formato)";
    setStatus(msg + ".");
    setRows(null);
  }

  function downloadTemplate() {
    const csv = COLS.join(",") + "\n" + "+5491155550000,Maria Gonzalez,Av. Cazon 1234 Tigre,1648,Tigre Centro,Toto,perro,28,3,Royal Canin Maxi,15,28000,2026-05-01\n";
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "plantilla-reko.csv"; a.click(); URL.revokeObjectURL(url);
  }

  // Plantilla en Excel con la columna "telefono" forzada a formato Texto (código '@').
  // Así Excel nunca la convierte a notación científica, ni al completarla ni al reabrirla —
  // el problema que rompió teléfonos en una importación anterior no puede volver a pasar con esta plantilla.
  function downloadTemplateXLSX() {
    const example = ["+5491155550000", "Maria Gonzalez", "Av. Cazon 1234 Tigre", "1648", "Tigre Centro", "Toto", "perro", "28", "3", "Royal Canin Maxi", "15", "28000", "2026-05-01"];
    const ws = XLSX.utils.aoa_to_sheet([COLS, example]);
    const phoneCol = COLS.indexOf("telefono");
    for (let r = 1; r <= 500; r++) {
      const addr = XLSX.utils.encode_cell({ r, c: phoneCol });
      if (!ws[addr]) ws[addr] = { t: "s", v: "" };
      ws[addr].z = "@";
      ws[addr].t = "s";
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Historial");
    XLSX.writeFile(wb, "plantilla-reko.xlsx");
  }

  const box = { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: 16, marginBottom: 14 };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 10px" }}>Importar</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button onClick={() => { setMode("historial"); setRows(null); setStatus(""); }} style={{ flex: 1, padding: "11px", fontSize: 14, fontWeight: 700, border: `1px solid ${mode === "historial" ? GREEN : LINE}`, background: mode === "historial" ? GREEN : "#fff", color: SLATE, borderRadius: 11, cursor: "pointer" }}>Historial de ventas</button>
        <button onClick={() => { setMode("catalogo"); setRows(null); setStatus(""); }} style={{ flex: 1, padding: "11px", fontSize: 14, fontWeight: 700, border: `1px solid ${mode === "catalogo" ? GREEN : LINE}`, background: mode === "catalogo" ? GREEN : "#fff", color: SLATE, borderRadius: 11, cursor: "pointer" }}>Catálogo de productos</button>
      </div>
      <p style={{ fontSize: 13, color: MUTED, margin: "0 0 16px" }}>{mode === "historial" ? "Cargá un CSV o Excel con ventas pasadas. Los clientes se unifican por teléfono automáticamente." : "Cargá tu lista de productos por canal (CSV o Excel), así el autocompletado al cargar ventas ya filtra producto, presentación y precio según el canal."}</p>

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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={mode === "historial" ? downloadTemplate : downloadCatTemplate} style={{ width: "auto", padding: "9px 14px", fontSize: 13, fontWeight: 600, color: SLATE, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 10, cursor: "pointer" }}>Descargar plantilla (CSV)</button>
          {mode === "historial" && (
            <button onClick={downloadTemplateXLSX} style={{ width: "auto", padding: "9px 14px", fontSize: 13, fontWeight: 600, color: SLATE, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 10, cursor: "pointer" }}>Descargar plantilla (Excel)</button>
          )}
        </div>
        {mode === "historial" && <p style={{ fontSize: 11.5, color: MUTED, margin: "8px 0 0" }}>Tip: la plantilla Excel trae la columna teléfono ya formateada como texto, para que nunca se convierta en notación científica (ej. 5,41E+11) al completarla.</p>}
      </div>

      <div style={box}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>2. Subir archivo</div>
        <input type="file" accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={onFile} style={{ fontSize: 14 }} />
        <p style={{ fontSize: 11.5, color: MUTED, margin: "8px 0 0" }}>Formatos aceptados: .csv, .xlsx, .xls</p>
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
