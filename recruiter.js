// ============================================================================
// MÓDULO DE AUTOMATIZACIÓN EN LINKEDIN RECRUITER (PROYECTO + COPIAR MENSAJE)
// ============================================================================

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function querySelectorAllDeep(selector, root = document) {
  const results = Array.from(root.querySelectorAll(selector));
  const elements = root.querySelectorAll("*");
  for (const el of elements) {
    if (el.shadowRoot) {
      results.push(...querySelectorAllDeep(selector, el.shadowRoot));
    }
  }
  return results;
}

function esVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function mostrarEstadoRecruiter(texto, color = "#0a66c2") {
  let badge = document.getElementById("recruiter-bot-status");
  if (!badge) {
    badge = document.createElement("div");
    badge.id = "recruiter-bot-status";
    Object.assign(badge.style, {
      position: "fixed",
      bottom: "24px",
      left: "24px",
      zIndex: "2147483647",
      background: color,
      color: "#ffffff",
      padding: "10px 16px",
      borderRadius: "20px",
      fontSize: "12.5px",
      fontWeight: "600",
      fontFamily: "system-ui, sans-serif",
      boxShadow: "0 4px 14px rgba(0,0,0,0.28)"
    });
    document.body.appendChild(badge);
  }
  badge.style.background = color;
  badge.textContent = texto;
}

function ocultarEstadoRecruiter(delayMs = 4500) {
  setTimeout(() => {
    document.getElementById("recruiter-bot-status")?.remove();
  }, delayMs);
}

function buscarElementoPorTexto(selector, regex, soloVisibles = true) {
  return querySelectorAllDeep(selector).find((el) => {
    if (soloVisibles && !esVisible(el)) return false;
    const texto = (el.innerText || el.textContent || el.getAttribute("aria-label") || "").trim();
    return regex.test(texto);
  });
}

async function esperarElementoPorTexto(selector, regex, timeoutMs = 15000) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    const encontrado = buscarElementoPorTexto(selector, regex, true);
    if (encontrado) return encontrado;
    await esperar(500);
  }
  return null;
}

function recruiterSigueCargando() {
  if (document.readyState !== "complete") return true;

  const loadersVisibles = querySelectorAllDeep(
    '.artdeco-loader, [role="progressbar"], [aria-busy="true"], .loading-icon, .profile-skeleton'
  ).some(esVisible);
  if (loadersVisibles) return true;

  const mainEl = document.querySelector("main") || document.body;
  const textoVisible = (mainEl?.innerText || "").trim();
  return textoVisible.length < 120;
}

async function esperarBotonGuardarSinRendirse() {
  const regexGuardar = /^(Guardar en (un )?proyecto|Save to (a )?project)$/i;
  const inicio = Date.now();
  let tiempoConPerfilListoMs = 0;
  const maxEsperaTotalMs = 180000;

  while (Date.now() - inicio < maxEsperaTotalMs) {
    const { recruiterTask } = await chrome.storage.local.get(["recruiterTask"]);
    if (!recruiterTask?.pending) return null;

    const encontrado = buscarElementoPorTexto(
      "button, a, span, div[role='button']",
      regexGuardar,
      true
    );
    if (encontrado) return encontrado;

    const segs = Math.floor((Date.now() - inicio) / 1000);
    if (recruiterSigueCargando()) {
      tiempoConPerfilListoMs = 0;
      mostrarEstadoRecruiter(`⏳ Esperando carga de Recruiter (${segs}s)...`, "#0a66c2");
    } else {
      tiempoConPerfilListoMs += 600;
      mostrarEstadoRecruiter(`⏳ Buscando 'Guardar en proyecto' (${segs}s)...`, "#0a66c2");
      if (tiempoConPerfilListoMs >= 25000) {
        return null;
      }
    }

    await esperar(600);
  }

  return null;
}

// ============================================================================
// VALIDACIÓN DE HISTORIAL: NO GUARDAR SI ALGUIEN != ALYN CASMEN CONTACTÓ < 30 DÍAS
// ============================================================================
function parsearFechaActividad(texto) {
  // Soporta formatos dd/mm/yyyy o dd-mm-yyyy
  const matchSlash = texto.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (matchSlash) {
    const dia = parseInt(matchSlash[1], 10);
    const mes = parseInt(matchSlash[2], 10) - 1;
    const anio = parseInt(matchSlash[3], 10);
    const fecha = new Date(anio, mes, dia, 12, 0, 0);
    if (!isNaN(fecha.getTime())) return fecha;
  }

  // Soporta formato yyyy-mm-dd
  const matchIso = texto.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (matchIso) {
    const anio = parseInt(matchIso[1], 10);
    const mes = parseInt(matchIso[2], 10) - 1;
    const dia = parseInt(matchIso[3], 10);
    const fecha = new Date(anio, mes, dia, 12, 0, 0);
    if (!isNaN(fecha.getTime())) return fecha;
  }

  return null;
}

function esContactoRecienteDeTercero() {
  const seccionActividad = buscarElementoPorTexto(
    "section, div, article",
    /Actividad en Recruiter|Recruiter activity/i,
    false
  );
  if (seccionActividad) {
    seccionActividad.scrollIntoView?.({ block: "nearest", behavior: "instant" });
  }

  const contenedor = seccionActividad || document.body;
  const textoBloque = contenedor.innerText || "";
  const lineas = textoBloque
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const regexAccionContacto =
    /(enviado.*(mensaje|inmail)|mensaje\s*inmail|inmail|contactado|invitación\s*enviada|sent.*(message|inmail)|messaged|reached\s*out|invited)/i;

  const ahora = new Date();
  const msPorDia = 1000 * 60 * 60 * 24;
  const limiteDias = 30;

  // Agrupar líneas cercanas que correspondan a una misma actividad con fecha
  for (let i = 0; i < lineas.length; i++) {
    const ventana = [lineas[i], lineas[i + 1] || "", lineas[i + 2] || ""].join(" ");
    const fechaEvento = parsearFechaActividad(ventana);
    if (!fechaEvento) continue;

    if (!regexAccionContacto.test(ventana)) continue;

    // Ignorar explícitamente si la actividad es de Alyn Casmen o del Hiring Assistant
    const esAlyn = /\balyn\s+casmen\b/i.test(ventana);
    const esHiringAssistant = /\bhiring\s+assistant\b/i.test(ventana);
    if (esAlyn || esHiringAssistant) continue;

    const diasTranscurridos = (ahora.getTime() - fechaEvento.getTime()) / msPorDia;
    if (diasTranscurridos >= -1 && diasTranscurridos < limiteDias) {
      const nombreMatch = ventana.match(
        /^([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){0,3})\s+(?:ha\s+enviado|envió|sent|messaged|contactó)/i
      );
      const quien = nombreMatch ? nombreMatch[1].trim() : "otro usuario";
      return {
        bloqueado: true,
        quien,
        dias: Math.max(0, Math.floor(diasTranscurridos)),
        fechaTexto: fechaEvento.toLocaleDateString("es-MX")
      };
    }
  }

  return { bloqueado: false };
}

async function verificarRestriccionContactoPrevio() {
  // Dar un breve respiro para que "Actividad en Recruiter" termine de renderizar
  for (let intento = 0; intento < 4; intento++) {
    const resultado = esContactoRecienteDeTercero();
    if (resultado.bloqueado) return resultado;
    await esperar(500);
  }
  return { bloqueado: false };
}

function clicReal(el) {
  if (!el) return;
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
  el.click();
}

function escribirEnInputReact(input, valor) {
  input.focus();
  clicReal(input);

  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )?.set;

  if (nativeSetter) {
    nativeSetter.call(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    nativeSetter.call(input, valor);
  } else {
    input.value = valor;
  }

  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keyup", { key: valor.slice(-1) || "a", bubbles: true }));
}

function simularTecla(elemento, key, code, keyCode) {
  const opts = { key, code, keyCode, which: keyCode, bubbles: true, cancelable: true };
  elemento.dispatchEvent(new KeyboardEvent("keydown", opts));
  elemento.dispatchEvent(new KeyboardEvent("keypress", opts));
  elemento.dispatchEvent(new KeyboardEvent("keyup", opts));
}

async function enviarMensajeExtensionConReintento(payload, reintentos = 2) {
  for (let i = 0; i <= reintentos; i++) {
    try {
      const resp = await chrome.runtime.sendMessage(payload);
      if (resp) return resp;
    } catch (err) {
      if (i === reintentos) throw err;
    }
    await esperar(350);
  }
  return { ok: false, error: "Sin respuesta del background" };
}

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
  } catch {
    return false;
  }
}

// ============================================================================
// FLUJO 1: GUARDAR CANDIDATO EN PROYECTO EXISTENTE (PERFIL DE RECRUITER)
// ============================================================================
async function guardarEnProyectoExistente() {
  const { recruiterTask } = await chrome.storage.local.get(["recruiterTask"]);
  if (!recruiterTask?.pending) return;

  const { config, dryRunMode } = recruiterTask;
  const nombreProyecto = (config?.proyecto || "").trim();
  let guardadoExitoso = false;

  try {
    if (!nombreProyecto) {
      mostrarEstadoRecruiter("⚠️ Sin nombre de proyecto en AGENTE_DB", "#856404");
      return;
    }

    mostrarEstadoRecruiter("⏳ Esperando carga de Recruiter...", "#0a66c2");
    const nodoGuardar = await esperarBotonGuardarSinRendirse();

    if (!nodoGuardar) {
      mostrarEstadoRecruiter("⚠️ No apareció botón 'Guardar en proyecto'", "#856404");
      return;
    }

    // Revisar historial antes de guardar: no guardar si alguien != Alyn Casmen contactó < 30 días
    const restriccion = await verificarRestriccionContactoPrevio();
    if (restriccion.bloqueado) {
      mostrarEstadoRecruiter(
        `⛔ No guardado: contactado por ${restriccion.quien} (${restriccion.fechaTexto})`,
        "#c92a2a"
      );
      await esperar(2500);
      return;
    }

    const botonGuardar = nodoGuardar.closest("button, a, div[role='button']") || nodoGuardar;
    clicReal(botonGuardar);
    await esperar(1800);

    const opcionExistente = await esperarElementoPorTexto(
      'label, span, div[role="radio"], button',
      /(Seleccionar (un )?proyecto existente|Proyecto existente|Select (an )?existing project|Existing project)/i,
      6000
    );

    if (opcionExistente) {
      const targetLabel = opcionExistente.closest("label") || opcionExistente;
      clicReal(targetLabel);

      const forId = targetLabel.getAttribute("for");
      const radioInput = forId
        ? document.getElementById(forId)
        : targetLabel.querySelector('input[type="radio"]') ||
          targetLabel.parentElement?.querySelector('input[type="radio"]');

      if (radioInput && !radioInput.checked) {
        clicReal(radioInput);
        radioInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
      await esperar(1200);
    }

    mostrarEstadoRecruiter(`⏳ Buscando proyecto "${nombreProyecto}"...`, "#0a66c2");

    const contenedorModal =
      querySelectorAllDeep('[role="dialog"], .artdeco-modal, [data-test-modal]').find(esVisible) ||
      document;

    let inputProyecto = null;
    for (let intento = 0; intento < 15; intento++) {
      const inputsVisibles = querySelectorAllDeep(
        'input[type="text"], input[type="search"], input[role="combobox"], input:not([type])',
        contenedorModal
      ).filter(
        (inp) => esVisible(inp) && !inp.disabled && inp.type !== "radio" && inp.type !== "checkbox"
      );

      inputProyecto =
        inputsVisibles.find((inp) =>
          /(buscar|search|proyecto|project|seleccionar|select|nombre|name)/i.test(
            `${inp.placeholder || ""} ${inp.getAttribute("aria-label") || ""}`
          )
        ) || inputsVisibles[inputsVisibles.length - 1];

      if (inputProyecto) break;
      await esperar(500);
    }

    if (!inputProyecto) {
      mostrarEstadoRecruiter("⚠️ No se encontró campo para buscar proyecto", "#856404");
      return;
    }

    escribirEnInputReact(inputProyecto, nombreProyecto);
    await esperar(2200);

    const rectInput = inputProyecto.getBoundingClientRect();
    const candidatosLista = querySelectorAllDeep(
      'div[role="option"], li[role="option"], [role="listbox"] li, [role="listbox"] div, ul li, button'
    ).filter((el) => {
      if (!esVisible(el)) return false;
      if (el.tagName === "INPUT" || el.tagName === "LABEL") return false;
      if (el.contains(inputProyecto)) return false;
      const txt = (el.innerText || "").trim();
      if (!txt || /^(Cancelar|Cancel|Guardar|Save)$/i.test(txt)) return false;
      const rect = el.getBoundingClientRect();
      return rect.top >= rectInput.top - 5;
    });

    const opcionProyecto =
      candidatosLista.find(
        (el) => (el.innerText || "").trim().toLowerCase() === nombreProyecto.toLowerCase()
      ) ||
      candidatosLista.find((el) =>
        (el.innerText || "").trim().toLowerCase().includes(nombreProyecto.toLowerCase())
      );

    if (opcionProyecto) {
      clicReal(opcionProyecto);
      await esperar(1200);
    } else {
      inputProyecto.focus();
      simularTecla(inputProyecto, "ArrowDown", "ArrowDown", 40);
      await esperar(400);
      simularTecla(inputProyecto, "Enter", "Enter", 13);
      await esperar(1200);
    }

    if (!dryRunMode) {
      let btnConfirmar = null;
      const inicioEspera = Date.now();
      while (Date.now() - inicioEspera < 8000) {
        const scope =
          querySelectorAllDeep('[role="dialog"], .artdeco-modal, [data-test-modal]').find(esVisible) ||
          document;

        btnConfirmar = querySelectorAllDeep("button", scope).find(
          (b) =>
            esVisible(b) &&
            !b.disabled &&
            b.getAttribute("aria-disabled") !== "true" &&
            /^(Guardar|Save|Guardar en proyecto|Save to project)$/i.test((b.innerText || "").trim())
        );
        if (btnConfirmar) break;
        await esperar(400);
      }

      if (btnConfirmar) {
        clicReal(btnConfirmar);
        guardadoExitoso = true;
        mostrarEstadoRecruiter(`✔ Guardado en "${nombreProyecto}"`, "#057642");
        await esperar(2500);
      } else {
        mostrarEstadoRecruiter("⚠️ No se habilitó el botón Guardar", "#856404");
      }
    } else {
      guardadoExitoso = true;
      mostrarEstadoRecruiter(`🛡️ Modo Prueba: Proyecto "${nombreProyecto}" listo`, "#856404");
      await esperar(2000);
    }
  } catch (err) {
    console.error("[Recruiter Bot] Error guardando en proyecto de Recruiter:", err);
    mostrarEstadoRecruiter(`❌ Error Recruiter: ${err.message.slice(0, 30)}`, "#c92a2a");
  } finally {
    ocultarEstadoRecruiter(4000);
    await enviarMensajeExtensionConReintento({
      action: "RECRUITER_DONE",
      guardado: guardadoExitoso
    }).catch(() => {});
  }
}

// ============================================================================
// UI FLOTANTE PARA VISTA DE PROYECTO: VER Y COPIAR MENSAJE LARGO
// ============================================================================
function esVistaDeProyecto() {
  const path = location.pathname || "";
  return path.includes("/talent/") && !path.includes("/profile/");
}

function montarControlesProyecto() {
  if (!esVistaDeProyecto()) return;
  if (document.getElementById("recruiter-batch-btn")) return;

  const btn = document.createElement("button");
  btn.id = "recruiter-batch-btn";
  btn.type = "button";
  btn.textContent = "Mensaje Largo";
  Object.assign(btn.style, {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    zIndex: "2147483646",
    background: "#0a66c2",
    color: "#ffffff",
    border: "none",
    borderRadius: "24px",
    padding: "11px 18px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    boxShadow: "0 4px 14px rgba(0,0,0,0.28)",
    fontFamily: "system-ui, sans-serif"
  });

  btn.addEventListener("click", abrirPanelMensajeLargo);
  document.body.appendChild(btn);
}

async function abrirPanelMensajeLargo() {
  let panel = document.getElementById("recruiter-batch-panel");
  if (panel) {
    panel.style.display = panel.style.display === "none" ? "block" : "none";
    return;
  }

  const { candidatoActual } = await chrome.storage.local.get(["candidatoActual"]);

  panel = document.createElement("div");
  panel.id = "recruiter-batch-panel";
  Object.assign(panel.style, {
    position: "fixed",
    bottom: "76px",
    right: "24px",
    width: "365px",
    zIndex: "2147483647",
    background: "#ffffff",
    color: "#222222",
    borderRadius: "12px",
    padding: "14px",
    boxShadow: "0 8px 28px rgba(0,0,0,0.32)",
    border: "1px solid #d0d7de",
    fontFamily: "system-ui, sans-serif",
    fontSize: "13px"
  });

  panel.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <strong style="color:#0a66c2; font-size:14px;">Mensaje Largo (AGENTE_DB)</strong>
      <button type="button" id="rb-close" style="border:none; background:transparent; font-size:18px; line-height:1; padding:2px 6px; cursor:pointer; color:#666;">✕</button>
    </div>

    <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Seleccionar Role:</label>
    <select id="rb-role-select" style="width:100%; padding:6px; margin-bottom:8px; border:1px solid #ccc; border-radius:6px;">
      <option value="">Cargando roles...</option>
    </select>

    <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Mensaje Largo (Columna E):</label>
    <textarea id="rb-msg-largo" rows="6" placeholder="Selecciona un rol para ver el mensaje largo..." style="width:100%; box-sizing:border-box; padding:8px; margin-bottom:10px; border:1px solid #ccc; border-radius:6px; font-size:12px; resize:vertical;"></textarea>

    <button type="button" id="rb-copy" style="width:100%; padding:9px; background:#0a66c2; color:#fff; border:none; border-radius:6px; font-weight:600; cursor:pointer;">
      📋 Copiar Mensaje Largo
    </button>
    <div id="rb-status" style="font-size:12px; margin-top:8px; text-align:center; font-weight:600;"></div>
  `;

  document.body.appendChild(panel);

  const btnClose = panel.querySelector("#rb-close");
  const selectRole = panel.querySelector("#rb-role-select");
  const txtMsgLargo = panel.querySelector("#rb-msg-largo");
  const btnCopy = panel.querySelector("#rb-copy");
  const divStatus = panel.querySelector("#rb-status");

  if (candidatoActual?.config?.mensajeLargo) {
    txtMsgLargo.value = candidatoActual.config.mensajeLargo;
  }

  btnClose.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    panel.style.display = "none";
  });

  try {
    const respRoles = await enviarMensajeExtensionConReintento({ action: "GET_ROLES_LIST" });
    if (respRoles?.ok && Array.isArray(respRoles.sheets) && respRoles.sheets.length > 0) {
      selectRole.innerHTML =
        `<option value="">-- Selecciona un rol --</option>` +
        respRoles.sheets.map((r) => `<option value="${r}">${r}</option>`).join("");
      if (candidatoActual?.config?.role) {
        selectRole.value = candidatoActual.config.role;
      }
    } else {
      const detalle = respRoles?.error || "Sin roles en AGENTE_DB";
      selectRole.innerHTML = `<option value="">${detalle}</option>`;
      divStatus.style.color = "#c92a2a";
      divStatus.textContent = `⚠️ ${detalle}`;
    }
  } catch (err) {
    selectRole.innerHTML = `<option value="">Error al cargar roles</option>`;
    divStatus.style.color = "#c92a2a";
    divStatus.textContent = `❌ ${err?.message || "Error al cargar roles"}`;
  }

  selectRole.addEventListener("change", async () => {
    const role = selectRole.value;
    if (!role) return;
    divStatus.style.color = "#0a66c2";
    divStatus.textContent = "⏳ Cargando Mensaje Largo...";
    try {
      const respCfg = await enviarMensajeExtensionConReintento({ action: "GET_ROLE_CONFIG", role });
      if (respCfg?.ok && respCfg.config) {
        txtMsgLargo.value = respCfg.config.mensajeLargo || "";
        divStatus.style.color = "#057642";
        divStatus.textContent = "✔ Mensaje Largo listo";
      } else {
        divStatus.style.color = "#c92a2a";
        divStatus.textContent = respCfg?.message || respCfg?.error || "No se pudo cargar el rol";
      }
    } catch (err) {
      divStatus.style.color = "#c92a2a";
      divStatus.textContent = `❌ ${err?.message || "Error al consultar rol"}`;
    }
  });

  btnCopy.addEventListener("click", () => {
    const texto = txtMsgLargo.value || "";
    if (!texto.trim()) {
      divStatus.style.color = "#c92a2a";
      divStatus.textContent = "⚠️ No hay mensaje para copiar";
      return;
    }
    const ok = copiarAlPortapapeles(texto);
    if (ok) {
      divStatus.style.color = "#057642";
      divStatus.textContent = "✔ Mensaje copiado al portapapeles";
    } else {
      divStatus.style.color = "#c92a2a";
      divStatus.textContent = "❌ No se pudo copiar al portapapeles";
    }
  });
}

// ============================================================================
// ARRANQUE Y ESCUCHA DE MENSAJES
// ============================================================================
let ejecutando = false;
function iniciarSiHayTarea() {
  if (ejecutando) return;
  ejecutando = true;
  guardarEnProyectoExistente().finally(() => {
    ejecutando = false;
  });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "RUN_RECRUITER_ACTIONS") {
    iniciarSiHayTarea();
  }
});

montarControlesProyecto();
new MutationObserver(() => montarControlesProyecto()).observe(document.body, {
  childList: true,
  subtree: true
});

iniciarSiHayTarea();