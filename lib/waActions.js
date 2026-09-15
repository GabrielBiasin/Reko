// Helpers de contacto por WhatsApp compartidos entre Inicio y Datos, para no duplicar
// la misma lógica (y el mismo bug) en dos archivos.
import { supabase } from "@/lib/supabaseClient";

const GREEN_DK = "#c77f00";
const MUTED = "#7c8278";
const LINE = "#e7e4dd";

export function waPhone(p) {
  let d = (p || "").replace(/[^0-9]/g, "");
  if (d.startsWith("0")) d = d.slice(1);
  if (!d.startsWith("54")) d = "54" + d;
  return d;
}

// Valida que haya un número real para contactar (no vacío, no "Sin datos", con suficientes dígitos).
export function hasValidPhone(p) {
  if (!p) return false;
  const digits = p.replace(/[^0-9]/g, "");
  return digits.length >= 10;
}

// Reemplaza el botón de WhatsApp cuando no hay teléfono cargado: en vez de solo avisar "Sin número",
// deja completarlo ahí mismo sin salir de la pantalla. Recibe todo por props (nada de estado propio)
// para que no se recree en cada render de la pantalla que lo usa — si tuviera estado propio definido
// dentro del componente padre, el input perdería el foco en cada tecla escrita.
export function PhoneAction({ rowKey, customerId, phone, onSend, editingPhone, phoneDraft, setPhoneDraft, savingPhone, onStartEdit, onCancelEdit, onSave }) {
  if (hasValidPhone(phone)) {
    return (
      <button onClick={onSend} style={{ width: "auto", padding: "10px 14px", fontSize: 13.5, fontWeight: 700, color: "#fff", background: "#25D366", border: "none", borderRadius: 10, cursor: "pointer", whiteSpace: "nowrap" }}>
        WhatsApp →
      </button>
    );
  }
  if (editingPhone === rowKey) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          autoFocus
          type="tel"
          inputMode="tel"
          value={phoneDraft}
          onChange={(e) => setPhoneDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onSave(rowKey, customerId); if (e.key === "Escape") onCancelEdit(); }}
          placeholder="+54 9 11 ..."
          style={{ width: 120, padding: "9px 8px", fontSize: 13, border: `1px solid ${LINE}`, borderRadius: 8, outline: "none" }}
        />
        <button onClick={() => onSave(rowKey, customerId)} disabled={savingPhone || !phoneDraft.trim()} style={{ width: "auto", padding: "9px 10px", fontSize: 13, fontWeight: 700, color: "#fff", background: savingPhone || !phoneDraft.trim() ? "#c2c8bd" : GREEN_DK, border: "none", borderRadius: 8, cursor: savingPhone ? "default" : "pointer" }}>
          {savingPhone ? "…" : "✓"}
        </button>
        <button onClick={onCancelEdit} style={{ width: "auto", padding: "9px 10px", fontSize: 13, fontWeight: 700, color: MUTED, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 8, cursor: "pointer" }}>
          ✕
        </button>
      </div>
    );
  }
  return (
    <button onClick={() => onStartEdit(rowKey)} style={{ width: "auto", padding: "10px 14px", fontSize: 12.5, fontWeight: 700, color: "#b04b3f", background: "#fbe9e6", border: "none", borderRadius: 10, cursor: "pointer", whiteSpace: "nowrap" }}>
      Sin número · Agregar
    </button>
  );
}

// Texto relativo tipo CRM ("hace 3 días") para mostrar el último contacto registrado.
export function timeAgo(iso) {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days} d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} m`;
  return `hace ${Math.floor(months / 12)} a`;
}

// Registra en el historial de contacto (contact_log) cada vez que se contacta a un cliente —
// desde Inicio (recompra, cross-selling) o desde el filtrado de Datos — así queda un único
// historial sin importar desde qué pantalla se hizo el contacto. Nunca bloquea el flujo de
// WhatsApp si el registro falla (ya se abrió el chat, no tiene sentido frenar al operador).
// Devuelve el id de la fila insertada (o null si falló) para poder deshacerla con unlogContact
// si el operador marcó a alguien por error.
export async function logContact(customerId, note) {
  try {
    const { data, error } = await supabase.from("contact_log").insert({ customer_id: customerId, channel: "whatsapp", note: note || null }).select("id").single();
    if (error) return null;
    return data.id;
  } catch (e) {
    return null;
  }
}

// Deshace un registro de contacto hecho por error (borra esa fila puntual de contact_log).
export async function unlogContact(logId) {
  try {
    await supabase.from("contact_log").delete().eq("id", logId);
    return true;
  } catch (e) {
    return false;
  }
}
