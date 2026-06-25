"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const GREEN = "#FFB63C";

export default function Protected({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [support, setSupport] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace("/login"); return; }
      setReady(true);
      const { data: ctx } = await supabase.rpc("support_context");
      if (ctx && ctx.impersonating) setSupport(ctx);
    });
  }, [router]);

  async function exitSupport() {
    await supabase.rpc("support_exit");
    window.location.href = "/operador";
  }

  if (!ready) return <div style={{ padding: 40, color: "#7c8278" }}>Cargando…</div>;

  const tabs = [
    { href: "/", label: "Inicio" },
    { href: "/cargar", label: "Cargar" },
    { href: "/clientes", label: "Clientes" },
    { href: "/importar", label: "Importar" },
  ];

  return (
    <div style={{ minHeight: "100vh" }}>
      {support && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap", padding: "9px 16px", background: "#1c2530", color: "#fff", fontSize: 13.5, fontWeight: 600 }}>
          <span>🛟 Modo soporte — estás viendo <b>{support.tenant_name}</b></span>
          <button onClick={exitSupport} style={{ padding: "5px 12px", fontSize: 13, fontWeight: 700, color: "#1c2530", background: "#FFB63C", border: "none", borderRadius: 8, cursor: "pointer" }}>Salir del modo soporte</button>
        </div>
      )}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#fff", borderBottom: "1px solid #e7e4dd" }}>
        <div style={{ fontWeight: 900, fontSize: 16, letterSpacing: "0.1em", color: "#1c2530" }}>REKO</div>
        <nav style={{ display: "flex", gap: 6 }}>
          {tabs.map((t) => (
            <a key={t.href} href={t.href} style={{ fontSize: 14, fontWeight: 600, padding: "6px 12px", borderRadius: 9, background: pathname === t.href ? GREEN : "transparent", color: "#1c2530" }}>{t.label}</a>
          ))}
          <button onClick={async () => { await supabase.auth.signOut(); router.replace("/login"); }} style={{ fontSize: 14, fontWeight: 600, padding: "6px 12px", borderRadius: 9, border: "1px solid #e7e4dd", background: "#fff", cursor: "pointer" }}>Salir</button>
        </nav>
      </header>
      <main>{children}</main>
      <footer style={{ textAlign: "center", padding: "22px 0", fontSize: 11, color: "#b3b8ac", letterSpacing: "0.04em" }}>
        Created by <a href="https://disruptivebrand.io" target="_blank" rel="noreferrer" style={{ fontWeight: 700, color: "#7c8278" }}>Disruptive®</a>
      </footer>
    </div>
  );
}
