"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Protected from "@/lib/Protected";

const GREEN = "#FFB63C";
const GREEN_DK = "#c77f00";
const SLATE = "#1c2530";
const MUTED = "#7c8278";
const LINE = "#e7e4dd";

function waPhone(p) {
  let d = (p || "").replace(/[^0-9]/g, "");
  if (d.startsWith("0")) d = d.slice(1);
  if (!d.startsWith("54")) d = "54" + d;
  return d;
}

// Valida que haya un número real para contactar (no vacío, no "Sin datos", con suficientes dígitos).
function hasValidPhone(p) {
  if (!p) return false;
  const digits = p.replace(/[^0-9]/g, "");
  return digits.length >= 10;
}

function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [shopName, setShopName] = useState("tu tienda");

  async function load() {
    try {
      const soon = new Date(); soon.setDate(soon.getDate() + 7);
      const [preds, prods, pets, ois, orders_, tn] = await Promise.all([
        supabase.from("repurchase_predictions").select("id,customer_id,pet_id,product_id,predicted_runout_date,status").eq("status", "pending").lte("predicted_runout_date", soon.toISOString().slice(0, 10)).order("predicted_runout_date"),
        supabase.from("products").select("id,name,is_consumable"),
        supabase.from("pets").select("id,customer_id,name"),
        supabase.from("order_items").select("order_id,product_id"),
        supabase.from("orders").select("id,customer_id"),
        supabase.from("tenants").select("name").limit(1).maybeSingle(),
      ]);
      if (preds.error) throw preds.error;
      if (tn.data && tn.data.name) setShopName(tn.data.name);

      // Necesitamos los datos de contacto de los clientes involucrados en accionables — no toda la base.
      const custIds = new Set();
      (preds.data || []).forEach((p) => custIds.add(p.customer_id));
      (orders_.data || []).forEach((o) => custIds.add(o.customer_id));
      const cs = custIds.size ? await supabase.from("customers").select("id,name,phone_e164").in("id", Array.from(custIds)) : { data: [] };
      if (cs.error) throw cs.error;

      const custById = {}; (cs.data || []).forEach((c) => (custById[c.id] = c));
      const prodById = {}; (prods.data || []).forEach((p) => (prodById[p.id] = p));
      const petById = {}; (pets.data || []).forEach((p) => (petById[p.id] = p));

      // Primera compra vs recompra (por cliente, orden cronológico) — solo para saber quién es "cliente fiel"
      const byCust = {};
      (orders_.data || []).forEach((o) => { (byCust[o.customer_id] = byCust[o.customer_id] || []).push(o); });

      // Accionables: recompra
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const actions = (preds.data || []).map((p) => {
        const c = custById[p.customer_id] || {};
        const prod = prodById[p.product_id] || {};
        const pet = petById[p.pet_id] || {};
        const due = new Date(p.predicted_runout_date + "T00:00:00");
        const days = Math.round((due - today) / 86400000);
        return { id: p.id, date: p.predicted_runout_date, days, customer: c.name || "Cliente", phone: c.phone_e164 || "", product: prod.name || "el alimento", pet: pet.name || "tu mascota" };
      });

      // Cross-selling: solo-alimento => ofrecer accesorios; solo-accesorios => ofrecer alimento
      const orderCust = {}; (orders_.data || []).forEach((o) => (orderCust[o.id] = o.customer_id));
      const mix = {}; // customer_id -> {food, acc}
      (ois.data || []).forEach((it) => {
        const cid = orderCust[it.order_id]; if (!cid) return;
        const pr = prodById[it.product_id]; if (!pr) return;
        if (!mix[cid]) mix[cid] = { food: 0, acc: 0 };
        if (pr.is_consumable) mix[cid].food += 1; else mix[cid].acc += 1;
      });
      const petByCust = {}; (pets.data || []).forEach((p) => { if (!petByCust[p.customer_id]) petByCust[p.customer_id] = p; });
      // Umbral mínimo de items comprados para entrar en cross-selling: filtra compradores ocasionales
      // (una sola compra chica) que no vale la pena perseguir y agrandan la lista sin sentido.
      const CROSS_SELL_MIN_ITEMS = 3;
      const crossSell = [];
      Object.entries(mix).forEach(([cid, m]) => {
        const totalItems = m.food + m.acc;
        if (totalItems < CROSS_SELL_MIN_ITEMS) return;
        if (m.food > 0 && m.acc === 0) crossSell.push({ id: cid, dir: "acc", customer: (custById[cid] || {}).name || "Cliente", phone: (custById[cid] || {}).phone_e164 || "", pet: (petByCust[cid] || {}).name || "tu mascota", loyal: (byCust[cid] || []).length > 1, items: totalItems });
        else if (m.acc > 0 && m.food === 0) crossSell.push({ id: cid, dir: "food", customer: (custById[cid] || {}).name || "Cliente", phone: (custById[cid] || {}).phone_e164 || "", pet: (petByCust[cid] || {}).name || "tu mascota", loyal: (byCust[cid] || []).length > 1, items: totalItems });
      });
      crossSell.sort((a, b) => (b.loyal ? 1 : 0) - (a.loyal ? 1 : 0) || b.items - a.items);

      setData({ actions, crossSell });
    } catch (e) { setError(e.message || "Error al cargar"); }
  }
  useEffect(() => { load(); }, []);

  async function contacted(a) {
    const cta = `Hola ${a.customer.split(" ")[0]}! 🐾 Te escribimos de ${shopName}. Según nuestras cuentas, ${a.product} de ${a.pet} está por terminarse en estos días. ¿Querés que te preparemos otra bolsa así no te quedás sin? Respondé este mensaje y te lo dejamos listo 😊`;
    window.open("https://wa.me/" + waPhone(a.phone) + "?text=" + encodeURIComponent(cta), "_blank");
    await supabase.from("repurchase_predictions").update({ status: "contacted" }).eq("id", a.id);
    setData((d) => ({ ...d, actions: d.actions.filter((x) => x.id !== a.id) }));
  }

  function crossCTA(x) {
    const first = x.customer.split(" ")[0];
    const cta = x.dir === "acc"
      ? `Hola ${first}! 🐾 Te escribimos de ${shopName}. Vemos que siempre llevás el alimento de ${x.pet} con nosotros 💚 ¿Sabías que también tenemos juguetes, correas, camitas y todo para mimarlo? Contanos qué le gustaría y te armamos algo lindo.`
      : `Hola ${first}! 🐾 Te escribimos de ${shopName}. ¿Sabías que también trabajamos el alimento de ${x.pet}? Si nos contás qué come, te avisamos antes de que se le termine así nunca te quedás sin 😊`;
    window.open("https://wa.me/" + waPhone(x.phone) + "?text=" + encodeURIComponent(cta), "_blank");
    setData((d) => ({ ...d, crossSell: d.crossSell.filter((y) => y.id !== x.id) }));
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px 50px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 16px" }}>Reko de <span style={{ color: GREEN_DK }}>{shopName}</span></h1>
      {error && <p style={{ color: "#b04b3f" }}>{error}</p>}
      {!data && !error && <p style={{ color: MUTED }}>Cargando…</p>}

      {data && (
        <>
          {/* Accionables primero y únicos: es lo que genera plata. Métricas y gráficos viven en /datos. */}
          <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 16, padding: 16, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: SLATE }}>🔥 Recompras para impulsar</span>
              <span style={{ fontSize: 12.5, color: MUTED }}>{data.actions.length} pendientes</span>
            </div>
            {!data.actions.length && <p style={{ fontSize: 13.5, color: MUTED, margin: 0 }}>Nada por ahora. A medida que cargues ventas de alimento, acá van a aparecer los clientes a contactar antes de que se les termine.</p>}
            {data.actions.map((a) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${LINE}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: SLATE }}>{a.customer}</div>
                  <div style={{ fontSize: 12.5, color: MUTED }}>{a.product} · {a.pet}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: a.days <= 0 ? "#b04b3f" : GREEN_DK }}>
                    {a.days < 0 ? `se le acabó hace ${-a.days} d` : a.days === 0 ? "se le acaba hoy" : `se le acaba en ${a.days} d`}
                  </div>
                </div>
                {hasValidPhone(a.phone) ? (
                  <button onClick={() => contacted(a)} style={{ width: "auto", padding: "10px 14px", fontSize: 13.5, fontWeight: 700, color: "#fff", background: "#25D366", border: "none", borderRadius: 10, cursor: "pointer", whiteSpace: "nowrap" }}>
                    WhatsApp →
                  </button>
                ) : (
                  <span style={{ width: "auto", padding: "10px 14px", fontSize: 12.5, fontWeight: 700, color: "#b04b3f", background: "#fbe9e6", borderRadius: 10, whiteSpace: "nowrap" }}>
                    Sin número registrado
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Cross-selling */}
          <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 16, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: SLATE }}>🧲 Cross-selling</span>
              <span style={{ fontSize: 12.5, color: MUTED }}>{data.crossSell.length} oportunidades</span>
            </div>
            {!data.crossSell.length && <p style={{ fontSize: 13.5, color: MUTED, margin: 0 }}>Sin oportunidades por ahora. Acá aparecen clientes con al menos 3 compras que solo llevan alimento (para ofrecerles accesorios) o solo accesorios (para sumarlos al alimento).</p>}
            {data.crossSell.map((x) => (
              <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${LINE}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: SLATE }}>{x.customer}{x.loyal && <span style={{ fontSize: 11, fontWeight: 700, color: GREEN_DK, background: "#fdf3e0", borderRadius: 6, padding: "2px 7px", marginLeft: 7 }}>cliente fiel</span>}</div>
                  <div style={{ fontSize: 12.5, color: MUTED }}>{x.dir === "acc" ? "Solo compra alimento" : "Solo compra accesorios"} · {x.items} ítems{x.dir === "acc" ? " → ofrecer accesorios" : " → ofrecer alimento"}</div>
                </div>
                {hasValidPhone(x.phone) ? (
                  <button onClick={() => crossCTA(x)} style={{ width: "auto", padding: "10px 14px", fontSize: 13.5, fontWeight: 700, color: "#fff", background: "#25D366", border: "none", borderRadius: 10, cursor: "pointer", whiteSpace: "nowrap" }}>
                    WhatsApp →
                  </button>
                ) : (
                  <span style={{ width: "auto", padding: "10px 14px", fontSize: 12.5, fontWeight: 700, color: "#b04b3f", background: "#fbe9e6", borderRadius: 10, whiteSpace: "nowrap" }}>
                    Sin número registrado
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function Page() {
  return <Protected><Dashboard /></Protected>;
}
