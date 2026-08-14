"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Protected from "@/lib/Protected";

const GREEN = "#FFB63C";
const GREEN_DK = "#c77f00";
const SLATE = "#1c2530";
const MUTED = "#7c8278";
const LINE = "#e7e4dd";

const money = (n) => "$ " + new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Math.round(n || 0));
const CH_LABEL = { manual: "Mostrador", mercadolibre: "MercadoLibre", whatsapp: "WhatsApp", csv: "Importadas", web: "Web" };

function waPhone(p) {
  let d = (p || "").replace(/[^0-9]/g, "");
  if (d.startsWith("0")) d = d.slice(1);
  if (!d.startsWith("54")) d = "54" + d;
  return d;
}

function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [shopName, setShopName] = useState("tu tienda");

  async function load() {
    try {
      const soon = new Date(); soon.setDate(soon.getDate() + 7);
      const [os, cs, preds, prods, pets, ois, tn] = await Promise.all([
        supabase.from("orders").select("id,customer_id,channel,total,ordered_at,delivery_postal_code,delivery_barrio"),
        supabase.from("customers").select("id,name,phone_e164,postal_code,barrio"),
        supabase.from("repurchase_predictions").select("id,customer_id,pet_id,product_id,predicted_runout_date,status").eq("status", "pending").lte("predicted_runout_date", soon.toISOString().slice(0, 10)).order("predicted_runout_date"),
        supabase.from("products").select("id,name,is_consumable"),
        supabase.from("pets").select("id,customer_id,name"),
        supabase.from("order_items").select("order_id,product_id"),
        supabase.from("tenants").select("name").limit(1).maybeSingle(),
      ]);
      if (os.error) throw os.error;
      if (tn.data && tn.data.name) setShopName(tn.data.name);

      const orders = os.data || [];
      const customers = cs.data || [];
      const custById = {}; customers.forEach((c) => (custById[c.id] = c));
      const prodById = {}; (prods.data || []).forEach((p) => (prodById[p.id] = p));
      const petById = {}; (pets.data || []).forEach((p) => (petById[p.id] = p));

      // Ventas por canal
      const byChannel = {};
      orders.forEach((o) => {
        const ch = o.channel || "manual";
        if (!byChannel[ch]) byChannel[ch] = { count: 0, total: 0 };
        byChannel[ch].count += 1;
        byChannel[ch].total += Number(o.total) || 0;
      });

      // Primera compra vs recompra (por cliente, orden cronológico)
      const byCust = {};
      orders.forEach((o) => { (byCust[o.customer_id] = byCust[o.customer_id] || []).push(o); });
      let firstRevenue = 0, repRevenue = 0, repOrders = 0, custWithRep = 0;
      const custCount = Object.keys(byCust).length;
      Object.values(byCust).forEach((list) => {
        list.sort((a, b) => (a.ordered_at < b.ordered_at ? -1 : 1));
        firstRevenue += Number(list[0].total) || 0;
        if (list.length > 1) {
          custWithRep += 1;
          for (let i = 1; i < list.length; i++) { repRevenue += Number(list[i].total) || 0; repOrders += 1; }
        }
      });
      const totalRevenue = firstRevenue + repRevenue;
      const repRate = custCount ? Math.round((custWithRep / custCount) * 100) : 0;

      // Accionables
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
      const orderCust = {}; orders.forEach((o) => (orderCust[o.id] = o.customer_id));
      const mix = {}; // customer_id -> {food, acc}
      (ois.data || []).forEach((it) => {
        const cid = orderCust[it.order_id]; if (!cid) return;
        const pr = prodById[it.product_id]; if (!pr) return;
        if (!mix[cid]) mix[cid] = { food: 0, acc: 0 };
        if (pr.is_consumable) mix[cid].food += 1; else mix[cid].acc += 1;
      });
      const petByCust = {}; (pets.data || []).forEach((p) => { if (!petByCust[p.customer_id]) petByCust[p.customer_id] = p; });
      const crossSell = [];
      Object.entries(mix).forEach(([cid, m]) => {
        if (m.food > 0 && m.acc === 0) crossSell.push({ id: cid, dir: "acc", customer: (custById[cid] || {}).name || "Cliente", phone: (custById[cid] || {}).phone_e164 || "", pet: (petByCust[cid] || {}).name || "tu mascota", loyal: (byCust[cid] || []).length > 1 });
        else if (m.acc > 0 && m.food === 0) crossSell.push({ id: cid, dir: "food", customer: (custById[cid] || {}).name || "Cliente", phone: (custById[cid] || {}).phone_e164 || "", pet: (petByCust[cid] || {}).name || "tu mascota", loyal: (byCust[cid] || []).length > 1 });
      });
      crossSell.sort((a, b) => (b.loyal ? 1 : 0) - (a.loyal ? 1 : 0));

      // Zonas: agrupamos por barrio (más legible); si falta, caemos al CP; si no hay ninguno, "Sin dato".
      function zoneKeyOf(barrio, cp) {
        const b = (barrio || "").trim();
        if (b) return b;
        const c = (cp || "").trim();
        if (c) return "CP " + c;
        return "Sin dato";
      }
      const zones = {};
      customers.forEach((c) => {
        const key = zoneKeyOf(c.barrio, c.postal_code);
        if (!zones[key]) zones[key] = { customers: 0, orders: 0, total: 0 };
        zones[key].customers += 1;
      });
      orders.forEach((o) => {
        const c = custById[o.customer_id];
        const key = zoneKeyOf(o.delivery_barrio || (c && c.barrio), o.delivery_postal_code || (c && c.postal_code));
        if (!zones[key]) zones[key] = { customers: 0, orders: 0, total: 0 };
        zones[key].orders += 1;
        zones[key].total += Number(o.total) || 0;
      });
      const zoneList = Object.entries(zones).map(([cp, v]) => ({ cp, ...v })).sort((a, b) => b.customers - a.customers);

      setData({ orders: orders.length, customers: customers.length, byChannel, totalRevenue, repRevenue, repOrders, repRate, actions, crossSell, zoneList });
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

  const Stat = ({ label, value, sub, accent }) => (
    <div style={{ background: accent ? GREEN : "#fff", border: `1px solid ${accent ? GREEN : LINE}`, borderRadius: 16, padding: 16 }}>
      <div style={{ fontSize: 12.5, color: accent ? "rgba(28,37,48,.72)" : MUTED, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: SLATE, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: accent ? "rgba(28,37,48,.72)" : MUTED, marginTop: 3 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px 50px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 16px" }}>Reko de <span style={{ color: GREEN_DK }}>{shopName}</span></h1>
      {error && <p style={{ color: "#b04b3f" }}>{error}</p>}
      {!data && !error && <p style={{ color: MUTED }}>Cargando métricas…</p>}

      {data && (
        <>
          {/* Accionables primero: es lo que genera plata */}
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
                <button onClick={() => contacted(a)} style={{ width: "auto", padding: "10px 14px", fontSize: 13.5, fontWeight: 700, color: "#fff", background: "#25D366", border: "none", borderRadius: 10, cursor: "pointer", whiteSpace: "nowrap" }}>
                  WhatsApp →
                </button>
              </div>
            ))}
          </div>

          {/* Cross-selling */}
          <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 16, padding: 16, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: SLATE }}>🧲 Cross-selling</span>
              <span style={{ fontSize: 12.5, color: MUTED }}>{data.crossSell.length} oportunidades</span>
            </div>
            {!data.crossSell.length && <p style={{ fontSize: 13.5, color: MUTED, margin: 0 }}>Sin oportunidades por ahora. Acá aparecen clientes que solo compran alimento (para ofrecerles accesorios) o solo accesorios (para sumarlos al alimento).</p>}
            {data.crossSell.map((x) => (
              <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${LINE}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: SLATE }}>{x.customer}{x.loyal && <span style={{ fontSize: 11, fontWeight: 700, color: GREEN_DK, background: "#fdf3e0", borderRadius: 6, padding: "2px 7px", marginLeft: 7 }}>cliente fiel</span>}</div>
                  <div style={{ fontSize: 12.5, color: MUTED }}>{x.dir === "acc" ? "Solo compra alimento → ofrecer accesorios" : "Solo compra accesorios → ofrecer alimento"}</div>
                </div>
                <button onClick={() => crossCTA(x)} style={{ width: "auto", padding: "10px 14px", fontSize: 13.5, fontWeight: 700, color: "#fff", background: "#25D366", border: "none", borderRadius: 10, cursor: "pointer", whiteSpace: "nowrap" }}>
                  WhatsApp →
                </button>
              </div>
            ))}
          </div>

          {/* Métricas */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            <Stat label="Ingresos por recompra" value={money(data.repRevenue)} sub={`${data.repOrders} recompras · plata extra ganada`} accent />
            <Stat label="Ventas totales" value={money(data.totalRevenue)} sub={`${data.orders} ventas`} />
            <Stat label="% de clientes que recompran" value={data.repRate + "%"} sub={`de ${data.customers} clientes`} />
            <Stat label="Clientes" value={data.customers} />
          </div>

          {/* Zonas */}
          <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 16, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: SLATE, marginBottom: 10 }}>📍 Zonas (por barrio / CP)</div>
            {(!data.zoneList || !data.zoneList.length) && <p style={{ fontSize: 13.5, color: MUTED, margin: 0 }}>Cargá barrio y CP en tus clientes para ver qué zonas tenés más cubiertas.</p>}
            {(data.zoneList || []).slice(0, 10).map((z) => {
              const pct = data.customers ? Math.round((z.customers / data.customers) * 100) : 0;
              return (
                <div key={z.cp} style={{ padding: "9px 0", borderBottom: `1px solid ${LINE}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 14 }}>
                    <span style={{ fontWeight: 700, color: z.cp === "Sin dato" ? MUTED : SLATE }}>{z.cp}</span>
                    <span style={{ fontWeight: 800, color: GREEN_DK }}>{pct}%</span>
                  </div>
                  <div style={{ height: 8, background: "#f1ede3", borderRadius: 5, overflow: "hidden", margin: "5px 0 4px" }}>
                    <div style={{ width: pct + "%", height: "100%", background: GREEN }} />
                  </div>
                  <div style={{ fontSize: 12, color: MUTED }}>{z.customers} clientes · {z.orders} ventas · {money(z.total)}</div>
                </div>
              );
            })}
          </div>

          {/* Por canal */}
          <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 16, padding: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: SLATE, marginBottom: 10 }}>Ventas por canal</div>
            {!Object.keys(data.byChannel).length && <p style={{ fontSize: 13.5, color: MUTED, margin: 0 }}>Todavía no hay ventas cargadas.</p>}
            {Object.entries(data.byChannel).map(([ch, v]) => (
              <div key={ch} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "8px 0", borderBottom: `1px solid ${LINE}` }}>
                <span style={{ fontWeight: 600, color: SLATE }}>{CH_LABEL[ch] || ch}</span>
                <span style={{ color: MUTED }}>{v.count} ventas · <b style={{ color: GREEN_DK }}>{money(v.total)}</b></span>
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
