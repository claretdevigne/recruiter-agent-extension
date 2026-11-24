// ============================================================================
// BADGES DE ESTADO EN GOOGLE (X-RAY) Y PERFILES DE LINKEDIN (/in/)
// ============================================================================

let indicePorSlug = null;
let debounceTimer = null;

function extraerSlug(raw = "") {
  const m = String(raw).match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (m && m[1]) return decodeURIComponent(m[1]).toLowerCase().replace(/\/+$/, "");
  return "";
}

function formatearTextoBadge(matches) {
  if (!Array.isArray(matches) || matches.length === 0) return null;

  const mejor = [...matches].sort((a, b) => (b.match ?? -1) - (a.match ?? -1))[0];
  const pctTexto = typeof mejor.match === "number" ? `${mejor.match}% Match` : "Sin evaluar";
  const extraRoles = matches.length > 1 ? ` (+${matches.length - 1})` : "";

  return {
    texto: `Guardado · ${pctTexto} · ${mejor.role}${extraRoles}`,
    tieneMatch: typeof mejor.match === "number",
    esAlto: typeof mejor.match === "number" && mejor.match >= 75
  };
}

function crearElementoBadge(info, compacto = false) {
  const span = document.createElement("span");
  span.className = "ext-db-match-badge";
  span.textContent = info.texto;

  const bg = info.esAlto ? "#137333" : info.tieneMatch ? "#1a73e8" : "#5f6368";

  span.style.cssText = `
    display: inline-flex !important;
    align-items: center !important;
    transform: none !important;
    direction: ltr !important;
    unicode-bidi: normal !important;
    margin: ${compacto ? "4px 0 2px 0" : "0"} !important;
    padding: ${compacto ? "2px 8px" : "6px 12px"} !important;
    border-radius: 6px !important;
    font-size: ${compacto ? "11.5px" : "12.5px"} !important;
    font-weight: 600 !important;
    line-height: 1.3 !important;
    letter-spacing: normal !important;
    font-family: system-ui, -apple-system, sans-serif !important;
    background: ${bg} !important;
    color: #ffffff !important;
    border: none !important;
    box-shadow: 0 1px 3px rgba(0,0,0,0.25) !important;
    vertical-align: middle !important;
  `;
  return span;
}

function pintarBadgesEnGoogle() {
  if (!indicePorSlug) return;
  if (!location.hostname.includes("google.")) return;

  const enlaces = document.querySelectorAll('a[href*="linkedin.com/in/"]');
  enlaces.forEach((a) => {
    const h3 = a.querySelector("h3");
    if (!h3) return; // Solo actuar sobre el enlace principal del título del resultado

    const slug = extraerSlug(a.href);
    if (!slug || !indicePorSlug[slug]) return;

    const contenedor = a.closest("div.MjjYud, div.g, div[data-hveid]") || a.parentElement;
    if (!contenedor || contenedor.querySelector(".ext-db-match-badge")) return;

    const info = formatearTextoBadge(indicePorSlug[slug]);
    if (!info) return;

    const wrapper = document.createElement("div");
    wrapper.style.cssText = "display: block !important; transform: none !important; margin: 2px 0 4px 0 !important;";
    wrapper.appendChild(crearElementoBadge(info, true));

    // Insertar justo después del bloque del enlace/título para evitar el scaleY(-1) de Google
    const bloqueTitulo = a.closest("div.yuRUbf") || a;
    bloqueTitulo.insertAdjacentElement("afterend", wrapper);
  });
}

function pintarBadgeEnPerfilLinkedIn() {
  if (!indicePorSlug) return;
  if (!location.hostname.includes("linkedin.com")) return;

  const existente = document.getElementById("ext-linkedin-profile-db-badge");
  if (!location.pathname.includes("/in/")) {
    if (existente) existente.remove();
    return;
  }

  const slug = extraerSlug(location.href);
  if (!slug || !indicePorSlug[slug]) {
    if (existente) existente.remove();
    return;
  }

  const info = formatearTextoBadge(indicePorSlug[slug]);
  if (!info) return;

  if (existente) {
    if (existente.textContent !== info.texto) {
      existente.textContent = info.texto;
    }
    return;
  }

  const pill = crearElementoBadge(info, false);
  pill.id = "ext-linkedin-profile-db-badge";
  pill.style.position = "fixed";
  pill.style.bottom = "20px";
  pill.style.left = "20px";
  pill.style.zIndex = "2147483646";
  document.body.appendChild(pill);
}

function programarActualizacionBadges() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    pintarBadgesEnGoogle();
    pintarBadgeEnPerfilLinkedIn();
  }, 400);
}

async function iniciarBadgesDb() {
  try {
    const resp = await chrome.runtime.sendMessage({ action: "GET_DB_INDEX", force: false });
    if (resp?.ok && resp.bySlug) {
      indicePorSlug = resp.bySlug;
      pintarBadgesEnGoogle();
      pintarBadgeEnPerfilLinkedIn();
    }
  } catch {
    // Ignorar errores transitorios
  }
}

iniciarBadgesDb();

new MutationObserver(() => {
  programarActualizacionBadges();
}).observe(document.body, { childList: true, subtree: true });