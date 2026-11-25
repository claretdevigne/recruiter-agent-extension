// ============================================================================
// MÓDULO DE EXTRACCIÓN DE PERFIL DE LINKEDIN (SCROLL REAL + SUBPÁGINAS)
// ============================================================================

const FOOTER_WORDS = /^(Accesibilidad|Accessibility|Talent Solutions|LinkedIn Corporation)$/i;
const SKIP_SECTIONS = /^(Actividad|Activity|Intereses|Interests|Proyectos|Projects|Idiomas|Languages|Recomendaciones|Recommendations|Logros|Honors|Personas que también vieron|People also viewed|Más perfiles para ti|More profiles for you|Destacado|Featured|Servicios|Services|Publicaciones|Posts)$/i;

function identificarSeccion(linea) {
  const limpia = linea.replace(/\s*\(\d+\)\s*$/, "").trim();
  if (/^(Acerca de|About)$/i.test(limpia)) return "ACERCA DE";
  if (/^(Experiencia|Experience)$/i.test(limpia)) return "EXPERIENCIA";
  if (/^(Educación|Education)$/i.test(limpia)) return "EDUCACIÓN";
  if (/^(Licencias y certificaciones|Licenses & certifications)$/i.test(limpia)) return "LICENCIAS Y CERTIFICACIONES";
  if (/^(Aptitudes|Skills)$/i.test(limpia)) return "APTITUDES";
  return null;
}

function expandirBotonesVerMas() {
  document.querySelectorAll("section, main, div").forEach((el) => {
    if (el.tagName === "BUTTON") {
      if (/^[….]+\s*(ver más|más|see more|more)$/i.test(el.innerText.trim())) {
        el.click();
      }
    }
  });
}

async function forzarCargaDOM() {
  const candidatos = [
    document.scrollingElement,
    document.documentElement,
    document.body,
    document.querySelector("main"),
    ...Array.from(document.querySelectorAll("div")).filter((d) => {
      const style = getComputedStyle(d);
      return (
        (style.overflowY === "auto" || style.overflowY === "scroll") &&
        d.scrollHeight > d.clientHeight + 200
      );
    })
  ].filter(Boolean);

  const scroller = candidatos.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
  if (!scroller) return;

  const posOriginal = scroller.scrollTop;
  const maxScroll = Math.max(scroller.scrollHeight, 3500);

  for (let y = 500; y <= maxScroll; y += 700) {
    scroller.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 150));
  }

  scroller.scrollTo(0, posOriginal);
  await new Promise((r) => setTimeout(r, 300));
}

async function obtenerDatosPerfil(onStatusUpdate = () => {}) {
  const profileUrl = location.href.split("?")[0].replace(/\/$/, "");

  onStatusUpdate("⏳ Cargando secciones...");
  await forzarCargaDOM();

  onStatusUpdate("⏳ Expandiendo textos...");
  expandirBotonesVerMas();
  await new Promise((r) => setTimeout(r, 350));

  const linkExp = document.querySelector('a[href*="/details/experience"]');
  const btnExp = Array.from(document.querySelectorAll("button, a")).find((el) =>
    /^(Mostrar todas las experiencias|Mostrar las \d+ experiencias|Show all \d+ experiences)/i.test(
      el.innerText.trim()
    )
  );

  let experienciaCompleta = null;
  if (linkExp || btnExp) {
    const urlExp = linkExp?.href || `${profileUrl}/details/experience/`;
    onStatusUpdate("⏳ Leyendo experiencia completa en 2º plano...");
    const resp = await chrome.runtime.sendMessage({
      action: "FETCH_SUBPAGE_TEXT",
      url: urlExp
    });
    if (resp?.ok && resp.texto) {
      experienciaCompleta = resp.texto;
    }
  }

  const raw = document.body.innerText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const idxMsg = raw.findIndex((l) =>
    /^(Enviar mensaje|Message|Conectar|Connect|Seguir|Follow)$/i.test(l)
  );
  let start = idxMsg > 3 ? idxMsg - 5 : 0;
  while (
    start < idxMsg &&
    /^(Inicio|Mi red|Empleos|Mensajes|Notificaciones|Yo|Para negocios|Prueba Premium|0 notificaciones|Recruiter)$/i.test(
      raw[start]
    )
  ) {
    start++;
  }

  const lines = raw.slice(start);

  const headerLines = [];
  const secciones = {
    "ACERCA DE": [],
    "EXPERIENCIA": [],
    "EDUCACIÓN": [],
    "LICENCIAS Y CERTIFICACIONES": [],
    "APTITUDES": []
  };

  let cur = "HEADER";
  const seenHeader = new Set();
  const seenSecs = new Set();

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (FOOTER_WORDS.test(l)) break;

    const sec = identificarSeccion(l);
    if (sec) {
      if (sec === "ACERCA DE" && FOOTER_WORDS.test(lines[i + 1] || "")) break;
      if (seenSecs.has(sec)) break;

      seenSecs.add(sec);
      cur = sec;

      if (cur === "EXPERIENCIA" && experienciaCompleta) {
        secciones["EXPERIENCIA"] = experienciaCompleta.split("\n");
        cur = "SKIP";
      }
      continue;
    }

    if (cur !== "HEADER" && SKIP_SECTIONS.test(l)) {
      cur = "SKIP";
      continue;
    }
    if (cur === "SKIP") continue;

    if (cur === "HEADER") {
      if (
        /^(Recruiter|Ver en Recruiter|Enviar mensaje|Message|Conectar|Connect|Seguir|Follow|Más|More|Información de contacto|Contact info|Destacado|Featured)$/i.test(
          l
        ) ||
        /^[-•·]\s*\d/.test(l) ||
        seenHeader.has(l)
      ) {
        continue;
      }
      if (headerLines.length < 3) {
        headerLines.push(l);
        seenHeader.add(l);
      }
    } else if (secciones[cur]) {
      if (
        !/^(Mostrar todas|Mostrar las|Mostrar todo|Show all|Mostrar credencial|Show credential|[….]+\s*(ver más|más|see more|more))/i.test(
          l
        )
      ) {
        secciones[cur].push(l);
      }
    }
  }

  const datos = {
    url: `${profileUrl}/`,
    nombre: headerLines[0] || "",
    titular: headerLines[1] || "",
    ubicacion: headerLines[2] || "",
    secciones
  };

  const bloquesTexto = [
    "=== ENCABEZADO ===",
    `URL: ${datos.url}`,
    datos.nombre,
    datos.titular,
    datos.ubicacion
  ].filter(Boolean);

  for (const [titulo, contenido] of Object.entries(secciones)) {
    if (contenido.length > 0) {
      bloquesTexto.push(`\n--- ${titulo} ---`);
      bloquesTexto.push(contenido.join("\n"));
    }
  }

  datos.textoCompleto = bloquesTexto.join("\n");
  return datos;
}

// ============================================================================
// HUD ESTILO VIDEOJUEGO PARA MATCHES > 80%
// ============================================================================
function reproducirSonidoLevelUp() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notas = [523.25, 659.25, 783.99, 1046.5]; // Do5 - Mi5 - Sol5 - Do6
    notas.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);
      gain.gain.setValueAtTime(0.12, ctx.currentTime + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.08);
      osc.stop(ctx.currentTime + idx * 0.08 + 0.3);
    });
  } catch (e) {
    // Ignorar si el navegador bloquea audio sin interacción previa
  }
}

async function mostrarHudMatchVideojuego(porcentaje, duracionMs = 2300) {
  const prev = document.getElementById("game-match-hud");
  if (prev) prev.remove();

  const esLegendario = porcentaje >= 90;
  const colorPrincipal = esLegendario ? "#ffd700" : "#00ff88";
  const colorSecundario = esLegendario ? "#ff8c00" : "#00d4ff";
  const rangoTexto = esLegendario ? "★ S-RANK CANDIDATE ★" : "⚡ HIGH MATCH DETECTED ⚡";

  if (!document.getElementById("game-match-hud-styles")) {
    const style = document.createElement("style");
    style.id = "game-match-hud-styles";
    style.textContent = `
      @keyframes hudPopIn {
        0% { opacity: 0; transform: translate(-50%, -50%) scale(0.55); }
        70% { opacity: 1; transform: translate(-50%, -50%) scale(1.06); }
        100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      }
      @keyframes hudPulseGlow {
        0%, 100% { box-shadow: 0 0 28px rgba(0,255,136,0.55), inset 0 0 18px rgba(0,255,136,0.25); }
        50% { box-shadow: 0 0 48px rgba(0,212,255,0.85), inset 0 0 26px rgba(0,212,255,0.35); }
      }
    `;
    document.head.appendChild(style);
  }

  const hud = document.createElement("div");
  hud.id = "game-match-hud";
  Object.assign(hud.style, {
    position: "fixed",
    top: "42%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    zIndex: "2147483647",
    background: "linear-gradient(145deg, rgba(13,17,23,0.96), rgba(22,27,34,0.96))",
    border: `3px solid ${colorPrincipal}`,
    borderRadius: "20px",
    padding: "26px 44px",
    textAlign: "center",
    fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
    color: "#ffffff",
    minWidth: "320px",
    backdropFilter: "blur(8px)",
    animation: "hudPopIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards, hudPulseGlow 1.4s infinite"
  });

  hud.innerHTML = `
    <div style="font-size:13px; font-weight:800; letter-spacing:2.5px; color:${colorSecundario}; text-transform:uppercase; margin-bottom:6px;">
      ${rangoTexto}
    </div>
    <div id="hud-score-num" style="font-size:78px; font-weight:900; line-height:1; color:${colorPrincipal}; text-shadow: 0 0 22px ${colorPrincipal}88; margin:4px 0;">
      0%
    </div>
    <div style="font-size:14px; font-weight:700; letter-spacing:1.5px; color:#c9d1d9; margin-bottom:14px;">
      CV MATCH SCORE
    </div>
    <div style="width:100%; height:12px; background:#21262d; border-radius:999px; overflow:hidden; border:1px solid #30363d;">
      <div id="hud-score-bar" style="width:0%; height:100%; background:linear-gradient(90deg, ${colorSecundario}, ${colorPrincipal}); transition: width 0.55s ease-out;"></div>
    </div>
  `;

  document.body.appendChild(hud);
  reproducirSonidoLevelUp();

  // Animación rápida del contador y la barra
  const scoreEl = document.getElementById("hud-score-num");
  const barEl = document.getElementById("hud-score-bar");
  requestAnimationFrame(() => {
    if (barEl) barEl.style.width = `${Math.min(100, Math.max(0, porcentaje))}%`;
  });

  const pasos = 18;
  for (let i = 1; i <= pasos; i++) {
    const val = Math.round((porcentaje * i) / pasos);
    if (scoreEl) scoreEl.textContent = `${val}%`;
    await new Promise((r) => setTimeout(r, 25));
  }
  if (scoreEl) scoreEl.textContent = `${porcentaje}%`;

  await new Promise((r) => setTimeout(r, duracionMs));
  hud.style.transition = "opacity 0.3s ease, transform 0.3s ease";
  hud.style.opacity = "0";
  hud.style.transform = "translate(-50%, -55%) scale(0.92)";
  setTimeout(() => hud.remove(), 320);
}

// ============================================================================
// INTERFAZ VISUAL: AUTOMÁTICO, COPIAR MANUAL Y CONSULTAR MATCH MANUAL
// ============================================================================

function copiarAlPortapapeles(texto) {
  try {
    const ta = document.createElement("textarea");
    ta.value = texto;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch (e) {
    return false;
  }
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function conectarConNotaCorta(mensajeCorto, nombreCompleto, modoPrueba, actualizarEstado) {
  if (!mensajeCorto) {
    actualizarEstado("⚠️ Sin Mensaje Corto en AGENTE_DB", "#856404");
    await esperar(2500);
    return false;
  }

  const primerNombre = (nombreCompleto || "").split(" ")[0] || "";
  const textoNota = mensajeCorto.replace(/\{nombre\}/gi, primerNombre).slice(0, 300);

  const simularClicCompleto = (el) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    const opts = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX,
      clientY
    };
    el.focus?.();
    el.dispatchEvent(new PointerEvent("pointerdown", opts));
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new PointerEvent("pointerup", opts));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.click();
  };

  actualizarEstado("⏳ Buscando botón Conectar...", "#0a66c2");

  const topCard = document.querySelector("main section") || document.querySelector("main") || document;

  const esNodoConectar = (el) => {
    if (!el) return false;
    if (el.closest("#modal-manual-connect") || el.closest("#modal-manual-match")) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    const txt = (el.innerText || "").replace(/\s+/g, " ").trim();
    const aria = (el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
    const href = el.getAttribute("href") || "";

    return (
      href.includes("custom-invite") ||
      /^(Conectar|Connect)$/i.test(txt) ||
      /^(Invitar a .+ a conectar|Invite .+ to connect)$/i.test(aria)
    );
  };

  const buscarEnTodoElDOM = (predicate) => {
    const revisarRaiz = (root) => {
      const nodos = Array.from(
        root.querySelectorAll(
          "a, button, div[role='button'], div[role='menuitem'], li, span, p, textarea"
        )
      );
      const hallado = nodos.find(predicate);
      if (hallado) return hallado;
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) {
          const enShadow = revisarRaiz(el.shadowRoot);
          if (enShadow) return enShadow;
        }
      }
      return null;
    };
    return revisarRaiz(document);
  };

  let btnConectar = Array.from(topCard.querySelectorAll("button, a")).find(esNodoConectar);

  if (!btnConectar) {
    actualizarEstado("⏳ Revisando menú de los 3 puntos...", "#0a66c2");

    const candidatosTresPuntos = Array.from(topCard.querySelectorAll("button"));
    const btnMas =
      candidatosTresPuntos.find((b) => {
        const txt = (b.innerText || "").trim();
        const aria = (b.getAttribute("aria-label") || "").trim();
        return (
          /^(Más|More)$/i.test(txt) ||
          /(más acciones|más opciones|more actions|more options)/i.test(aria)
        );
      }) ||
      candidatosTresPuntos.find((b) => {
        const txt = (b.innerText || "").replace(/\s+/g, "").trim();
        const aria = (b.getAttribute("aria-label") || "").trim();
        const rect = b.getBoundingClientRect();
        const esBotonIconoPequeno =
          rect.width > 0 && rect.width <= 60 && rect.height > 0 && rect.height <= 60;
        return (
          esBotonIconoPequeno &&
          (txt === "•••" || txt === "..." || /more|más/i.test(aria) || b.querySelector("svg"))
        );
      });

    if (btnMas) {
      simularClicCompleto(btnMas);

      // Esperar en bucle hasta 3.5s a que el menú desplegable renderice "Conectar"
      for (let i = 0; i < 7; i++) {
        await esperar(500);
        btnConectar = buscarEnTodoElDOM(esNodoConectar);
        if (btnConectar) break;
      }
    }
  }

  if (!btnConectar) {
    actualizarEstado("⚠️ No apareció Conectar (¿ya conectado?)", "#856404");
    await esperar(2500);
    return false;
  }

  actualizarEstado("⏳ Pulsando Conectar...", "#0a66c2");

  // Si es un enlace directo a custom-invite, navegar o hacer clic directo en el <a>
  const linkDirecto =
    btnConectar.closest("a[href*='custom-invite']") ||
    (btnConectar.tagName === "A" ? btnConectar : null);
  const itemInteractivo =
    linkDirecto ||
    btnConectar.closest('div[role="button"], div[role="menuitem"], button, li') ||
    btnConectar;

  simularClicCompleto(itemInteractivo);
  if (itemInteractivo !== btnConectar) {
    simularClicCompleto(btnConectar);
  }
  // Respaldo de teclado (Enter) por si el artdeco-dropdown usa manejador de teclado/accesibilidad
  itemInteractivo.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true })
  );

  let btnNota = null;
  for (let intento = 0; intento < 10; intento++) {
    await esperar(500);
    btnNota = buscarEnTodoElDOM((b) => {
      if (b.tagName === "TEXTAREA") return false;
      if (b.closest("#modal-manual-connect") || b.closest("#modal-manual-match")) return false;
      const rect = b.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      const txt = (b.innerText || "").trim();
      const aria = (b.getAttribute("aria-label") || "").trim();
      return (
        /añadir.*nota|agregar.*nota|add a note/i.test(txt) ||
        /añadir.*nota|agregar.*nota|add a note/i.test(aria)
      );
    });
    if (btnNota) break;
  }

  if (!btnNota) {
    actualizarEstado("⚠️ No salió botón 'Añadir nota'", "#856404");
    await esperar(2500);
    return false;
  }

  const objetivoClickNota = btnNota.closest('button, a, div[role="button"]') || btnNota;
  simularClicCompleto(objetivoClickNota);
  await esperar(1200);

  const textarea = buscarEnTodoElDOM(
    (el) =>
      el.tagName === "TEXTAREA" &&
      !el.closest("#modal-manual-connect") &&
      !el.closest("#modal-manual-match")
  );

  if (!textarea) {
    actualizarEstado("⚠️ No apareció campo de nota", "#856404");
    await esperar(2500);
    return false;
  }

  textarea.focus();
  textarea.select?.();
  document.execCommand("insertText", false, textoNota);
  if (!textarea.value) {
    textarea.value = textoNota;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
  }
  await esperar(1000);

  if (!modoPrueba) {
    const btnEnviar = buscarEnTodoElDOM((b) => {
      if (b.tagName === "TEXTAREA") return false;
      if (b.closest("#modal-manual-connect") || b.closest("#modal-manual-match")) return false;
      const rect = b.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      const txt = (b.innerText || "").trim();
      const aria = (b.getAttribute("aria-label") || "").trim();
      return (
        (/^(Enviar|Send|Enviar invitación|Send invitation)$/i.test(txt) ||
          /^(Enviar invitación|Send invitation)$/i.test(aria)) &&
        !b.disabled
      );
    });
    if (btnEnviar) {
      simularClicCompleto(btnEnviar.closest("button") || btnEnviar);
      actualizarEstado("✔ Invitación enviada con nota", "#057642");
      await esperar(1600);
      return true;
    }
    return false;
  } else {
    actualizarEstado("🛡️ Modo Prueba: Nota lista sin enviar", "#856404");
    await esperar(2500);
    return false;
  }
}

// ============================================================================
// AUXILIAR: ABRIR PESTAÑA DE RECRUITER DESDE EL PERFIL ACTUAL
// ============================================================================
async function abrirEnRecruiterDesdePerfil(nombreCandidato, actualizarEstado, contactoRealizado = false) {
  actualizarEstado("⏳ Buscando enlace a Recruiter...", "#057642");
  const linkRecruiter = Array.from(document.querySelectorAll("a, button")).find((el) =>
    /^(Ver en Recruiter|View in Recruiter)$/i.test((el.innerText || "").trim())
  );

  if (linkRecruiter?.href) {
    await chrome.runtime.sendMessage({
      action: "OPEN_RECRUITER_TAB",
      url: linkRecruiter.href,
      nombreCandidato,
      contactoRealizado
    });
    return true;
  } else if (linkRecruiter) {
    linkRecruiter.click();
    return true;
  }

  actualizarEstado("⚠️ No apareció botón 'Ver en Recruiter'", "#856404");
  await esperar(2500);
  return false;
}

// ============================================================================
// 1. FLUJO AUTOMÁTICO (Solo cuando se abre desde el Popup)
// ============================================================================
async function ejecutarFlujoAutomatico() {
  const btnCopiar = document.getElementById("btn-modular-extractor");
  const actualizarEstado = (txt, color = "#0a66c2") => {
    if (btnCopiar) {
      btnCopiar.textContent = txt;
      btnCopiar.style.background = color;
    }
  };

  try {
    const perfil = await obtenerDatosPerfil(actualizarEstado);
    copiarAlPortapapeles(perfil.textoCompleto);

    actualizarEstado("⏳ Evaluando con ChatGPT...", "#6f42c1");
    const evalResp = await chrome.runtime.sendMessage({
      action: "EVALUATE_AND_UPDATE_SHEETS",
      perfilTexto: perfil.textoCompleto
    });

    if (!evalResp?.ok) {
      throw new Error(evalResp?.error || "Error al evaluar con OpenAI");
    }

    const { candidatoActual } = await chrome.storage.local.get(["candidatoActual"]);
    if (candidatoActual) {
      candidatoActual.autoExtract = false;
      await chrome.storage.local.set({ candidatoActual });
    }

    // Mostrar HUD gigante estilo videojuego si el match supera el 80% ANTES de contactar/guardar
    if (evalResp.porcentaje > 80) {
      actualizarEstado(`🔥 ¡MATCH ${evalResp.porcentaje}%!`, "#057642");
      await mostrarHudMatchVideojuego(evalResp.porcentaje, 2300);
    }

    let contactoRealizado = false;
    if (evalResp.ejecutarConectar) {
      contactoRealizado = await conectarConNotaCorta(
        evalResp.config?.mensaje,
        perfil.nombre,
        evalResp.modoPrueba,
        actualizarEstado
      );
    }

    let abrioRecruiter = false;
    if (evalResp.ejecutarRecruiter) {
      abrioRecruiter = await abrirEnRecruiterDesdePerfil(
        perfil.nombre,
        actualizarEstado,
        contactoRealizado
      );
    } else {
      actualizarEstado(`✔ Match: ${evalResp.porcentaje}% (Guardado en Sheets)`, "#057642");
    }

    await chrome.runtime.sendMessage({
      action: "PROFILE_ACTIONS_DONE",
      abrioRecruiter,
      contactoRealizado
    });
  } catch (err) {
    console.error("Error en flujo automático:", err);
    actualizarEstado(`❌ ${err.message.slice(0, 35)}`, "#c92a2a");
  } finally {
    setTimeout(() => actualizarEstado("Copiar perfil", "#0a66c2"), 5000);
  }
}

// ============================================================================
// 2. FLUJO MANUAL 1: SOLO COPIAR PERFIL (Sin OpenAI ni Sheets)
// ============================================================================
async function ejecutarCopiaManual() {
  const btnCopiar = document.getElementById("btn-modular-extractor");
  const actualizarEstado = (txt, color = "#0a66c2") => {
    if (btnCopiar) {
      btnCopiar.textContent = txt;
      btnCopiar.style.background = color;
    }
  };

  try {
    const perfil = await obtenerDatosPerfil(actualizarEstado);
    copiarAlPortapapeles(perfil.textoCompleto);
    actualizarEstado("✔ Perfil copiado", "#057642");
  } catch (err) {
    console.error("Error copiando perfil:", err);
    actualizarEstado("❌ Error al copiar", "#c92a2a");
  } finally {
    setTimeout(() => actualizarEstado("Copiar perfil", "#0a66c2"), 3000);
  }
}

// ============================================================================
// 3. FLUJO MANUAL 2: MODAL FLOTANTE PARA CONSULTAR MATCH SIN TOCAR SHEETS
// ============================================================================
async function abrirModalConsultaMatch() {
  const otroModal = document.getElementById("modal-manual-connect");
  if (otroModal) otroModal.style.display = "none";

  let modal = document.getElementById("modal-manual-match");
  if (modal) {
    modal.style.display = modal.style.display === "none" ? "block" : "none";
    return;
  }

  modal = document.createElement("div");
  modal.id = "modal-manual-match";
  Object.assign(modal.style, {
    position: "fixed",
    bottom: "76px",
    right: "24px",
    width: "360px",
    zIndex: "999999",
    background: "#fff",
    color: "#222",
    borderRadius: "12px",
    padding: "14px",
    boxShadow: "0 8px 28px rgba(0,0,0,0.28)",
    border: "1px solid #d0d7de",
    fontFamily: "system-ui, sans-serif",
    fontSize: "13px"
  });

  modal.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <strong style="color:#6f42c1; font-size:14px;">Consultar Match (Solo lectura)</strong>
      <button id="mm-close" style="border:none; background:transparent; font-size:16px; cursor:pointer; color:#666;">✕</button>
    </div>
    <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Cargar JD desde Role (AGENTE_DB):</label>
    <select id="mm-role-select" style="width:100%; padding:6px; margin-bottom:8px; border:1px solid #ccc; border-radius:6px;">
      <option value="">Cargando roles...</option>
    </select>
    <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Job Description (JD):</label>
    <textarea id="mm-jd-text" rows="5" placeholder="Selecciona un rol arriba o pega aquí una JD..." style="width:100%; box-sizing:border-box; padding:6px; margin-bottom:8px; border:1px solid #ccc; border-radius:6px; font-size:12px; resize:vertical;"></textarea>
    <button id="mm-run-btn" style="width:100%; padding:9px; background:#6f42c1; color:#fff; border:none; border-radius:6px; font-weight:600; cursor:pointer;">Evaluar Match y Copiar Resultado</button>
    <div id="mm-status" style="font-size:12px; margin-top:8px; text-align:center; font-weight:600;"></div>
    <pre id="mm-result" style="display:none; max-height:180px; overflow-y:auto; background:#f6f8fa; padding:8px; border-radius:6px; font-size:11px; white-space:pre-wrap; margin-top:8px; border:1px solid #e1e4e8;"></pre>
  `;

  document.body.appendChild(modal);

  const selectRole = document.getElementById("mm-role-select");
  const txtJd = document.getElementById("mm-jd-text");
  const btnRun = document.getElementById("mm-run-btn");
  const divStatus = document.getElementById("mm-status");
  const preResult = document.getElementById("mm-result");

  document.getElementById("mm-close").addEventListener("click", () => {
    modal.style.display = "none";
  });

  try {
    const respRoles = await chrome.runtime.sendMessage({ action: "GET_ROLES_LIST" });
    if (respRoles?.ok && Array.isArray(respRoles.sheets)) {
      selectRole.innerHTML =
        `<option value="">-- Selecciona un rol (o escribe tu JD) --</option>` +
        respRoles.sheets.map((r) => `<option value="${r}">${r}</option>`).join("");
    } else {
      selectRole.innerHTML = `<option value="">Error: ${respRoles?.error || "Sin respuesta"}</option>`;
    }
  } catch (err) {
    selectRole.innerHTML = `<option value="">Error de conexión (recarga F5)</option>`;
  }

  selectRole.addEventListener("change", async () => {
    const role = selectRole.value;
    if (!role) return;
    txtJd.value = "Cargando JD...";
    const respCfg = await chrome.runtime.sendMessage({ action: "GET_ROLE_CONFIG", role });
    txtJd.value = respCfg?.ok && respCfg.config?.jd ? respCfg.config.jd : "";
  });

  btnRun.addEventListener("click", async () => {
    const jd = txtJd.value.trim();
    if (!jd) {
      divStatus.style.color = "#c92a2a";
      divStatus.textContent = "Escribe o selecciona una JD primero";
      return;
    }

    btnRun.disabled = true;
    preResult.style.display = "none";
    divStatus.style.color = "#0a66c2";
    divStatus.textContent = "⏳ Extrayendo perfil completo...";

    try {
      const perfil = await obtenerDatosPerfil((msg) => {
        divStatus.textContent = msg;
      });

      divStatus.textContent = "⏳ Consultando a OpenAI...";
      const evalResp = await chrome.runtime.sendMessage({
        action: "EVALUATE_MANUAL_ONLY",
        perfilTexto: perfil.textoCompleto,
        jdTexto: jd
      });

      if (!evalResp?.ok) throw new Error(evalResp?.error || "Error en OpenAI");

      copiarAlPortapapeles(evalResp.analisis);
      divStatus.style.color = "#057642";
      divStatus.textContent = "✔ Resultado copiado al portapapeles (Sheets intacto)";
      preResult.textContent = evalResp.analisis;
      preResult.style.display = "block";
    } catch (err) {
      divStatus.style.color = "#c92a2a";
      divStatus.textContent = `❌ ${err.message}`;
    } finally {
      btnRun.disabled = false;
    }
  });
}

// ============================================================================
// 4. FLUJO MANUAL 3: CONECTAR Y/O GUARDAR EN PROYECTO RECRUITER
// ============================================================================
async function abrirModalConectarProyecto() {
  const otroModal = document.getElementById("modal-manual-match");
  if (otroModal) otroModal.style.display = "none";

  let modal = document.getElementById("modal-manual-connect");
  if (modal) {
    modal.style.display = modal.style.display === "none" ? "block" : "none";
    return;
  }

  modal = document.createElement("div");
  modal.id = "modal-manual-connect";
  Object.assign(modal.style, {
    position: "fixed",
    bottom: "76px",
    right: "24px",
    width: "360px",
    zIndex: "999999",
    background: "#fff",
    color: "#222",
    borderRadius: "12px",
    padding: "14px",
    boxShadow: "0 8px 28px rgba(0,0,0,0.28)",
    border: "1px solid #d0d7de",
    fontFamily: "system-ui, sans-serif",
    fontSize: "13px"
  });

  modal.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <strong style="color:#057642; font-size:14px;">Conectar / Guardar en Proyecto</strong>
      <button id="mc-close" style="border:none; background:transparent; font-size:16px; cursor:pointer; color:#666;">✕</button>
    </div>

    <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Seleccionar Role (AGENTE_DB):</label>
    <select id="mc-role-select" style="width:100%; padding:6px; margin-bottom:8px; border:1px solid #ccc; border-radius:6px;">
      <option value="">Cargando roles...</option>
    </select>

    <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Proyecto en Recruiter:</label>
    <input type="text" id="mc-proyecto" placeholder="Nombre del proyecto en Recruiter" style="width:100%; box-sizing:border-box; padding:6px; margin-bottom:8px; border:1px solid #ccc; border-radius:6px; font-size:12px;">

    <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Mensaje Corto (Nota invitación):</label>
    <textarea id="mc-mensaje" rows="3" placeholder="Selecciona un rol o escribe el mensaje corto..." style="width:100%; box-sizing:border-box; padding:6px; margin-bottom:8px; border:1px solid #ccc; border-radius:6px; font-size:12px; resize:vertical;"></textarea>

    <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:10px; font-size:12px;">
      <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
        <input type="checkbox" id="mc-chk-connect" checked> Conectar + Nota (Mensaje Corto)
      </label>
      <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
        <input type="checkbox" id="mc-chk-recruiter" checked> Abrir Recruiter y guardar en proyecto
      </label>
      <label style="display:flex; align-items:center; gap:6px; cursor:pointer; background:#fff3cd; padding:5px 7px; border-radius:5px; color:#856404; font-weight:700;">
        <input type="checkbox" id="mc-chk-dryrun" checked> 🛡️ Modo Prueba (rellena pero NO envía/guarda)
      </label>
    </div>

    <button id="mc-run-btn" style="width:100%; padding:9px; background:#057642; color:#fff; border:none; border-radius:6px; font-weight:600; cursor:pointer;">▶ Ejecutar Acciones Seleccionadas</button>
    <div id="mc-status" style="font-size:12px; margin-top:8px; text-align:center; font-weight:600;"></div>
  `;

  document.body.appendChild(modal);

  const selectRole = document.getElementById("mc-role-select");
  const inputProyecto = document.getElementById("mc-proyecto");
  const txtMensaje = document.getElementById("mc-mensaje");
  const chkConnect = document.getElementById("mc-chk-connect");
  const chkRecruiter = document.getElementById("mc-chk-recruiter");
  const chkDryRun = document.getElementById("mc-chk-dryrun");
  const btnRun = document.getElementById("mc-run-btn");
  const divStatus = document.getElementById("mc-status");

  document.getElementById("mc-close").addEventListener("click", () => {
    modal.style.display = "none";
  });

  try {
    const respRoles = await chrome.runtime.sendMessage({ action: "GET_ROLES_LIST" });
    if (respRoles?.ok && Array.isArray(respRoles.sheets)) {
      selectRole.innerHTML =
        `<option value="">-- Selecciona un rol --</option>` +
        respRoles.sheets.map((r) => `<option value="${r}">${r}</option>`).join("");
    } else {
      selectRole.innerHTML = `<option value="">Error: ${respRoles?.error || "Sin respuesta"}</option>`;
    }
  } catch (err) {
    selectRole.innerHTML = `<option value="">Error de conexión (recarga F5)</option>`;
  }

  selectRole.addEventListener("change", async () => {
    const role = selectRole.value;
    if (!role) return;

    btnRun.disabled = true;
    btnRun.style.opacity = "0.6";
    divStatus.style.color = "#0a66c2";
    divStatus.textContent = "⏳ Cargando datos del rol...";
    inputProyecto.value = "";
    txtMensaje.value = "";
    inputProyecto.placeholder = "Cargando proyecto...";
    txtMensaje.placeholder = "Cargando mensaje corto...";

    try {
      const respCfg = await chrome.runtime.sendMessage({ action: "GET_ROLE_CONFIG", role });
      if (respCfg?.ok && respCfg.config) {
        inputProyecto.value = respCfg.config.proyecto || "";
        txtMensaje.value = respCfg.config.mensaje || "";
        divStatus.style.color = "#057642";
        divStatus.textContent = "✔ Datos cargados. Listo para ejecutar";
      } else {
        divStatus.style.color = "#c92a2a";
        divStatus.textContent = respCfg?.message || "No se encontró configuración";
      }
    } catch (err) {
      divStatus.style.color = "#c92a2a";
      divStatus.textContent = "Error al cargar datos del rol";
    } finally {
      btnRun.disabled = false;
      btnRun.style.opacity = "1";
    }
  });

  btnRun.addEventListener("click", async () => {
    const hacerConectar = chkConnect.checked;
    const hacerRecruiter = chkRecruiter.checked;
    const modoPrueba = chkDryRun.checked;
    const proyecto = inputProyecto.value.trim();
    const mensaje = txtMensaje.value.trim();

    if (!hacerConectar && !hacerRecruiter) {
      divStatus.style.color = "#c92a2a";
      divStatus.textContent = "Marca al menos una acción (Conectar o Proyecto)";
      return;
    }

    btnRun.disabled = true;
    const actualizarEstado = (txt, color = "#057642") => {
      divStatus.style.color = color;
      divStatus.textContent = txt;
    };

    try {
      const h1 = document.querySelector("main h1");
      const nombreCandidato = (h1?.innerText || "").trim();

      let contactoRealizado = false;
      if (hacerConectar) {
        contactoRealizado = await conectarConNotaCorta(
          mensaje,
          nombreCandidato,
          modoPrueba,
          actualizarEstado
        );
      }

      if (hacerRecruiter) {
        if (!proyecto) {
          throw new Error("Falta el nombre del proyecto en Recruiter");
        }
        await chrome.storage.local.set({
          dryRunMode: modoPrueba,
          candidatoActual: {
            config: { proyecto, mensaje }
          }
        });
        await abrirEnRecruiterDesdePerfil(nombreCandidato, actualizarEstado, contactoRealizado);
      } else {
        actualizarEstado(
          modoPrueba ? "🛡️ Modo Prueba completado" : "✔ Acción de conexión completada",
          "#057642"
        );
      }
    } catch (err) {
      actualizarEstado(`❌ ${err.message}`, "#c92a2a");
    } finally {
      btnRun.disabled = false;
    }
  });
}

// ============================================================================
// BARRA FLOTANTE DE 3 BOTONES EN LINKEDIN
// ============================================================================
function montarBotonesFlotantes() {
  if (document.getElementById("modular-floating-bar")) return;

  const bar = document.createElement("div");
  bar.id = "modular-floating-bar";
  Object.assign(bar.style, {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    zIndex: "999999",
    display: "flex",
    gap: "8px",
    fontFamily: "system-ui, sans-serif"
  });

  const btnConnectProj = document.createElement("button");
  btnConnectProj.id = "btn-manual-connect";
  btnConnectProj.textContent = "Conectar / Proyecto";
  Object.assign(btnConnectProj.style, {
    background: "#057642",
    color: "#fff",
    border: "none",
    borderRadius: "24px",
    padding: "11px 16px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    boxShadow: "0 4px 14px rgba(0,0,0,0.25)"
  });
  btnConnectProj.addEventListener("click", abrirModalConectarProyecto);

  const btnMatch = document.createElement("button");
  btnMatch.id = "btn-manual-match";
  btnMatch.textContent = "Consultar Match";
  Object.assign(btnMatch.style, {
    background: "#6f42c1",
    color: "#fff",
    border: "none",
    borderRadius: "24px",
    padding: "11px 16px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    boxShadow: "0 4px 14px rgba(0,0,0,0.25)"
  });
  btnMatch.addEventListener("click", abrirModalConsultaMatch);

  const btnCopiar = document.createElement("button");
  btnCopiar.id = "btn-modular-extractor";
  btnCopiar.textContent = "Copiar perfil";
  Object.assign(btnCopiar.style, {
    background: "#0a66c2",
    color: "#fff",
    border: "none",
    borderRadius: "24px",
    padding: "11px 18px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    boxShadow: "0 4px 14px rgba(0,0,0,0.25)"
  });
  btnCopiar.addEventListener("click", ejecutarCopiaManual);

  bar.appendChild(btnConnectProj);
  bar.appendChild(btnMatch);
  bar.appendChild(btnCopiar);
  document.body.appendChild(bar);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "START_EXTRACTION") ejecutarCopiaManual();
  if (msg.action === "AUTO_EXTRACT") ejecutarFlujoAutomatico();
});

montarBotonesFlotantes();
new MutationObserver(() => montarBotonesFlotantes()).observe(document.body, {
  childList: true,
  subtree: true
});