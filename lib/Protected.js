"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const GREEN = "#0f9b76";

export default function Protected({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/login");
      else setReady(true);
    });
  }, [router]);

  if (!ready) return <div style={{ padding: 40, color: "#7c8278" }}>Cargando…</div>;

  const tabs = [
    { href: "/", label: "Inicio" },
    { href: "/cargar", label: "Cargar" },
    { href: "/clientes", label: "Clientes" },
    { href: "/importar", label: "Importar" },
  ];

  return (
    <div style={{ minHeight: "100vh" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#fff", borderBottom: "1px solid #e7e4dd" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: GREEN, color: "#fff", borderRadius: 8, padding: "4px 10px", fontWeight: 700, fontSize: 14 }}>🐾 Reko</div>
        <nav style={{ display: "flex", gap: 6 }}>
          {tabs.map((t) => (
            <a key={t.href} href={t.href} style={{ fontSize: 14, fontWeight: 600, padding: "6px 12px", borderRadius: 9, background: pathname === t.href ? GREEN : "transparent", color: pathname === t.href ? "#fff" : "#1c2530" }}>{t.label}</a>
          ))}
          <button onClick={async () => { await supabase.auth.signOut(); router.replace("/login"); }} style={{ fontSize: 14, fontWeight: 600, padding: "6px 12px", borderRadius: 9, border: "1px solid #e7e4dd", background: "#fff", cursor: "pointer" }}>Salir</button>
        </nav>
      </header>
      <main>{children}</main>
      <footer style={{ textAlign: "center", padding: "22px 0", fontSize: 11, color: "#b3b8ac", letterSpacing: "0.04em" }}>
        A creation by <span style={{ fontWeight: 700, color: "#7c8278" }}>Disruptive®</span>
      </footer>
    </div>
  );
}
