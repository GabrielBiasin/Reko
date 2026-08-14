"use client";
import React, { useState, useMemo, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import Protected from "@/lib/Protected";
import { CATALOG } from "@/lib/catalog";

const GREEN = "#FFB63C";
const GREEN_DK = "#c77f00";
const SLATE = "#1c2530";
const MUTED = "#7c8278";
const LINE = "#e7e4dd";

const CHANNEL_MAP = { mostrador: "manual", mercadolibre: "mercadolibre", whatsapp: "whatsapp" };

// Peso representativo por tamaño, para alimentar la predicción (RER) sin pedir el peso exacto.
function weightFromSize(species, size) {
  if (!size) return null;
  if (species === "cat") return size === "small" ? 3 : size === "large" ? 6 : 4.5;
  return size === "small" ? 7 : size === "large" ? 38 : 20; // perro / otro
}
function gramsPerDay(species, weight, lifeStage) {
  const w = parseFloat(weight);
  if (!w || w <= 0) return 0;
  const rer = 70 * Math.pow(w, 0.75);
  const kcal = species === "cat" ? 4000 : 3500;
  const st = lifeStage || "adult";
  let f;
  if (species === "cat") f = st === "puppy" ? 2.5 : st === "senior" ? 1.1 : 1.2;
  else f = st === "puppy" ? 2.0 : st === "senior" ? 1.3 : 1.6;
  return (f * rer / kcal) * 1000;
}
function fmtDate(d) { return d.toLocaleDateString("es-AR", { day: "numeric", month: "long" }); }

const inputStyle = { width: "100%", border: `1px solid ${LINE}`, borderRadius: 11, padding: "13px", fontSize: 16, color: SLATE, background: "#fff", outline: "none", boxSizing: "border-box" };
const Label = ({ children }) => <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: MUTED, marginBottom: 6 }}>{children}</span>;
const Seg = ({ value, current, onClick, children }) => {
  const active = value === current;
  return <button onClick={() => onClick(value)} style={{ flex: 1, padding: "11px 8px", fontSize: 14, fontWeight: 600, border: `1px solid ${active ? GREEN : LINE}`, background: active ? GREEN : "#fff", color: SLATE, borderRadius: 10, cursor: "pointer" }}>{children}</button>;
};
const Card = ({ step, title, children }) => (
  <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 16, padding: 16, marginBottom: 14 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
      <span style={{ width: 24, height: 24, borderRadius: 7, background: GREEN, color: SLATE, fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{step}</span>
      <span style={{ fontSize: 15, fontWeight: 700, color: SLATE }}>{title}</span>
    </div>
    {children}
  </div>
);
const dropStyle = { position: "absolute", left: 0, right: 0, top: "calc(100% + 4px)", background: "#fff", border: `1px solid ${LINE}`, borderRadius: 11, boxShadow: "0 8px 24px rgba(0,0,0,0.08)", zIndex: 20, overflow: "hidden" };
const optStyle = { padding: "11px 13px", fontSize: 14, color: SLATE, cursor: "pointer", borderBottom: `1px solid ${LINE}` };

function normPhone(p) { return (p || "").replace(/[^0-9+]/g, ""); }

function CargarInner() {
  // ---- Cliente ----
  const [clientQuery, setClientQuery] = useState("");
  const [clientResults, setClientResults] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [isNewClient, setIsNewClient] = useState(false);
  const [newClient, setNewClient] = useState({ nombre: "", whatsapp: "", direccion: "", cp: "", barrio: "" });
  const [clientPets, setClientPets] = useState([]);
  const [selectedPetId, setSelectedPetId] = useState(null); // id | "new" | null

  // ---- Mascota nueva ----
  const [mascota, setMascota] = useState({ nombre: "", especie: "dog", etapa: "adult", tamano: "medium", raza: "" });

  // ---- Producto ----
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null); // {name, species, type, sizes}
  const [packKg, setPackKg] = useState("");
  const [venta, setVenta] = useState({ tipo: "alimento", precio: "", origen: "mostrador" });

  const [estado, setEstado] = useState({ guardando: false, ok: false, error: "" });

  // Buscar clientes
  useEffect(() => {
    let active = true;
    const q = clientQuery.trim();
    if (selectedClient || isNewClient || q.length < 2) { setClientResults([]); return; }
    (async () => {
      const { data } = await supabase.from("customers").select("id,name,phone_e164,address_full,postal_code,barrio").or(`name.ilike.%${q}%,phone_e164.ilike.%${q}%`).limit(8);
      if (!active) return;
      const seen = {}; const out = [];
      (data || []).forEach((c) => { const k = normPhone(c.phone_e164) || "id" + c.id; if (!seen[k]) { seen[k] = 1; out.push(c); } });
      setClientResults(out.slice(0, 6));
    })();
    return () => { active = false; };
  }, [clientQuery, selectedClient, isNewClient]);

  async function pickClient(c) {
    setSelectedClient(c); setIsNewClient(false); setClientResults([]); setClientQuery("");
    const phone = normPhone(c.phone_e164);
    let ids = [c.id];
    if (phone) { const { data: rows } = await supabase.from("customers").select("id").eq("phone_e164", c.phone_e164); if (rows && rows.length) ids = rows.map((r) => r.id); }
    const { data: pets } = await supabase.from("pets").select("id,name,species,weight_kg,life_stage,size").in("customer_id", ids);
    setClientPets(pets || []);
    setSelectedPetId((pets && pets.length) ? pets[0].id : "new");
  }
  function startNewClient() { setIsNewClient(true); setSelectedClient(null); setClientResults([]); setClientPets([]); setSelectedPetId("new"); }
  function resetClient() { setSelectedClient(null); setIsNewClient(false); setClientQuery(""); setClientResults([]); setClientPets([]); setSelectedPetId(null); }

  // Buscar productos (catálogo + base)
  useEffect(() => {
    let active = true;
    const q = productQuery.trim().toLowerCase();
    if (selectedProduct && selectedProduct.name.toLowerCase() === q) { setProductResults([]); return; }
    if (q.length < 2) { setProductResults([]); return; }
    (async () => {
      const chan = CHANNEL_MAP[venta.origen] || "manual";
      const cat = await supabase.from("catalog_items").select("name,species,type,pack_kg,price").eq("channel", chan).ilike("name", `%${q}%`).limit(10);
      const fromCat = CATALOG.filter((p) => p.name.toLowerCase().includes(q));
      const { data } = await supabase.from("products").select("name,species,is_consumable,net_weight_g").ilike("name", `%${q}%`).limit(6);
      const seen = {}; const out = [];
      // 1) catálogo del canal (con precio y presentación)
      (cat.data || []).forEach((p) => {
        const k = (p.name || "").toLowerCase() + "|" + (p.pack_kg || "");
        if (!p.name || seen[k]) return; seen[k] = 1;
        out.push({ name: p.name, species: p.species || mascota.especie, type: p.type || "alimento", sizes: p.pack_kg ? [Number(p.pack_kg)] : [], price: p.price != null ? Number(p.price) : null, fromCatalog: true });
      });
      // 2) catálogo semilla (genérico)
      fromCat.forEach((p) => { const k = p.name.toLowerCase() + "|seed"; if (!seen[p.name.toLowerCase()] && !seen[k]) { seen[k] = 1; out.push({ ...p, price: null }); } });
      // 3) productos ya vendidos
      (data || []).forEach((p) => {
        const k = (p.name || "").toLowerCase() + "|prod"; if (!p.name || seen[k]) return; seen[k] = 1;
        out.push({ name: p.name, species: p.species || "dog", type: p.is_consumable ? "alimento" : "accesorio", sizes: p.net_weight_g ? [Math.round(p.net_weight_g) / 1000] : [], price: null });
      });
      if (!active) return;
      setProductResults(out.slice(0, 8));
    })();
    return () => { active = false; };
  }, [productQuery, selectedProduct, venta.origen]);

  function pickProduct(p) {
    setSelectedProduct(p); setProductQuery(p.name); setProductResults([]);
    setVenta((v) => ({ ...v, tipo: p.type, precio: p.price != null ? String(p.price) : v.precio }));
    if (p.sizes && p.sizes.length === 1) setPackKg(String(p.sizes[0]));
    else setPackKg("");
  }
  function useTypedProduct() {
    const name = productQuery.trim(); if (!name) return;
    setSelectedProduct({ name, species: mascota.especie, type: venta.tipo, sizes: [] });
    setProductResults([]); setPackKg("");
  }

  // Especie / peso / lifeStage efectivos (mascota elegida o nueva)
  const eff = useMemo(() => {
    if (selectedPetId && selectedPetId !== "new") {
      const p = clientPets.find((x) => x.id === selectedPetId);
      if (p) return { species: p.species, weight: p.weight_kg || weightFromSize(p.species, p.size), lifeStage: p.life_stage };
    }
    return { species: mascota.especie, weight: weightFromSize(mascota.especie, mascota.tamano), lifeStage: mascota.etapa };
  }, [selectedPetId, clientPets, mascota]);

  const prediccion = useMemo(() => {
    if (venta.tipo !== "alimento") return null;
    const pk = parseFloat(packKg);
    if (!eff.weight || !pk) return null;
    const g = gramsPerDay(eff.species, eff.weight, eff.lifeStage);
    if (!g) return null;
    const dias = Math.round((pk * 1000) / g);
    const d = new Date(); d.setDate(d.getDate() + dias);
    return { dias, gpd: Math.round(g), iso: d.toISOString().slice(0, 10), fecha: fmtDate(d) };
  }, [venta.tipo, packKg, eff]);

  async function findOrCreateCustomer() {
    if (selectedClient) return selectedClient.id;
    const phone = newClient.whatsapp;
    const ex = await supabase.from("customers").select("id").eq("phone_e164", phone).limit(1).maybeSingle();
    if (ex.data) return ex.data.id;
    const { data, error } = await supabase.from("customers").insert({ name: newClient.nombre, phone_e164: phone, channel_origin: CHANNEL_MAP[venta.origen], lifecycle_stage: "active", address_full: newClient.direccion.trim() || null, postal_code: newClient.cp.trim() || null, barrio: newClient.barrio.trim() || null }).select("id").single();
    if (error) throw error;
    return data.id;
  }
  async function findOrCreateProduct(custId) {
    const name = (selectedProduct ? selectedProduct.name : productQuery).trim();
    if (!name) return null;
    const isFood = venta.tipo === "alimento";
    const pk = parseFloat(packKg);
    const ex = await supabase.from("products").select("id").ilike("name", name).limit(1).maybeSingle();
    if (ex.data) return ex.data.id;
    const { data, error } = await supabase.from("products").insert({ name, species: eff.species, net_weight_g: isFood && pk ? Math.round(pk * 1000) : null, is_consumable: isFood, price: parseFloat(venta.precio) || null }).select("id").single();
    if (error) throw error;
    return data.id;
  }

  async function guardar() {
    setEstado({ guardando: true, ok: false, error: "" });
    try {
      if (!selectedClient && (!newClient.nombre || !newClient.whatsapp)) throw new Error("Elegí un cliente o completá nombre y WhatsApp.");
      const precioNum = parseFloat(venta.precio) || null;
      const custId = await findOrCreateCustomer();

      // mascota
      let petId = null;
      if (selectedPetId && selectedPetId !== "new") petId = selectedPetId;
      else if (mascota.nombre || mascota.tamano) {
        const { data: np, error: ep } = await supabase.from("pets").insert({ customer_id: custId, name: mascota.nombre || null, species: mascota.especie, breed: mascota.raza || null, size: mascota.tamano, weight_kg: weightFromSize(mascota.especie, mascota.tamano), life_stage: mascota.etapa }).select("id").single();
        if (ep) throw ep; petId = np.id;
      }

      const productId = await findOrCreateProduct(custId);

      const dAddr = selectedClient ? (selectedClient.address_full || null) : (newClient.direccion.trim() || null);
      const dCp = selectedClient ? (selectedClient.postal_code || null) : (newClient.cp.trim() || null);
      const dBarrio = selectedClient ? (selectedClient.barrio || null) : (newClient.barrio.trim() || null);
      const { data: o, error: eo } = await supabase.from("orders").insert({ customer_id: custId, channel: CHANNEL_MAP[venta.origen], total: precioNum || 0, status: "paid", delivery_address: dAddr, delivery_postal_code: dCp, delivery_barrio: dBarrio }).select("id").single();
      if (eo) throw eo;

      if (productId) {
        const pk = parseFloat(packKg);
        const { error: ei } = await supabase.from("order_items").insert({ order_id: o.id, product_id: productId, qty: 1, unit_price: precioNum, net_weight_g_snapshot: venta.tipo === "alimento" && pk ? Math.round(pk * 1000) : null });
        if (ei) throw ei;
      }
      if (prediccion && productId && petId) {
        await supabase.from("repurchase_predictions").insert({ customer_id: custId, pet_id: petId, product_id: productId, predicted_runout_date: prediccion.iso, method: "heuristic", status: "pending" });
      }

      setEstado({ guardando: false, ok: true, error: "" });
      // reset venta y producto, mantener cliente para cargas seguidas
      setProductQuery(""); setSelectedProduct(null); setPackKg(""); setVenta((v) => ({ ...v, precio: "" }));
      if (!selectedClient) resetClient();
      setMascota({ nombre: "", especie: "dog", etapa: "adult", tamano: "medium", raza: "" });
    } catch (err) {
      setEstado({ guardando: false, ok: false, error: err.message || String(err) });
    }
  }

  const showNewPetFields = isNewClient || selectedPetId === "new";

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px 60px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 12px" }}>Cargar venta</h1>

      <Card step="·" title="Canal de venta">
        <div style={{ display: "flex", gap: 8 }}>
          <Seg value="mostrador" current={venta.origen} onClick={(v) => { setVenta({ ...venta, origen: v }); setSelectedProduct(null); setProductQuery(""); setPackKg(""); }}>Mostrador</Seg>
          <Seg value="mercadolibre" current={venta.origen} onClick={(v) => { setVenta({ ...venta, origen: v }); setSelectedProduct(null); setProductQuery(""); setPackKg(""); }}>MercadoLibre</Seg>
          <Seg value="whatsapp" current={venta.origen} onClick={(v) => { setVenta({ ...venta, origen: v }); setSelectedProduct(null); setProductQuery(""); setPackKg(""); }}>WhatsApp</Seg>
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>El producto y el precio se filtran según el canal elegido.</div>
      </Card>

      {/* 1 · Cliente */}
      <Card step={1} title="Cliente">
        {!selectedClient && !isNewClient && (
          <div style={{ position: "relative" }}>
            <Label>Buscar por nombre o teléfono</Label>
            <input style={inputStyle} value={clientQuery} onChange={(e) => setClientQuery(e.target.value)} placeholder="Empezá a escribir…" />
            {clientResults.length > 0 && (
              <div style={dropStyle}>
                {clientResults.map((c) => (
                  <div key={c.id} onClick={() => pickClient(c)} style={optStyle}>
                    <span style={{ fontWeight: 600 }}>{c.name || "Sin nombre"}</span>
                    <span style={{ color: MUTED }}> · {c.phone_e164}</span>
                  </div>
                ))}
              </div>
            )}
            <button onClick={startNewClient} style={{ marginTop: 12, padding: "11px", fontSize: 14, fontWeight: 600, color: GREEN_DK, background: "#fff", border: `1px dashed ${GREEN}`, borderRadius: 10, cursor: "pointer", width: "100%" }}>+ Cliente nuevo</button>
          </div>
        )}

        {selectedClient && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fdf6e9", border: `1px solid ${LINE}`, borderRadius: 11, padding: "11px 13px" }}>
              <div><div style={{ fontWeight: 700 }}>{selectedClient.name || "Sin nombre"}</div><div style={{ fontSize: 13, color: MUTED }}>{selectedClient.phone_e164}</div>{selectedClient.address_full && <div style={{ fontSize: 12.5, color: MUTED }}>{selectedClient.address_full}{selectedClient.postal_code ? " · CP " + selectedClient.postal_code : ""}{selectedClient.barrio ? " · " + selectedClient.barrio : ""}</div>}</div>
              <button onClick={resetClient} style={{ width: "auto", margin: 0, padding: "6px 10px", fontSize: 13, color: MUTED, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 8, cursor: "pointer" }}>Cambiar</button>
            </div>
            <div style={{ marginTop: 12 }}>
              <Label>Mascota</Label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {clientPets.map((p) => (
                  <button key={p.id} onClick={() => setSelectedPetId(p.id)} style={{ width: "auto", margin: 0, padding: "8px 12px", fontSize: 14, fontWeight: 600, border: `1px solid ${selectedPetId === p.id ? GREEN : LINE}`, background: selectedPetId === p.id ? GREEN : "#fff", color: SLATE, borderRadius: 999, cursor: "pointer" }}>{p.name || (p.species === "cat" ? "Gato" : "Perro")}</button>
                ))}
                <button onClick={() => setSelectedPetId("new")} style={{ width: "auto", margin: 0, padding: "8px 12px", fontSize: 14, fontWeight: 600, border: `1px dashed ${selectedPetId === "new" ? GREEN : LINE}`, background: "#fff", color: selectedPetId === "new" ? GREEN_DK : MUTED, borderRadius: 999, cursor: "pointer" }}>+ Nueva</button>
              </div>
            </div>
          </div>
        )}

        {isNewClient && (
          <div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={resetClient} style={{ width: "auto", margin: "0 0 8px", padding: "5px 10px", fontSize: 13, color: MUTED, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 8, cursor: "pointer" }}>← Buscar existente</button>
            </div>
            <Label>Nombre y apellido</Label>
            <input style={inputStyle} value={newClient.nombre} onChange={(e) => setNewClient({ ...newClient, nombre: e.target.value })} placeholder="María González" />
            <div style={{ height: 10 }} />
            <Label>WhatsApp</Label>
            <input style={inputStyle} inputMode="tel" value={newClient.whatsapp} onChange={(e) => setNewClient({ ...newClient, whatsapp: e.target.value })} placeholder="+54 9 11 ..." />
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <div style={{ flex: 2 }}><Label>Dirección</Label><input style={inputStyle} value={newClient.direccion} onChange={(e) => setNewClient({ ...newClient, direccion: e.target.value })} placeholder="Av. Cazón 1234, Tigre" /></div>
              <div style={{ flex: 1 }}><Label>Cód. postal</Label><input style={inputStyle} value={newClient.cp} onChange={(e) => setNewClient({ ...newClient, cp: e.target.value })} placeholder="1648" /></div>
            </div>
            <div style={{ marginTop: 10 }}>
              <Label>Barrio</Label>
              <input style={inputStyle} value={newClient.barrio} onChange={(e) => setNewClient({ ...newClient, barrio: e.target.value })} placeholder="Tigre Centro" />
            </div>
          </div>
        )}
      </Card>

      {/* 2 · Mascota nueva (si corresponde) */}
      {showNewPetFields && (
        <Card step={2} title="Datos de la mascota">
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <Seg value="dog" current={mascota.especie} onClick={(v) => setMascota({ ...mascota, especie: v })}>Perro</Seg>
            <Seg value="cat" current={mascota.especie} onClick={(v) => setMascota({ ...mascota, especie: v })}>Gato</Seg>
            <Seg value="other" current={mascota.especie} onClick={(v) => setMascota({ ...mascota, especie: v })}>Otro</Seg>
          </div>
          <Label>Nombre</Label>
          <input style={inputStyle} value={mascota.nombre} onChange={(e) => setMascota({ ...mascota, nombre: e.target.value })} placeholder="Toto" />
          <div style={{ marginTop: 12 }}>
            <Label>Etapa de vida</Label>
            <div style={{ display: "flex", gap: 8 }}>
              <Seg value="puppy" current={mascota.etapa} onClick={(v) => setMascota({ ...mascota, etapa: v })}>Cachorro</Seg>
              <Seg value="adult" current={mascota.etapa} onClick={(v) => setMascota({ ...mascota, etapa: v })}>Adulto</Seg>
              <Seg value="senior" current={mascota.etapa} onClick={(v) => setMascota({ ...mascota, etapa: v })}>Senior</Seg>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <Label>Tamaño</Label>
            <div style={{ display: "flex", gap: 8 }}>
              <Seg value="small" current={mascota.tamano} onClick={(v) => setMascota({ ...mascota, tamano: v })}>Pequeño</Seg>
              <Seg value="medium" current={mascota.tamano} onClick={(v) => setMascota({ ...mascota, tamano: v })}>Mediano</Seg>
              <Seg value="large" current={mascota.tamano} onClick={(v) => setMascota({ ...mascota, tamano: v })}>Grande</Seg>
            </div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>Usamos etapa y tamaño para estimar cuándo se le acaba el alimento.</div>
          </div>
        </Card>
      )}

      {/* 3 · Producto */}
      <Card step={showNewPetFields ? 3 : 2} title="Producto">
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <Seg value="alimento" current={venta.tipo} onClick={(v) => setVenta({ ...venta, tipo: v })}>Alimento</Seg>
          <Seg value="accesorio" current={venta.tipo} onClick={(v) => setVenta({ ...venta, tipo: v })}>Accesorio</Seg>
          <Seg value="otro" current={venta.tipo} onClick={(v) => setVenta({ ...venta, tipo: v })}>Otro</Seg>
        </div>
        <div style={{ position: "relative" }}>
          <Label>Producto</Label>
          <input style={inputStyle} value={productQuery} onChange={(e) => { setProductQuery(e.target.value); setSelectedProduct(null); }} placeholder="Escribí para buscar…" />
          {productResults.length > 0 && (
            <div style={dropStyle}>
              {productResults.map((p, i) => (
                <div key={i} onClick={() => pickProduct(p)} style={optStyle}>
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  {p.sizes && p.sizes.length > 0 && <span style={{ color: MUTED, fontSize: 12.5 }}> · {p.sizes.join(" / ")} kg</span>}
                  {p.price != null && <span style={{ color: GREEN_DK, fontSize: 12.5, fontWeight: 700 }}> · $ {new Intl.NumberFormat("es-AR").format(p.price)}</span>}
                </div>
              ))}
              <div onClick={useTypedProduct} style={{ ...optStyle, borderBottom: "none", color: GREEN_DK, fontWeight: 600 }}>Usar “{productQuery}” como producto nuevo</div>
            </div>
          )}
        </div>

        {venta.tipo === "alimento" && (
          <div style={{ marginTop: 12 }}>
            <Label>Tamaño del paquete</Label>
            {selectedProduct && selectedProduct.sizes && selectedProduct.sizes.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {selectedProduct.sizes.map((s) => (
                  <button key={s} onClick={() => setPackKg(String(s))} style={{ width: "auto", margin: 0, padding: "10px 14px", fontSize: 14, fontWeight: 700, border: `1px solid ${String(s) === packKg ? GREEN : LINE}`, background: String(s) === packKg ? GREEN : "#fff", color: SLATE, borderRadius: 10, cursor: "pointer" }}>{s} kg</button>
                ))}
              </div>
            ) : (
              <input style={inputStyle} inputMode="decimal" value={packKg} onChange={(e) => setPackKg(e.target.value)} placeholder="15" />
            )}
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <Label>Precio</Label>
          <input style={inputStyle} inputMode="decimal" value={venta.precio} onChange={(e) => setVenta({ ...venta, precio: e.target.value })} placeholder="28000" />
        </div>
      </Card>

      {prediccion && (
        <div style={{ background: GREEN, color: SLATE, borderRadius: 16, padding: "16px 18px", marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, opacity: 0.9, fontWeight: 600 }}>Próxima recompra estimada</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>en ~{prediccion.dias} días · {prediccion.fecha}</div>
          <div style={{ fontSize: 12.5, opacity: 0.92, marginTop: 5 }}>Consume ~{prediccion.gpd} g/día. Reko avisará unos días antes.</div>
        </div>
      )}

      <button onClick={guardar} disabled={estado.guardando} style={{ width: "100%", padding: 15, fontSize: 16, fontWeight: 700, color: SLATE, background: estado.guardando ? "#c2c8bd" : GREEN, border: "none", borderRadius: 12, cursor: estado.guardando ? "default" : "pointer" }}>
        {estado.guardando ? "Guardando…" : "Guardar venta"}
      </button>
      {estado.ok && <p style={{ color: GREEN_DK, fontWeight: 600, textAlign: "center", marginTop: 10 }}>✓ Guardado{prediccion ? ". Recompra agendada para " + prediccion.fecha : ""}.</p>}
      {estado.error && <p style={{ color: "#b04b3f", textAlign: "center", marginTop: 10 }}>{estado.error}</p>}
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
