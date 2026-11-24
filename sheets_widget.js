// ============================================================================
// WIDGET FLOTANTE A LA DERECHA Y ARRASTRABLE EN EL GOOGLE SHEET
// ============================================================================

(function () {
  const TARGET_SHEET_ID = "1IgctcXouhK3QRIO-4LDhf4uTOWV8XuM-M7omzqowF6Y";
  if (!location.href.includes(`/spreadsheets/d/${TARGET_SHEET_ID}`)) return;
  if (document.getElementById("ext-sheets-floating-widget")) return;

  const wrapper = document.createElement("div");
  wrapper.id = "ext-sheets-floating-widget";
  Object.assign(wrapper.style, {
    position: "fixed",
    bottom: "44px",
    right: "20px",
    left: "auto",
    top: "auto",
    width: "330px",
    zIndex: "2147483646",
    background: "#ffffff",
    color: "#222222",
    borderRadius: "10px",
    boxShadow: "0 8px 26px rgba(0,0,0,0.28)",
    border: "1px solid #d0d7de",
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: "12px",
    overflow: "hidden"
  });

  wrapper.innerHTML = `
    <div id="sw-header" style="display:flex; justify-content:space-between; align-items:center; background:#0a66c2; color:#fff; padding:8px 12px; cursor:grab; user-select:none;">
      <strong style="font-size:12.5px;">⚡ LinkedIn AI Recruiter</strong>
      <button type="button" id="sw-toggle" title="Minimizar / Expandir" style="border:none; background:rgba(255,255,255,0.2); color:#fff; border-radius:4px; padding:1px 7px; font-weight:700; cursor:pointer;">—</button>
    </div>

    <div id="sw-body" style="padding:11px 12px;">
      <label style="font-size:11px; font-weight:700; display:block; margin-bottom:3px; color:#444;">Pestaña / Role:</label>
      <div style="display:flex; gap:5px; margin-bottom:8px;">
        <select id="sw-role" style="flex:1; padding:5px 7px; border:1px solid #ccc; border-radius:5px; font-size:12px; background:#fff;">
          <option value="">Cargando...</option>
        </select>
        <button type="button" id="sw-refresh" title="Recargar roles" style="padding:5px 8px; border:1px solid #ccc; border-radius:5px; background:#e9ecef; cursor:pointer; font-weight:700;">↻</button>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; margin-bottom:8px;">
        <div>
          <label style="font-size:10.5px; font-weight:700; display:block; margin-bottom:2px; color:#444;">Fila inicio:</label>
          <input type="number" id="sw-row-start" min="2" placeholder="Ej: 2" style="width:100%; box-sizing:border-box; padding:5px 6px; border:1px solid #ccc; border-radius:5px; font-size:12px;">
        </div>
        <div>
          <label style="font-size:10.5px; font-weight:700; display:block; margin-bottom:2px; color:#444;">Fila fin:</label>
          <input type="number" id="sw-row-end" min="2" placeholder="Vacío=1" style="width:100%; box-sizing:border-box; padding:5px 6px; border:1px solid #ccc; border-radius:5px; font-size:12px;">
        </div>
        <div>
          <label style="font-size:10.5px; font-weight:700; display:block; margin-bottom:2px; color:#444;">Match mín %:</label>
          <input type="number" id="sw-min-match" min="0" max="100" value="75" style="width:100%; box-sizing:border-box; padding:5px 6px; border:1px solid #ccc; border-radius:5px; font-size:12px;">
        </div>
      </div>

      <label style="display:flex; align-items:center; gap:6px; margin-bottom:5px; cursor:pointer; font-size:11.5px;">
        <input type="checkbox" id="sw-close-tab" checked style="margin:0;">
        <span>Cerrar pestañas al terminar (si no es modo prueba)</span>
      </label>

      <label style="display:flex; align-items:center; gap:6px; margin-bottom:5px; cursor:pointer; font-size:11.5px;">
        <input type="checkbox" id="sw-connect" style="margin:0;">
        <span>Si cumple Match: Conectar + Nota (Mensaje Corto)</span>
      </label>

      <label style="display:flex; align-items:center; gap:6px; margin-bottom:7px; cursor:pointer; font-size:11.5px;">
        <input type="checkbox" id="sw-recruiter" style="margin:0;">
        <span>Si cumple Match: Abrir Recruiter y guardar en proyecto</span>
      </label>

      <label style="display:flex; align-items:center; gap:6px; background:#fff3cd; padding:5px 7px; border-radius:5px; margin-bottom:8px; cursor:pointer; font-size:11.5px; color:#856404; font-weight:700;">
        <input type="checkbox" id="sw-dry-run" checked style="margin:0;">
        <span>🛡️ Modo Prueba (rellena todo pero NO envía)</span>
      </label>

      <button type="button" id="sw-start" style="width:100%; padding:8px; border:none; border-radius:6px; background:#0a66c2; color:#fff; font-weight:700; font-size:12px; cursor:pointer;">
        ▶ Iniciar Evaluación
      </button>
      <button type="button" id="sw-stop" style="display:none; width:100%; padding:8px; border:none; border-radius:6px; background:#c92a2a; color:#fff; font-weight:700; font-size:12px; cursor:pointer;">
        ⏹ Detener Lote
      </button>

      <div id="sw-status" style="font-size:11px; color:#057642; text-align:center; margin-top:6px; min-height:14px;"></div>
    </div>
  `;

  document.body.appendChild(wrapper);

  const swHeader = wrapper.querySelector("#sw-header");
  const swBody = wrapper.querySelector("#sw-body");
  const swToggle = wrapper.querySelector("#sw-toggle");
  const swRole = wrapper.querySelector("#sw-role");
  const swRefresh = wrapper.querySelector("#sw-refresh");
  const swRowStart = wrapper.querySelector("#sw-row-start");
  const swRowEnd = wrapper.querySelector("#sw-row-end");
  const swMinMatch = wrapper.querySelector("#sw-min-match");
  const swCloseTab = wrapper.querySelector("#sw-close-tab");
  const swConnect = wrapper.querySelector("#sw-connect");
  const swRecruiter = wrapper.querySelector("#sw-recruiter");
  const swDryRun = wrapper.querySelector("#sw-dry-run");
  const swStart = wrapper.querySelector("#sw-start");
  const swStop = wrapper.querySelector("#sw-stop");
  const swStatus = wrapper.querySelector("#sw-status");

  function setStatus(txt, color = "#057642") {
    swStatus.style.color = color;
    swStatus.textContent = txt;
  }

  // Arrastrar el panel desde su barra superior
  let arrastrando = false;
  let seMovio = false;
  let offsetX = 0;
  let offsetY = 0;

  swHeader.addEventListener("mousedown", (e) => {
    if (e.target === swToggle) return;
    const rect = wrapper.getBoundingClientRect();
    arrastrando = true;
    seMovio = false;
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    wrapper.style.left = `${rect.left}px`;
    wrapper.style.top = `${rect.top}px`;
    wrapper.style.right = "auto";
    wrapper.style.bottom = "auto";
    swHeader.style.cursor = "grabbing";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!arrastrando) return;
    seMovio = true;
    const maxX = Math.max(0, window.innerWidth - wrapper.offsetWidth);
    const maxY = Math.max(0, window.innerHeight - wrapper.offsetHeight);
    const nextLeft = Math.min(Math.max(0, e.clientX - offsetX), maxX);
    const nextTop = Math.min(Math.max(0, e.clientY - offsetY), maxY);
    wrapper.style.left = `${nextLeft}px`;
    wrapper.style.top = `${nextTop}px`;
  });

  document.addEventListener("mouseup", () => {
    if (!arrastrando) return;
    arrastrando = false;
    swHeader.style.cursor = "grab";
    setTimeout(() => {
      seMovio = false;
    }, 50);
  });

  let minimizado = false;
  swToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    minimizado = !minimizado;
    swBody.style.display = minimizado ? "none" : "block";
    swToggle.textContent = minimizado ? "+" : "—";
    wrapper.style.width = minimizado ? "215px" : "330px";
  });

  // ==========================================================================
  // SINCRONIZACIÓN AUTOMÁTICA SOLO AL CAMBIAR DE PESTAÑA EN GOOGLE SHEETS
  // (No pisa la selección manual del usuario)
  // ==========================================================================
  let ultimaPestanaSheetDetectada = "";

  function obtenerPestanaActivaEnSheet() {
    const selectores = [
      ".docs-sheet-active-tab .docs-sheet-tab-name",
      ".docs-sheet-active-tab",
      '[role="tab"][aria-selected="true"] .docs-sheet-tab-name',
      '[role="tab"][aria-selected="true"]'
    ];

    for (const sel of selectores) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const texto = (el.textContent || "").trim();
      if (!texto) continue;
      const primeraLinea = texto.split("\n")[0].trim();
      if (primeraLinea && primeraLinea !== "AGENTE_DB") {
        return primeraLinea;
      }
    }
    return "";
  }

  function resolverRolCoincidente(nombrePestana, opcionesSelect) {
    if (!nombrePestana) return "";
    const valores = Array.from(opcionesSelect).map((o) => o.value).filter(Boolean);

    if (valores.includes(nombrePestana)) return nombrePestana;

    const norm = (s) => s.toLowerCase().replace(/[\s_]+/g, "_").trim();
    const objetivo = norm(nombrePestana);
    return valores.find((v) => norm(v) === objetivo) || "";
  }

  async function revisarCambioPestanaSheet() {
    const pestanaActual = obtenerPestanaActivaEnSheet();
    if (!pestanaActual || pestanaActual === ultimaPestanaSheetDetectada) return;

    ultimaPestanaSheetDetectada = pestanaActual;

    const { batchState } = await chrome.storage.local.get(["batchState"]);
    if (batchState?.active) return;

    const rolMatch = resolverRolCoincidente(pestanaActual, swRole.options);
    if (rolMatch && swRole.value !== rolMatch) {
      swRole.value = rolMatch;
      await chrome.storage.local.set({ selectedSheet: rolMatch });
    }
  }

  async function cargarRoles(rolPreferido = "") {
    swRole.innerHTML = '<option value="">Cargando...</option>';
    try {
      const resp = await chrome.runtime.sendMessage({ action: "GET_ROLES_LIST" });
      if (resp?.ok && Array.isArray(resp.sheets) && resp.sheets.length > 0) {
        swRole.innerHTML = resp.sheets
          .map((r) => `<option value="${r}">${r}</option>`)
          .join("");
        const elegido =
          rolPreferido && resp.sheets.includes(rolPreferido) ? rolPreferido : resp.sheets[0];
        swRole.value = elegido;
        await chrome.storage.local.set({ selectedSheet: elegido });

        // Sincronizar con la pestaña activa actual del Sheet tras cargar opciones
        ultimaPestanaSheetDetectada = "";
        await revisarCambioPestanaSheet();
      } else {
        swRole.innerHTML = `<option value="">${resp?.error || "Sin roles"}</option>`;
      }
    } catch {
      swRole.innerHTML = '<option value="">Error al cargar roles</option>';
    }
  }

  chrome.storage.local.get(
    [
      "selectedSheet",
      "minMatch",
      "autoCloseTab",
      "autoConnect",
      "autoRecruiter",
      "dryRunMode",
      "batchState"
    ],
    (data) => {
      cargarRoles(data.selectedSheet || "");
      if (typeof data.minMatch === "number") swMinMatch.value = data.minMatch;
      if (typeof data.autoCloseTab === "boolean") swCloseTab.checked = data.autoCloseTab;
      if (typeof data.autoConnect === "boolean") swConnect.checked = data.autoConnect;
      if (typeof data.autoRecruiter === "boolean") swRecruiter.checked = data.autoRecruiter;
      if (typeof data.dryRunMode === "boolean") swDryRun.checked = data.dryRunMode;
      if (data.batchState?.active) {
        swStart.style.display = "none";
        swStop.style.display = "block";
        setStatus(`⏳ Lote activo en fila ${data.batchState.currentRow}...`, "#0a66c2");
      }
    }
  );

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.selectedSheet?.newValue && swRole.value !== changes.selectedSheet.newValue) {
      swRole.value = changes.selectedSheet.newValue;
    }
    if (typeof changes.minMatch?.newValue === "number") swMinMatch.value = changes.minMatch.newValue;
    if (typeof changes.autoCloseTab?.newValue === "boolean") swCloseTab.checked = changes.autoCloseTab.newValue;
    if (typeof changes.autoConnect?.newValue === "boolean") swConnect.checked = changes.autoConnect.checked;
    if (typeof changes.autoRecruiter?.newValue === "boolean") swRecruiter.checked = changes.autoRecruiter.newValue;
    if (typeof changes.dryRunMode?.newValue === "boolean") swDryRun.checked = changes.dryRunMode.newValue;
    if (changes.batchState) {
      const st = changes.batchState.newValue;
      if (st?.active) {
        swStart.style.display = "none";
        swStop.style.display = "block";
        setStatus(`⏳ Lote activo en fila ${st.currentRow}...`, "#0a66c2");
      } else {
        swStart.style.display = "block";
        swStop.style.display = "none";
        setStatus("✔ Lote finalizado", "#057642");
      }
    }
  });

  swRole.addEventListener("change", () => {
    chrome.storage.local.set({ selectedSheet: swRole.value });
  });

  const obsPestanas = new MutationObserver(() => {
    revisarCambioPestanaSheet();
  });

  if (document.body) {
    obsPestanas.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-selected", "class"]
    });
  }

  setInterval(revisarCambioPestanaSheet, 1500);

  swRefresh.addEventListener("click", () => cargarRoles(swRole.value));

  swStart.addEventListener("click", async () => {
    const sheetName = swRole.value;
    const startRow = swRowStart.value ? parseInt(swRowStart.value, 10) : null;
    const endRow = swRowEnd.value ? parseInt(swRowEnd.value, 10) : null;
    const minMatch = parseInt(swMinMatch.value, 10) || 75;

    if (!sheetName) {
      setStatus("⚠️ Selecciona un Role", "#c92a2a");
      return;
    }

    await chrome.storage.local.set({
      selectedSheet: sheetName,
      minMatch,
      autoCloseTab: swCloseTab.checked,
      autoConnect: swConnect.checked,
      autoRecruiter: swRecruiter.checked,
      dryRunMode: swDryRun.checked
    });

    if (startRow && endRow && endRow >= startRow) {
      swStart.style.display = "none";
      swStop.style.display = "block";
      setStatus(`⏳ Iniciando lote filas ${startRow} a ${endRow}...`, "#0a66c2");

      const resp = await chrome.runtime.sendMessage({
        action: "START_BATCH",
        sheetName,
        startRow,
        endRow
      });
      if (!resp?.ok) {
        swStart.style.display = "block";
        swStop.style.display = "none";
        setStatus(resp?.error || "Error al iniciar lote", "#c92a2a");
      }
    } else {
      setStatus(`⏳ Abriendo perfil de "${sheetName}"...`, "#0a66c2");
      const resp = await chrome.runtime.sendMessage({
        action: "OPEN_FROM_SHEETS",
        sheetName,
        row: startRow
      });
      if (resp?.ok) {
        setStatus(`✔ Abierta fila ${resp.row}`, "#057642");
      } else {
        setStatus(resp?.error || "No se encontró el perfil", "#c92a2a");
      }
    }
  });

  swStop.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ action: "STOP_BATCH" });
    swStart.style.display = "block";
    swStop.style.display = "none";
    setStatus("⏹ Lote detenido", "#c92a2a");
  });
})();