"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const GREEN = "#FFB63C";

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [shop, setShop] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setMsg("");
    if (mode === "signup" && !shop.trim()) { setLoading(false); return setMsg("Poné el nombre de tu tienda."); }
    const fn =
      mode === "login"
        ? supabase.auth.signInWithPassword({ email, password: pass })
        : supabase.auth.signUp({ email, password: pass, options: { data: { shop_name: shop.trim() } } });
    const { error } = await fn;
    setLoading(false);
    if (error) return setMsg(error.message);
    if (mode === "signup") return setMsg("Cuenta creada para “" + shop.trim() + "”. Ya podés iniciar sesión.");
    router.push("/");
  };

  const input = {
    width: "100%", padding: "13px", fontSize: 16, borderRadius: 11,
    border: "1px solid #e7e4dd", marginBottom: 12, outline: "none",
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 380, background: "#fff", border: "1px solid #e7e4dd", borderRadius: 18, padding: 24 }}>
        <div style={{ fontWeight: 900, fontSize: 19, letterSpacing: "0.1em", color: "#1c2530", marginBottom: 18 }}>REKO</div>
        <h1 style={{ fontSize: 21, fontWeight: 800, margin: "0 0 18px" }}>
          {mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
        </h1>
        {mode === "signup" && (
          <input style={input} placeholder="Nombre de tu tienda (ej: La Casa del Mascotero)" value={shop} onChange={(e) => setShop(e.target.value)} />
        )}
        <input style={input} placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input style={input} placeholder="Contraseña" type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
        <button onClick={submit} disabled={loading} style={{ width: "100%", padding: 14, fontSize: 16, fontWeight: 700, color: "#1c2530", background: GREEN, border: "none", borderRadius: 12, cursor: "pointer" }}>
          {loading ? "..." : mode === "login" ? "Entrar" : "Registrarme"}
        </button>
        {msg && <p style={{ fontSize: 13, color: "#b04b3f", marginTop: 12 }}>{msg}</p>}
        <p style={{ fontSize: 13, color: "#7c8278", marginTop: 16, textAlign: "center", cursor: "pointer" }}
           onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMsg(""); }}>
          {mode === "login" ? "No tengo cuenta — crear una" : "Ya tengo cuenta — iniciar sesión"}
        </p>
        <p style={{ fontSize: 11, color: "#b3b8ac", marginTop: 14, textAlign: "center" }}>
          Created by <a href="https://disruptivebrand.io" target="_blank" rel="noreferrer" style={{ fontWeight: 700, color: "#7c8278" }}>Disruptive®</a>
        </p>
      </div>
    </div>
  );
}
