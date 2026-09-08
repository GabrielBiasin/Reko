"use client";
import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis } from "recharts";
import { supabase } from "@/lib/supabaseClient";
import Protected from "@/lib/Protected";
import { barrioFromCP, canonicalizeBarrios } from "@/lib/cpBarrios";

const GREEN = "#FFB63C";
const GREEN_DK = "#c77f00";
const SLATE = "#1c2530";
const MUTED = "#7c8278";
const LINE = "#e7e4dd";
const PIE_COLORS = ["#FFB63C", "#1c2530", "#c77f00", "#7c8278", "#e0b4ad", "#a8b5a0", "#d9cfa8"];

const money = (n) => "$ " + new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Math.round(n || 0));
const CH_LABEL = { manual: "Mostrador", mercadolibre: "MercadoLibre", whatsapp: "WhatsApp", csv: "Importadas", web: "Web" };
const SPECIES_LABEL = { dog: "Perro", cat: "Gato", other: "Otro" };

function zoneKeyOf(barrio, cp) {
  const b = (barrio || "").trim();
  if (b) return b;
  const derived = barrioFromCP(cp);
  if (derived) return derived;
  return "Sin dato";
}

function fmtDay(d) { return d.toISOString().slice(0, 10); }
function fmtDayLabel(iso) { const [y, m, dd] = iso.split("-"); return dd + "/" + m; }
function weekKey(d) {
  const dt = new Date(d);
  const day = (dt.getDay() + 6) % 7; // lunes=0
  dt.setDate(dt.getDate() - day);
  return fmtDay(dt);
}
function monthKey(iso) { return iso.slice(0, 7); }

const box = { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 16, padding: 16, marginBottom: 16 };
const selectInput = { border: `1px solid ${LINE}`, borderRadius: 10, padding: "9px 10px", fontSize: 13.5, color: SLATE, background: "#fff", outline: "none" };

function Datos() {
  const [raw, setRaw] = useState(null);
  const [error, setError] = useState("");

  // Filtros
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [barrio, setBarrio] = useState("");
  const [producto, setProducto] = useState("");
  const [especie, setEspecie] = useState("");
  const [canal, setCanal] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [os, ois, prods, cs, pets] = await Promise.all([
          supabase.from("orders").select("id,customer_id,channel,total,status,ordered_at,delivery_postal_code,delivery_barrio"),
          supabase.from("order_items").select("id,order_id,product_id,qty,unit_price"),
          supabase.from("products").select("id,name,species,is_consumable,category"),
          supabase.from("customers").select("id,name,postal_code,barrio"),
          supabase.from("pets").select("id,customer_id,name"),
        ]);
        if (os.error) throw os.error;
        if (ois.error) throw ois.error;
        setRaw({ orders: os.data || [], items: ois.data || [], products: prods.data || [], customers: cs.data || [], pets: pets.data || [] });
      } catch (e) { setError(e.message || "Error al cargar"); }
    })();
  }, []);

  // Tabla de hechos "aplanada": un renglón por item vendido, con toda la data ya cruzada.
  // Esto es lo que se filtra y se agrega para armar KPIs, gráficos y la tabla de resultados —
  // el mismo patrón que ya usa la sección Clientes (todo client-side, sobre datos ya traídos).
  const facts = useMemo(() => {
    if (!raw) return [];
    const custById = {}; raw.customers.forEach((c) => (custById[c.id] = c));
    const prodById = {}; raw.products.forEach((p) => (prodById[p.id] = p));
    const petByCust = {}; raw.pets.forEach((p) => { if (!petByCust[p.customer_id]) petByCust[p.customer_id] = p; });
    const orderById = {}; raw.orders.forEach((o) => (orderById[o.id] = o));

    const list = raw.items.map((it) => {
      const o = orderById[it.order_id];
      if (!o) return null;
      const c = custById[o.customer_id] || {};
      const p = prodById[it.product_id] || {};
      const pet = petByCust[o.customer_id];
      return {
        orderId: o.id,
        customerId: o.customer_id,
        customerName: c.name || "Cliente",
        date: (o.ordered_at || "").slice(0, 10),
        channel: o.channel || "manual",
        rawBarrio: zoneKeyOf(o.delivery_barrio || c.barrio, o.delivery_postal_code || c.postal_code),
        productName: p.name || "Producto",
        species: p.species || "",
        isConsumable: !!p.is_consumable,
        petName: pet ? pet.name : "",
        qty: Number(it.qty) || 1,
        revenue: (Number(it.unit_price) || 0) * (Number(it.qty) || 1),
      };
    }).filter(Boolean);

    // Unifica "Almagro" / "ALMAGRO" / etc. en una sola forma antes de exponer el dato:
    // así el filtro, los gráficos y la tabla usan siempre la misma versión de cada barrio.
    const resolveBarrio = canonicalizeBarrios(list.map((f) => f.rawBarrio));
    return list.map((f) => ({ ...f, barrio: resolveBarrio(f.rawBarrio) }));
  }, [raw]);

  // Opciones de los filtros: siempre calculadas sobre el dataset COMPLETO (sin filtrar),
  // para que las opciones disponibles no se reduzcan a medida que el usuario filtra.
  const options = useMemo(() => {
    const barrios = new Set(), productos = new Set(), especies = new Set(), canales = new Set();
    facts.forEach((f) => {
      if (f.barrio) barrios.add(f.barrio);
      if (f.productName) productos.add(f.productName);
      if (f.species) especies.add(f.species);
      canales.add(f.channel);
    });
    return {
      barrios: Array.from(barrios).sort((a, b) => a.localeCompare(b, "es")),
      productos: Array.from(productos).sort((a, b) => a.localeCompare(b, "es")),
      especies: Array.from(especies),
      canales: Array.from(canales),
    };
  }, [facts]);

  const filtered = useMemo(() => {
    return facts.filter((f) => {
      if (dateFrom && f.date < dateFrom) return false;
      if (dateTo && f.date > dateTo) return false;
      if (barrio && f.barrio !== barrio) return false;
      if (producto && f.productName !== producto) return false;
      if (especie && f.species !== especie) return false;
      if (canal && f.channel !== canal) return false;
      if (q) {
        const term = q.trim().toLowerCase();
        const hay = (f.customerName + " " + f.productName + " " + f.petName).toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [facts, dateFrom, dateTo, barrio, producto, especie, canal, q]);

  // KPIs + series para gráficos, todo recalculado en vivo sobre lo filtrado.
  const stats = useMemo(() => {
    const orderIds = new Set(), custIds = new Set();
    let revenue = 0;
    const byDay = {}, byBarrio = {}, byProducto = {}, byProductoQty = {}, byCanal = {}, byEspecie = {};
    filtered.forEach((f) => {
      orderIds.add(f.orderId); custIds.add(f.customerId);
      revenue += f.revenue;
      byDay[f.date] = (byDay[f.date] || 0) + f.revenue;
      byBarrio[f.barrio] = (byBarrio[f.barrio] || 0) + f.revenue;
      byProducto[f.productName] = (byProducto[f.productName] || 0) + f.revenue;
      byProductoQty[f.productName] = (byProductoQty[f.productName] || 0) + f.qty;
      byCanal[f.channel] = (byCanal[f.channel] || 0) + f.revenue;
      const esp = f.species ? (SPECIES_LABEL[f.species] || f.species) : "Sin especie";
      byEspecie[esp] = (byEspecie[esp] || 0) + f.revenue;
    });

    // Bucketing de la serie temporal: por día si el rango es corto, por semana o mes si es largo.
    const days = Object.keys(byDay).sort();
    let bucketed = {};
    let granularity = "día";
    if (days.length <= 45) {
      bucketed = byDay;
    } else {
      granularity = days.length <= 180 ? "semana" : "mes";
      Object.entries(byDay).forEach(([d, v]) => {
        const k = granularity === "semana" ? weekKey(d) : monthKey(d);
        bucketed[k] = (bucketed[k] || 0) + v;
      });
    }
    const series = Object.entries(bucketed).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => ({ label: granularity === "día" ? fmtDayLabel(k) : k, revenue: Math.round(v) }));

    const topBarrios = Object.entries(byBarrio).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, v]) => ({ name, revenue: Math.round(v) }));
    const topProductos = Object.entries(byProducto).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, v]) => ({ name: name.length > 24 ? name.slice(0, 24) + "…" : name, revenue: Math.round(v) }));
    const canalData = Object.entries(byCanal).sort((a, b) => b[1] - a[1]).map(([ch, v]) => ({ name: CH_LABEL[ch] || ch, value: Math.round(v) }));
    const especieData = Object.entries(byEspecie).sort((a, b) => b[1] - a[1]).map(([name, v]) => ({ name, value: Math.round(v) }));

    // Facturación vs. cantidad por producto: no tenemos el costo de cada producto cargado en
    // la base, así que no podemos calcular ganancia/margen real — esto es el mejor proxy
    // disponible: qué productos facturan mucho con relativamente poco volumen (buen ticket
    // por unidad) vs. cuáles necesitan mucho volumen para facturar lo mismo.
    const productStats = Object.keys(byProducto).map((name) => {
      const rev = byProducto[name];
      const qty = byProductoQty[name] || 0;
      return { name, revenue: Math.round(rev), qty, perUnit: qty ? rev / qty : 0 };
    });
    const productScatter = productStats.map((p) => ({ ...p, shortName: p.name.length > 40 ? p.name.slice(0, 40) + "…" : p.name }));
    const productTable = [...productStats].sort((a, b) => b.perUnit - a.perUnit);

    return {
      revenue, orders: orderIds.size, customers: custIds.size,
      avgTicket: orderIds.size ? revenue / orderIds.size : 0,
      series, topBarrios, topProductos, canalData, especieData, granularity,
      productScatter, productTable,
    };
  }, [filtered]);

  const hasFilters = dateFrom || dateTo || barrio || producto || especie || canal || q;
  function clearFilters() { setDateFrom(""); setDateTo(""); setBarrio(""); setProducto(""); setEspecie(""); setCanal(""); setQ(""); }

  // Atajos de rango: fijan Desde/Hasta a partir de hoy. Se recalculan en cada render
  // para que "hoy" siempre sea el día real, no un valor guardado.
  function setPresetRange(days) {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    setDateFrom(fmtDay(from));
    setDateTo(fmtDay(to));
  }
  const todayStr = fmtDay(new Date());
  const from30Str = fmtDay(new Date(Date.now() - 30 * 86400000));
  const from60Str = fmtDay(new Date(Date.now() - 60 * 86400000));
  const isMonthActive = dateFrom === from30Str && dateTo === todayStr;
  const is60Active = dateFrom === from60Str && dateTo === todayStr;
  const presetBtnStyle = (active) => ({
    padding: "9px 14px", fontSize: 12.5, fontWeight: 700, borderRadius: 999,
    border: active ? "none" : `1px solid ${LINE}`,
    background: active ? GREEN : "#fff", color: active ? SLATE : MUTED, cursor: "pointer",
  });

  const Stat = ({ label, value, sub }) => (
    <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 16, padding: 16 }}>
      <div style={{ fontSize: 12.5, color: MUTED, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: SLATE, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>{sub}</div>}
    </div>
  );

  const ChartCard = ({ title, empty, children }) => (
    <div style={box}>
      <div style={{ fontSize: 14.5, fontWeight: 800, color: SLATE, marginBottom: 12 }}>{title}</div>
      {empty ? <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Sin datos para este filtro.</p> : children}
    </div>
  );

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "20px 16px 50px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>Datos</h1>
      <p style={{ fontSize: 13, color: MUTED, margin: "0 0 18px" }}>Explorá tus ventas con filtros y gráficos. Los accionables del día a día (recompra, cross-selling) viven en Inicio.</p>
      {error && <p style={{ color: "#b04b3f" }}>{error}</p>}
      {!raw && !error && <p style={{ color: MUTED }}>Cargando…</p>}

      {raw && (
        <>
          {/* Filtros */}
          <div style={box}>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente, producto o mascota…" style={{ ...selectInput, flex: 1 }} />
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <button onClick={() => setPresetRange(30)} style={presetBtnStyle(isMonthActive)}>Último mes</button>
              <button onClick={() => setPresetRange(60)} style={presetBtnStyle(is60Active)}>Últimos 60 días</button>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <label style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>Desde</label>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={selectInput} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <label style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>Hasta</label>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={selectInput} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: "1 1 150px" }}>
                <label style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>Barrio</label>
                <select value={barrio} onChange={(e) => setBarrio(e.target.value)} style={selectInput}>
                  <option value="">Todos</option>
                  {options.barrios.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: "1 1 180px" }}>
                <label style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>Producto</label>
                <select value={producto} onChange={(e) => setProducto(e.target.value)} style={selectInput}>
                  <option value="">Todos</option>
                  {options.productos.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: "1 1 120px" }}>
                <label style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>Mascota</label>
                <select value={especie} onChange={(e) => setEspecie(e.target.value)} style={selectInput}>
                  <option value="">Todas</option>
                  {options.especies.map((e) => <option key={e} value={e}>{SPECIES_LABEL[e] || e}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: "1 1 140px" }}>
                <label style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>Canal</label>
                <select value={canal} onChange={(e) => setCanal(e.target.value)} style={selectInput}>
                  <option value="">Todos</option>
                  {options.canales.map((c) => <option key={c} value={c}>{CH_LABEL[c] || c}</option>)}
                </select>
              </div>
            </div>
            {hasFilters && (
              <p style={{ fontSize: 12.5, color: MUTED, margin: "10px 0 0" }}>
                {filtered.length} de {facts.length} ítems vendidos coinciden{" "}
                <span onClick={clearFilters} style={{ color: GREEN_DK, fontWeight: 700, cursor: "pointer" }}>Limpiar filtros</span>
              </p>
            )}
          </div>

          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            <Stat label="Facturación" value={money(stats.revenue)} sub={`${stats.orders} ventas`} />
            <Stat label="Ticket promedio" value={money(stats.avgTicket)} />
            <Stat label="Clientes en el filtro" value={stats.customers} />
            <Stat label="Ítems vendidos" value={filtered.length} />
          </div>

          {/* Evolución en el tiempo */}
          <ChartCard title={`Facturación por ${stats.granularity}`} empty={!stats.series.length}>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={stats.series} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={LINE} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: MUTED }} />
                <YAxis tick={{ fontSize: 11, fill: MUTED }} tickFormatter={(v) => (v >= 1000 ? Math.round(v / 1000) + "k" : v)} />
                <Tooltip formatter={(v) => money(v)} contentStyle={{ fontSize: 12.5, borderRadius: 10, border: `1px solid ${LINE}` }} />
                <Line type="monotone" dataKey="revenue" stroke={GREEN_DK} strokeWidth={2.5} dot={{ r: 2.5 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Top barrios */}
          <ChartCard title="Top 10 barrios por facturación" empty={!stats.topBarrios.length}>
            <ResponsiveContainer width="100%" height={Math.max(200, stats.topBarrios.length * 34)}>
              <BarChart data={stats.topBarrios} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={LINE} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: MUTED }} tickFormatter={(v) => (v >= 1000 ? Math.round(v / 1000) + "k" : v)} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11.5, fill: SLATE }} />
                <Tooltip formatter={(v) => money(v)} contentStyle={{ fontSize: 12.5, borderRadius: 10, border: `1px solid ${LINE}` }} />
                <Bar dataKey="revenue" fill={GREEN} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Top productos */}
          <ChartCard title="Top 10 productos por facturación" empty={!stats.topProductos.length}>
            <ResponsiveContainer width="100%" height={Math.max(200, stats.topProductos.length * 34)}>
              <BarChart data={stats.topProductos} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={LINE} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: MUTED }} tickFormatter={(v) => (v >= 1000 ? Math.round(v / 1000) + "k" : v)} />
                <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: SLATE }} />
                <Tooltip formatter={(v) => money(v)} contentStyle={{ fontSize: 12.5, borderRadius: 10, border: `1px solid ${LINE}` }} />
                <Bar dataKey="revenue" fill={GREEN_DK} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Facturación vs. cantidad por producto: qué conviene más por volumen/ticket */}
          <div style={box}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: SLATE, marginBottom: 4 }}>Facturación vs. cantidad por producto</div>
            <p style={{ fontSize: 12, color: MUTED, margin: "0 0 12px" }}>No tenemos cargado el costo de cada producto, así que esto no es ganancia real — pero te muestra qué productos facturan mucho vendiendo pocas unidades (buen ticket, arriba a la izquierda) vs. cuáles necesitan mucho volumen (abajo a la derecha).</p>
            {!stats.productScatter.length ? <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Sin datos para este filtro.</p> : (
              <ResponsiveContainer width="100%" height={280}>
                <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={LINE} />
                  <XAxis type="number" dataKey="qty" name="Cantidad" tick={{ fontSize: 11, fill: MUTED }} label={{ value: "Cantidad vendida", position: "insideBottom", offset: -5, fontSize: 11, fill: MUTED }} />
                  <YAxis type="number" dataKey="revenue" name="Facturación" tick={{ fontSize: 11, fill: MUTED }} tickFormatter={(v) => (v >= 1000 ? Math.round(v / 1000) + "k" : v)} />
                  <ZAxis range={[60, 60]} />
                  <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(v, n) => (n === "Facturación" ? money(v) : v)} labelFormatter={() => ""} content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const p = payload[0].payload;
                    return (
                      <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 10, padding: "8px 10px", fontSize: 12, maxWidth: 220 }}>
                        <div style={{ fontWeight: 700, color: SLATE, marginBottom: 4 }}>{p.name}</div>
                        <div style={{ color: MUTED }}>Cantidad: {p.qty}</div>
                        <div style={{ color: MUTED }}>Facturación: {money(p.revenue)}</div>
                        <div style={{ color: GREEN_DK, fontWeight: 700 }}>Por unidad: {money(p.perUnit)}</div>
                      </div>
                    );
                  }} />
                  <Scatter data={stats.productScatter} fill={GREEN_DK} />
                </ScatterChart>
              </ResponsiveContainer>
            )}
            {!!stats.productTable.length && (
              <div style={{ overflowX: "auto", marginTop: 14 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: MUTED, borderBottom: `1px solid ${LINE}` }}>
                      <th style={{ padding: "6px 8px" }}>Producto</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Cantidad</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Facturación</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Por unidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.productTable.slice(0, 20).map((p, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${LINE}` }}>
                        <td style={{ padding: "6px 8px", color: SLATE }}>{p.name}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", color: MUTED }}>{p.qty}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", color: MUTED }}>{money(p.revenue)}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: GREEN_DK }}>{money(p.perUnit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {stats.productTable.length > 20 && <p style={{ fontSize: 11.5, color: MUTED, margin: "8px 0 0" }}>Mostrando los 20 con mejor facturación por unidad, de {stats.productTable.length} productos.</p>}
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Por canal */}
            <ChartCard title="Por canal" empty={!stats.canalData.length}>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={stats.canalData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={(d) => d.name}>
                    {stats.canalData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => money(v)} contentStyle={{ fontSize: 12.5, borderRadius: 10, border: `1px solid ${LINE}` }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Por especie */}
            <ChartCard title="Por mascota" empty={!stats.especieData.length}>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={stats.especieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={(d) => d.name}>
                    {stats.especieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => money(v)} contentStyle={{ fontSize: 12.5, borderRadius: 10, border: `1px solid ${LINE}` }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Tabla de resultados */}
          <div style={box}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: SLATE, marginBottom: 10 }}>Detalle ({filtered.length} ítems{filtered.length > 300 ? ", mostrando los 300 más recientes" : ""})</div>
            {!filtered.length && <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Nada coincide con este filtro.</p>}
            {!!filtered.length && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: MUTED, borderBottom: `1px solid ${LINE}` }}>
                      <th style={{ padding: "6px 8px" }}>Fecha</th>
                      <th style={{ padding: "6px 8px" }}>Cliente</th>
                      <th style={{ padding: "6px 8px" }}>Producto</th>
                      <th style={{ padding: "6px 8px" }}>Canal</th>
                      <th style={{ padding: "6px 8px" }}>Barrio</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...filtered].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 300).map((f, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${LINE}` }}>
                        <td style={{ padding: "6px 8px", color: MUTED, whiteSpace: "nowrap" }}>{f.date}</td>
                        <td style={{ padding: "6px 8px", color: SLATE, fontWeight: 600 }}>{f.customerName}</td>
                        <td style={{ padding: "6px 8px", color: SLATE }}>{f.productName}</td>
                        <td style={{ padding: "6px 8px", color: MUTED }}>{CH_LABEL[f.channel] || f.channel}</td>
                        <td style={{ padding: "6px 8px", color: MUTED }}>{f.barrio}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: GREEN_DK }}>{money(f.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function Page() {
  return <Protected><Datos /></Protected>;
}
