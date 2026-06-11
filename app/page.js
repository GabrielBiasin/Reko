"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Protected from "@/lib/Protected";

const GREEN = "#0f9b76";

function Dashboard() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [clientes, due] = await Promise.all([
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase.from("repurchase_predictions").select("id", { count: "exact", head: true }).lte("predicted_runout_date", today).eq("status", "pending"),
      ]);
      setStats({ clientes: clientes.count ?? 0, due: due.count ?? 0 });
    })();
  }, []);
  const Card = ({ label, value }) => (
    <div style={{ flex: 1, background: "#fff", border: "1px solid #e7e4dd", borderRadius: 16, padding: 18 }}>
      <div style={{ fontSize: 13, color: "#7c8278", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color: GREEN }}>{value}</div>
    </div>
  );
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 16px" }}>Hola 👋</h1>
      {!stats ? <p style={{ color: "#7c8278" }}>Cargando métricas…</p> : (
        <div style={{ display: "flex", gap: 12 }}>
          <Card label="Clientes" value={stats.clientes} />
          <Card label="Recompras para contactar" value={stats.due} />
        </div>
      )}
      <p style={{ fontSize: 13, color: "#9aa097", marginTop: 18 }}>Cargá una venta para ver cómo se agenda la próxima recompra.</p>
    </div>
  );
}

export default function Page() {
  return <Protected><Dashboard /></Protected>;
}
