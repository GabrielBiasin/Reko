"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Protected from "@/lib/Protected";

const GREEN = "#0f9b76";
const SLATE = "#1c2530";
const MUTED = "#7c8278";
const LINE = "#e7e4dd";
const API = "https://oikrnlldqqliqkvqtigj.supabase.co/functions/v1/admin";
const APIKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const fmtDate = (s) => (s ? new Date(s).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");
const inputStyle = { width: "100%", border: `1px solid ${LINE}`, borderRadius: 10, padding: 11, fontSize: 15, color: SLATE, background: "#fff", outline: "none", boxSizing: "border-box" };
const btn = (bg, color, border) => ({ padding: "10px 14px", fontSize: 13.5, fontWeight: 700, color, background: bg, border: border || "none", borderRadius: 10, cursor: "pointer" });

function OperadorInner() {
  const [data, setData] = useState(null);
  const [denied, setDenied] = useState("");
  const [draft, setDraft] = useState({});

  async function api(action, extra) {
    const { data: s } = await supabase.auth.getSession();
    const token = s.session ? s.session.access_token : "";
    try {
      const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json", apikey: APIKEY, Authorization: "Bearer " + token }, body: JSON.stringify({ action, ...(extra || {}) }) });
      const txt = await res.text();
      try { return JSON.parse(txt); } catch (e) { return { error: "Error " + res.status + ": " + txt.slice(0, 120) }; }
    } catch (e) { return { error: "No pude conectar: " + e.message }; }
  }

  async function load() {
    const r = await api("list");
    if (r.error) { setDenied(r.error); return; }
    const d = {};
    (r.tenants || []).forEach((t) => { d[t.id] = { name: t.name || "", brand_color: t.brand_color || "#0f9b76", accent_emoji: t.accent_emoji || "", plan: t.plan || "", status: t.status || "active" }; });
    setDraft(d);
    setData(r);
  }
  useEffect(() => { load(); }, []);

  async function saveTenant(id) {
    const r = await api("update_tenant", { id, patch: draft[id] });
    if (r.error) alert(r.error); else load();
  }
  async function newTenant() {
    const name = prompt("Nombre del nuevo cliente / shop:");
    if (!name) return;
    const r = await api("create_tenant", { name });
    if (r.error) alert(r.error); else load();
  }
  async function ban(u) {
    const r = await api("ban_user", { user_id: u.id, ban: !u.banned });
    if (r.error) alert(r.error); else load();
  }
  async function del(u) {
    if (!confirm("¿Eliminar a " + u.email + " de forma permanente? Pierde el acceso y se borra su registro.")) return;
    const r = await api("delete_user", { user_id: u.id });
    if (r.error) alert(r.error); else load();
  }
  async function assign(uid, tid) {
    const r = await api("assign_user", { user_id: uid, tenant_id: tid });
    if (r.error) alert(r.error);
  }

  const userCount = (tid) => (data && data.pub ? data.pub.filter((u) => u.tenant_id === tid).length : 0);
  const setD = (id, k, v) => setDraft((d) => ({ ...d, [id]: { ...d[id], [k]: v } }));

  if (denied) return (
    <div style={{ maxWidth: 460, margin: "40px auto", padding: "0 16px" }}>
      <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: 20 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 800 }}>Sin acceso</h2>
        <p style={{ fontSize: 14, color: MUTED, margin: 0 }}>{denied}</p>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "20px 16px 50px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>Panel de operador</h1>
      <p style={{ fontSize: 13, color: MUTED, margin: "0 0 18px" }}>Administración de la plataforma Reko — solo admins.</p>
      {!data && <p style={{ color: MUTED }}>Cargando…</p>}

      {data && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Clientes (shops)</h2>
            <button onClick={newTenant} style={btn(GREEN, "#fff")}>+ Nuevo cliente</button>
          </div>
          {data.tenants.map((t) => {
            const d = draft[t.id] || {};
            return (
              <div key={t.id} style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: 16, marginBottom: 12 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 2 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 5 }}>Nombre</label>
                    <input style={inputStyle} value={d.name} onChange={(e) => setD(t.id, "name", e.target.value)} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 5 }}>Color</label>
                    <input type="color" style={{ ...inputStyle, height: 44, padding: 4 }} value={d.brand_color} onChange={(e) => setD(t.id, "brand_color", e.target.value)} />
                  </div>
                  <div style={{ width: 70 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 5 }}>Emoji</label>
                    <input style={inputStyle} maxLength={4} value={d.accent_emoji} onChange={(e) => setD(t.id, "accent_emoji", e.target.value)} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 5 }}>Plan</label>
                    <input style={inputStyle} value={d.plan} onChange={(e) => setD(t.id, "plan", e.target.value)} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 5 }}>Estado</label>
                    <select style={inputStyle} value={d.status} onChange={(e) => setD(t.id, "status", e.target.value)}>
                      <option value="active">Activo</option>
                      <option value="suspended">Suspendido</option>
                    </select>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>{userCount(t.id)} usuarios · {(data.custCounts && data.custCounts[t.id]) || 0} clientes finales · creado {fmtDate(t.created_at)}</div>
                <button onClick={() => saveTenant(t.id)} style={{ ...btn(GREEN, "#fff"), width: "100%", marginTop: 10, padding: 12 }}>Guardar cambios</button>
              </div>
            );
          })}

          <h2 style={{ fontSize: 16, fontWeight: 800, margin: "22px 0 10px" }}>Usuarios registrados</h2>
          {data.users.map((u) => {
            const pu = (data.pub || []).find((x) => x.id === u.id);
            return (
              <div key={u.id} style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: 16, marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  {u.email}
                  {u.banned && <span style={{ fontSize: 11, fontWeight: 700, color: "#b04b3f", background: "#f7e7e4", borderRadius: 6, padding: "2px 7px", marginLeft: 7 }}>acceso revocado</span>}
                </div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>alta {fmtDate(u.created_at)} · último ingreso {fmtDate(u.last_sign_in_at)}{pu ? " · rol " + pu.role : ""}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 5 }}>Cliente / shop</label>
                    <select style={inputStyle} defaultValue={pu ? pu.tenant_id : ""} onChange={(e) => assign(u.id, e.target.value)}>
                      {data.tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <button onClick={() => ban(u)} style={btn("#fff", SLATE, `1px solid ${LINE}`)}>{u.banned ? "Restaurar" : "Revocar"}</button>
                  <button onClick={() => del(u)} style={btn("#fff", "#b04b3f", "1px solid #e0b4ad")}>Eliminar</button>
                </div>
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
      <OperadorInner />
    </Protected>
  );
}
