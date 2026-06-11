"use client";
import React, { useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import Protected from "@/lib/Protected";

const GREEN = "#0f9b76";
const GREEN_DK = "#0c7d5e";
const SLATE = "#1c2530";
const MUTED = "#7c8278";
const LINE = "#e7e4dd";

function lifeStage(species, ageYears) {
  const a = parseFloat(ageYears);
  if (isNaN(a)) return null;
  if (a < 1) return "puppy";
  if (species === "cat") return a >= 10 ? "senior" : "adult";
  return a >= 7 ? "senior" : "adult";
}
const STAGE_LABEL = { puppy: "cachorro", adult: "adulto", senior: "senior" };
function merFactor(species, stage) {
  if (species === "cat") return stage === "puppy" ? 2.5 : stage === "senior" ? 1.1 : 1.2;
  return stage === "puppy" ? 2.0 : stage === "senior" ? 1.3 : 1.6;
}
function gramsPerDay(species, weightKg, ageYears) {
  if (!weightKg || weightKg <= 0) return 0;
  const rer = 70 * Math.pow(weightKg, 0.75);
  const kcalPerKg = species === "cat" ? 4000 : 3500;
  const stage = lifeStage(species, ageYears) || "adult";
  return ((merFactor(species, stage) * rer) / kcalPerKg) * 1000;
}

const CHANNEL_MAP = { mostrador: "manual", mercadolibre: "mercadolibre", whatsapp: "whatsapp" };

const inputStyle = { width: "100%", border: `1px solid ${LINE}`, borderRadius: 11, padding: "13px", fontSize: 16, color: SLATE, background: "#fff", outline: "none", boxSizing: "border-box" };
const Label = ({ children }) => <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: MUTED, marginBottom: 6 }}>{children}</span>;
const Seg = ({ value, current, onClick, children }) => {
  const active = value === current;
  return <button onClick={() => onClick(value)} style={{ flex: 1, padding: "11px 8px", fontSize: 14, fontWeight: 600, border: `1px solid ${active ? GREEN : LINE}`, background: active ? GREEN : "#fff", color: active ? "#fff" : SLATE, borderRadius: 10, cursor: "pointer" }}>{children}</button>;
};
const Card = ({ step, title, children }) => (
  <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 16, padding: 16, marginBottom: 14 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
      <span style={{ width: 24, height: 24, borderRadius: 7, background: GREEN, color: "#fff", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{step}</span>
      <span style={{ fontSize: 15, fontWeight: 700, color: SLATE }}>{title}</span>
    </div>
    {children}
  </div>
);

function CargarInner() {
  const [cliente, setCliente] = useState({ nombre: "", whatsapp: "" });
  const [mascota, setMascota] = useState({ nombre: "", especie: "dog", raza: "", peso: "", edad: "" });
  const [venta, setVenta] = useState({ producto: "", tipo: "alimento", packKg: "", cantidad: "1", precio: "", origen: "mostrador" });
  const [estado, setEstado] = useState({ guardando: false, ok: false, error: "" });

  const pred = useMemo(() => {
    if (venta.tipo !== "alimento") return null;
    const peso = parseFloat(mascota.peso), pack = parseFloat(venta.packKg), qty = parseFloat(venta.cantidad) || 1;
    if (!peso || !pack) return null;
    const gpd = gramsPerDay(mascota.especie, peso, mascota.edad);
    if (!gpd) return null;
    const dias = Math.round((pack * 1000 * qty) / gpd);
    const fecha = new Date(); fecha.setDate(fecha.getDate() + dias);
    const stage = lifeStage(mascota.especie, mascota.edad);
    return { dias, gpd: Math.round(gpd), etapa: stage ? STAGE_LABEL[stage] : null, iso: fecha.toISOString().slice(0, 10),
      fecha: fecha.toLocaleDateString("es-AR", { day: "numeric", month: "long" }) };
  }, [venta.tipo, venta.packKg, venta.cantidad, mascota.peso, mascota.especie, mascota.edad]);

  const puedeGuardar = cliente.nombre.trim() && cliente.whatsapp.trim() && !estado.guardando;

  const reset = () => {
    setCliente({ nombre: "", whatsapp: "" });
    setMascota({ nombre: "", especie: "dog", raza: "", peso: "", edad: "" });
    setVenta({ producto: "", tipo: "alimento", packKg: "", cantidad: "1", precio: "", origen: "mostrador" });
  };

  const guardar = async () => {
    setEstado({ guardando: true, ok: false, error: "" });
    try {
      const precioNum = parseFloat(venta.precio) || null;
      // 1) cliente (busca-o-crea por telefono para no duplicar)
      let c;
      const existing = await supabase.from("customers").select("id").eq("phone_e164", cliente.whatsapp).limit(1).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) {
        c = existing.data;
      } else {
        const { data: nc, error: e1 } = await supabase.from("customers").insert({
          name: cliente.nombre, phone_e164: cliente.whatsapp,
          channel_origin: CHANNEL_MAP[venta.origen], lifecycle_stage: "active",
        }).select("id").single();
        if (e1) throw e1;
        c = nc;
      }
      // 2) mascota
      const { data: p, error: e2 } = await supabase.from("pets").insert({
        customer_id: c.id, name: mascota.nombre || null, species: mascota.especie,
        breed: mascota.raza || null, weight_kg: parseFloat(mascota.peso) || null,
        life_stage: lifeStage(mascota.especie, mascota.edad),
      }).select("id").single();
      if (e2) throw e2;
      // 3) producto
      let productId = null;
      if (venta.producto.trim()) {
        const { data: pr, error: e3 } = await supabase.from("products").insert({
          name: venta.producto, species: mascota.especie,
          net_weight_g: venta.tipo === "alimento" ? Math.round((parseFloat(venta.packKg) || 0) * 1000) : null,
          is_consumable: venta.tipo === "alimento", price: precioNum,
        }).select("id").single();
        if (e3) throw e3;
        productId = pr.id;
      }
      // 4) orden + item
      const { data: o, error: e4 } = await supabase.from("orders").insert({
        customer_id: c.id, channel: CHANNEL_MAP[venta.origen], total: precioNum || 0, status: "paid",
      }).select("id").single();
      if (e4) throw e4;
      if (productId) {
        const { error: e5 } = await supabase.from("order_items").insert({
          order_id: o.id, product_id: productId, qty: parseFloat(venta.cantidad) || 1,
          unit_price: precioNum, net_weight_g_snapshot: venta.tipo === "alimento" ? Math.round((parseFloat(venta.packKg) || 0) * 1000) : null,
        });
        if (e5) throw e5;
      }
      // 5) predicción de recompra
      if (pred && productId) {
        const { error: e6 } = await supabase.from("repurchase_predictions").insert({
          customer_id: c.id, pet_id: p.id, product_id: productId,
          predicted_runout_date: pred.iso, method: "heuristic", status: "pending",
        });
        if (e6) throw e6;
      }
      setEstado({ guardando: false, ok: true, error: "" });
      setTimeout(() => { setEstado({ guardando: false, ok: false, error: "" }); reset(); }, 2800);
    } catch (err) {
      setEstado({ guardando: false, ok: false, error: err.message || "Error al guardar" });
    }
  };

  return (
    <div style={{ padding: "16px 12px 28px" }}>
      <div style={{ maxWidth: 440, margin: "0 auto" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: "4px 0 16px" }}>Cargar venta</h1>

        <Card step="1" title="Cliente">
          <div style={{ marginBottom: 12 }}><Label>Nombre</Label>
            <input style={inputStyle} placeholder="María González" value={cliente.nombre} onChange={(e) => setCliente({ ...cliente, nombre: e.target.value })} /></div>
          <div><Label>WhatsApp</Label>
            <input style={inputStyle} placeholder="+54 9 11 ..." inputMode="tel" value={cliente.whatsapp} onChange={(e) => setCliente({ ...cliente, whatsapp: e.target.value })} /></div>
        </Card>

        <Card step="2" title="Mascota">
          <div style={{ marginBottom: 12 }}><Label>Especie</Label>
            <div style={{ display: "flex", gap: 8 }}>
              <Seg value="dog" current={mascota.especie} onClick={(v) => setMascota({ ...mascota, especie: v })}>🐕 Perro</Seg>
              <Seg value="cat" current={mascota.especie} onClick={(v) => setMascota({ ...mascota, especie: v })}>🐈 Gato</Seg>
              <Seg value="other" current={mascota.especie} onClick={(v) => setMascota({ ...mascota, especie: v })}>Otro</Seg>
            </div></div>
          <div style={{ marginBottom: 12 }}><Label>Nombre</Label>
            <input style={inputStyle} placeholder="Toto" value={mascota.nombre} onChange={(e) => setMascota({ ...mascota, nombre: e.target.value })} /></div>
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1 }}><Label>Peso (kg)</Label>
              <input style={inputStyle} placeholder="28" inputMode="decimal" value={mascota.peso} onChange={(e) => setMascota({ ...mascota, peso: e.target.value })} /></div>
            <div style={{ flex: 1 }}><Label>Edad (años)</Label>
              <input style={inputStyle} placeholder="3" inputMode="decimal" value={mascota.edad} onChange={(e) => setMascota({ ...mascota, edad: e.target.value })} /></div>
          </div>
          <div><Label>Raza (opcional)</Label>
            <input style={inputStyle} placeholder="Labrador" value={mascota.raza} onChange={(e) => setMascota({ ...mascota, raza: e.target.value })} /></div>
        </Card>

        <Card step="3" title="Venta">
          <div style={{ marginBottom: 12 }}><Label>Tipo</Label>
            <div style={{ display: "flex", gap: 8 }}>
              <Seg value="alimento" current={venta.tipo} onClick={(v) => setVenta({ ...venta, tipo: v })}>Alimento</Seg>
              <Seg value="accesorio" current={venta.tipo} onClick={(v) => setVenta({ ...venta, tipo: v })}>Accesorio</Seg>
              <Seg value="otro" current={venta.tipo} onClick={(v) => setVenta({ ...venta, tipo: v })}>Otro</Seg>
            </div></div>
          <div style={{ marginBottom: 12 }}><Label>Producto</Label>
            <input style={inputStyle} placeholder={venta.tipo === "alimento" ? "Royal Canin Maxi Adult" : "Correa reforzada"} value={venta.producto} onChange={(e) => setVenta({ ...venta, producto: e.target.value })} /></div>
          {venta.tipo === "alimento" && (
            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}><Label>Paquete (kg)</Label>
                <input style={inputStyle} placeholder="15" inputMode="decimal" value={venta.packKg} onChange={(e) => setVenta({ ...venta, packKg: e.target.value })} /></div>
              <div style={{ flex: 1 }}><Label>Cantidad</Label>
                <input style={inputStyle} placeholder="1" inputMode="numeric" value={venta.cantidad} onChange={(e) => setVenta({ ...venta, cantidad: e.target.value })} /></div>
            </div>
          )}
          <div style={{ marginBottom: 12 }}><Label>Precio</Label>
            <input style={inputStyle} placeholder="28000" inputMode="decimal" value={venta.precio} onChange={(e) => setVenta({ ...venta, precio: e.target.value })} /></div>
          <div><Label>Canal de origen</Label>
            <div style={{ display: "flex", gap: 8 }}>
              <Seg value="mostrador" current={venta.origen} onClick={(v) => setVenta({ ...venta, origen: v })}>Mostrador</Seg>
              <Seg value="mercadolibre" current={venta.origen} onClick={(v) => setVenta({ ...venta, origen: v })}>ML</Seg>
              <Seg value="whatsapp" current={venta.origen} onClick={(v) => setVenta({ ...venta, origen: v })}>WhatsApp</Seg>
            </div></div>
        </Card>

        {pred && (
          <div style={{ background: GREEN, color: "#fff", borderRadius: 16, padding: "16px 18px", marginBottom: 14 }}>
            <div style={{ fontSize: 12.5, opacity: 0.9, marginBottom: 3, fontWeight: 600 }}>🔮 Próxima recompra estimada</div>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>en ~{pred.dias} días · {pred.fecha}</div>
            <div style={{ fontSize: 12.5, opacity: 0.92, marginTop: 6 }}>
              {mascota.nombre || "La mascota"}{pred.etapa ? ` (${pred.etapa})` : ""} consume ~{pred.gpd} g/día.
            </div>
          </div>
        )}

        <button onClick={guardar} disabled={!puedeGuardar} style={{ width: "100%", padding: 16, fontSize: 16, fontWeight: 700, color: "#fff", background: estado.ok ? GREEN_DK : puedeGuardar ? GREEN : "#c2c8bd", border: "none", borderRadius: 13, cursor: puedeGuardar ? "pointer" : "default" }}>
          {estado.guardando ? "Guardando…" : estado.ok ? "✓ Guardado — recompra agendada" : "Guardar venta"}
        </button>
        {estado.error && <p style={{ fontSize: 13, color: "#b04b3f", marginTop: 10, textAlign: "center" }}>{estado.error}</p>}
        {estado.ok && <p style={{ fontSize: 13, color: GREEN_DK, marginTop: 10, textAlign: "center" }}>Se creó el cliente, la mascota y la venta en tu base.</p>}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Protected>
      <CargarInner />
    </Protected>
  );
}
