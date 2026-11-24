// Navegación entre pestañas
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

const inputUrl = document.getElementById("webhook-url");
const inputKey = document.getElementById("openai-key");
const sheetSelect = document.getElementById("sheet-select");
const rowStartInput = document.getElementById("row-start");
const rowEndInput = document.getElementById("row-end");
const minMatchInput = document.getElementById("min-match");
const chkCloseTab = document.getElementById("chk-close-tab");
const chkRecruiter = document.getElementById("chk-recruiter");
const chkConnect = document.getElementById("chk-connect");
const chkDryRun = document.getElementById("chk-dry-run");
const btnStart = document.getElementById("btn-start");
const btnStop = document.getElementById("btn-stop");
const statusDiv = document.getElementById("status");

const xrayRoleSelect = document.getElementById("xray-role-select");
const xrayBtnRefresh = document.getElementById("xray-btn-refresh");
const dbRoleSelect = document.getElementById("db-role-select");
const dbBtnRefresh = document.getElementById("db-btn-refresh");
const btnToggleNewRole = document.getElementById("btn-toggle-new-role");
const newRoleBox = document.getElementById("new-role-box");
const newRoleNameInput = document.getElementById("new-role-name");
const btnCreateRole = document.getElementById("btn-create-role");

const dbProyecto = document.getElementById("db-proyecto");
const dbJd = document.getElementById("db-jd");
const dbMensaje = document.getElementById("db-mensaje");
const dbMensajeLargo = document.getElementById("db-mensaje-largo");

// Elementos pestaña X-Ray
const xrayCacheBadge = document.getElementById("xray-cache-badge");
const xrayCountry = document.getElementById("xray-country");
const xrayRolesBox = document.getElementById("xray-roles-box");
const xraySkillsBox = document.getElementById("xray-skills-box");
const xrayQuery = document.getElementById("xray-query");
const btnXrayAnalyze = document.getElementById("btn-xray-analyze");
const btnXrayCopy = document.getElementById("btn-xray-copy");
const btnXrayOpen = document.getElementById("btn-xray-open");

let jdOriginalCargada = "";

const SITE_BY_COUNTRY = {
  global: "site:linkedin.com/in/",
  co: "site:co.linkedin.com/in/",
  mx: "site:mx.linkedin.com/in/",
  ar: "site:ar.linkedin.com/in/",
  cl: "site:cl.linkedin.com/in/",
  pe: "site:pe.linkedin.com/in/",
  br: "site:br.linkedin.com/in/",
  uy: "site:uy.linkedin.com/in/",
  cr: "site:cr.linkedin.com/in/",
  ec: "site:ec.linkedin.com/in/",
  pa: "site:pa.linkedin.com/in/",
  es: "site:es.linkedin.com/in/",
  us: "site:www.linkedin.com/in/"
};

function setStatus(txt, color = "#057642") {
  statusDiv.style.color = color;
  statusDiv.textContent = txt;
}

function limpiarCamposVacante() {
  dbProyecto.value = "";
  dbJd.value = "";
  dbMensaje.value = "";
  dbMensajeLargo.value = "";
  jdOriginalCargada = "";
  aplicarDatosXrayEnUI(null, false);
}

// ============================================================================
// CONSTRUCCIÓN Y RENDER DE X-RAY SEARCH
// ============================================================================
function reconstruirQueryXray() {
  const sitePrefix = SITE_BY_COUNTRY[xrayCountry.value] || SITE_BY_COUNTRY.global;

  const rolesMarcados = Array.from(
    xrayRolesBox.querySelectorAll('input[type="checkbox"]:checked')
  ).map((inp) => `"${inp.value}"`);

  const skillsMarcadas = Array.from(
    xraySkillsBox.querySelectorAll('input[type="checkbox"]:checked')
  ).map((inp) => `"${inp.value}"`);

  const partes = [sitePrefix];

  if (rolesMarcados.length === 1) {
    partes.push(rolesMarcados[0]);
  } else if (rolesMarcados.length > 1) {
    partes.push(`(${rolesMarcados.join(" OR ")})`);
  }

  if (skillsMarcadas.length > 0) {
    partes.push(skillsMarcadas.join(" "));
  }

  xrayQuery.value = partes.join(" ");
}

function renderChipsXray(container, items, seleccionadosPorDefecto = false) {
  if (!Array.isArray(items) || items.length === 0) {
    container.innerHTML = '<span style="font-size:11px; color:#666;">Sin elementos extraídos</span>';
    return;
  }

  container.innerHTML = items
    .map((item) => {
      const checked = seleccionadosPorDefecto ? "checked" : "";
      const activeCls = seleccionadosPorDefecto ? "checked" : "";
      const safeVal = String(item).replace(/"/g, "&quot;");
      return `
        <label class="chip-item ${activeCls}">
          <input type="checkbox" value="${safeVal}" ${checked}>
          <span>${safeVal}</span>
        </label>
      `;
    })
    .join("");

  container.querySelectorAll('input[type="checkbox"]').forEach((chk) => {
    chk.addEventListener("change", () => {
      chk.closest(".chip-item").classList.toggle("checked", chk.checked);
      reconstruirQueryXray();
    });
  });
}

function aplicarDatosXrayEnUI(xrayObj, desdeCache = false) {
  if (!xrayObj) {
    xrayCountry.value = "global";
    xrayRolesBox.innerHTML =
      '<span style="font-size:11px; color:#666;">Pulsa ✨ IA para extraer términos de la JD</span>';
    xraySkillsBox.innerHTML =
      '<span style="font-size:11px; color:#666;">Aquí aparecerán las tecnologías (ej. .NET, React, AKS)</span>';
    xrayQuery.value = "";
    xrayCacheBadge.textContent = "Sin analizar";
    return;
  }

  const code = String(xrayObj.countryCode || "global").toLowerCase();
  xrayCountry.value = SITE_BY_COUNTRY[code] ? code : "global";

  renderChipsXray(xrayRolesBox, xrayObj.roles || [], false);
  const skills = Array.isArray(xrayObj.skills) ? xrayObj.skills : [];
  if (skills.length === 0) {
    renderChipsXray(xraySkillsBox, [], false);
  } else {
    xraySkillsBox.innerHTML = skills
      .map((item, idx) => {
        const isChecked = idx < 3;
        const safeVal = String(item).replace(/"/g, "&quot;");
        return `
          <label class="chip-item ${isChecked ? "checked" : ""}">
            <input type="checkbox" value="${safeVal}" ${isChecked ? "checked" : ""}>
            <span>${safeVal}</span>
          </label>
        `;
      })
      .join("");

    xraySkillsBox.querySelectorAll('input[type="checkbox"]').forEach((chk) => {
      chk.addEventListener("change", () => {
        chk.closest(".chip-item").classList.toggle("checked", chk.checked);
        reconstruirQueryXray();
      });
    });
  }

  xrayCacheBadge.textContent = desdeCache ? "💾 AGENTE_DB" : "✨ Guardado";
  reconstruirQueryXray();
}

async function extraerYGuardarXray() {
  const url = inputUrl.value.trim();
  const role = sheetSelect.value;
  const jdTexto = dbJd.value.trim();

  if (!role) {
    setStatus("⚠️ Selecciona primero un Role", "#c92a2a");
    return;
  }
  if (!jdTexto) {
    setStatus("⚠️ Este Role no tiene Job Description en AGENTE_DB", "#c92a2a");
    return;
  }

  btnXrayAnalyze.disabled = true;
  setStatus("⏳ Analizando JD con IA para X-Ray Search...", "#0a66c2");

  try {
    const resp = await chrome.runtime.sendMessage({
      action: "EXTRACT_XRAY_KEYWORDS",
      jd: jdTexto
    });

    if (!resp?.ok || !resp.data) {
      setStatus(resp?.error || "No se pudieron extraer características", "#c92a2a");
      return;
    }

    aplicarDatosXrayEnUI(resp.data, false);

    if (url) {
      await fetch(url, {
        method: "POST",
        body: JSON.stringify({
          action: "SAVE_XRAY_DATA",
          role,
          xrayJson: JSON.stringify(resp.data)
        })
      });
    }

    setStatus("✔ Características extraídas y guardadas en AGENTE_DB", "#057642");
  } catch (err) {
    setStatus(`❌ ${err?.message || "Error al analizar JD"}`, "#c92a2a");
  } finally {
    btnXrayAnalyze.disabled = false;
  }
}

// ============================================================================
// CARGA Y SINCRONIZACIÓN DE ROLES DE AGENTE_DB
// ============================================================================
async function cargarConfigDeRol(url, roleName) {
  if (!url || !roleName) {
    limpiarCamposVacante();
    return;
  }
  dbProyecto.value = "Cargando...";

  try {
    const resp = await fetch(`${url}?action=config&sheet=${encodeURIComponent(roleName)}`);
    const data = await resp.json();
    if (data.ok && data.config) {
      dbProyecto.value = data.config.proyecto || "";
      dbJd.value = data.config.jd || "";
      jdOriginalCargada = dbJd.value;
      dbMensaje.value = data.config.mensaje || "";
      dbMensajeLargo.value = data.config.mensajeLargo || "";

      if (data.config.xrayJson) {
        try {
          const parsed = JSON.parse(data.config.xrayJson);
          aplicarDatosXrayEnUI(parsed, true);
        } catch {
          aplicarDatosXrayEnUI(null, false);
        }
      } else {
        aplicarDatosXrayEnUI(null, false);
        const tabXrayActiva = document.getElementById("tab-xray").classList.contains("active");
        if (tabXrayActiva && dbJd.value.trim()) {
          await extraerYGuardarXray();
        }
      }
    } else {
      limpiarCamposVacante();
      setStatus(data.message || `No existe "${roleName}" en AGENTE_DB`, "#c92a2a");
    }
  } catch (e) {
    limpiarCamposVacante();
    setStatus("Error al leer AGENTE_DB", "#c92a2a");
  }
}

async function cargarPestanas(url, pestanaGuardada = "") {
  const selects = [sheetSelect, xrayRoleSelect, dbRoleSelect].filter(Boolean);

  if (!url) {
    selects.forEach((sel) => {
      sel.innerHTML = '<option value="">Configura URL en ⚙️ Config</option>';
    });
    limpiarCamposVacante();
    return;
  }

  selects.forEach((sel) => {
    sel.innerHTML = '<option value="">Cargando...</option>';
  });

  try {
    const resp = await fetch(`${url}?action=sheets`);
    const data = await resp.json();
    if (data.ok && Array.isArray(data.sheets)) {
      const optionsHtml = data.sheets
        .map((name) => `<option value="${name}">${name}</option>`)
        .join("");

      const rolActivo =
        pestanaGuardada && data.sheets.includes(pestanaGuardada)
          ? pestanaGuardada
          : data.sheets[0] || "";

      selects.forEach((sel) => {
        sel.innerHTML = optionsHtml;
        if (rolActivo) sel.value = rolActivo;
      });

      chrome.storage.local.set({ selectedSheet: rolActivo });
      await cargarConfigDeRol(url, rolActivo);
    } else {
      selects.forEach((sel) => {
        sel.innerHTML = '<option value="">Error al leer pestañas</option>';
      });
    }
  } catch (e) {
    selects.forEach((sel) => {
      sel.innerHTML = '<option value="">Error de conexión</option>';
    });
  }
}

function manejarCambioDeRol(nuevoRol) {
  if (!nuevoRol) return;
  [sheetSelect, xrayRoleSelect, dbRoleSelect].forEach((sel) => {
    if (sel && sel.value !== nuevoRol) {
      sel.value = nuevoRol;
    }
  });
  chrome.storage.local.set({ selectedSheet: nuevoRol });
  cargarConfigDeRol(inputUrl.value.trim(), nuevoRol);
}

sheetSelect.addEventListener("change", () => manejarCambioDeRol(sheetSelect.value));
xrayRoleSelect.addEventListener("change", () => manejarCambioDeRol(xrayRoleSelect.value));
dbRoleSelect.addEventListener("change", () => manejarCambioDeRol(dbRoleSelect.value));

document.getElementById("btn-refresh").addEventListener("click", () => {
  cargarPestanas(inputUrl.value.trim(), sheetSelect.value);
});
xrayBtnRefresh.addEventListener("click", () => {
  cargarPestanas(inputUrl.value.trim(), xrayRoleSelect.value);
});
dbBtnRefresh.addEventListener("click", () => {
  cargarPestanas(inputUrl.value.trim(), dbRoleSelect.value);
});

btnToggleNewRole.addEventListener("click", () => {
  newRoleBox.classList.toggle("open");
  if (newRoleBox.classList.contains("open")) {
    newRoleNameInput.focus();
  }
});

btnCreateRole.addEventListener("click", async () => {
  const url = inputUrl.value.trim();
  const nuevoRol = newRoleNameInput.value.trim().replace(/\s+/g, "_");
  if (!url) {
    setStatus("⚠️ Configura primero la URL en ⚙️ Config", "#c92a2a");
    return;
  }
  if (!nuevoRol) {
    setStatus("⚠️ Escribe un nombre para la nueva vacante", "#c92a2a");
    return;
  }

  btnCreateRole.disabled = true;
  setStatus(`⏳ Creando "${nuevoRol}" en Sheets y AGENTE_DB...`, "#0a66c2");

  try {
    const resp = await fetch(url, {
      method: "POST",
      body: JSON.stringify({
        action: "CREATE_ROLE",
        role: nuevoRol,
        proyecto: "",
        jd: "",
        mensaje: "",
        mensajeLargo: "",
        xrayJson: ""
      })
    });
    const data = await resp.json();
    if (data.ok) {
      newRoleNameInput.value = "";
      newRoleBox.classList.remove("open");
      await cargarPestanas(url, nuevoRol);
      setStatus(`✔ Vacante "${nuevoRol}" creada (pestaña + AGENTE_DB)`, "#057642");
    } else {
      setStatus(data.message || "No se pudo crear la vacante", "#c92a2a");
    }
  } catch (e) {
    setStatus("Error de red al crear vacante", "#c92a2a");
  } finally {
    btnCreateRole.disabled = false;
  }
});

chrome.storage.local.get(
  [
    "sheetWebhookUrl",
    "openaiKey",
    "selectedSheet",
    "minMatch",
    "autoCloseTab",
    "autoConnect",
    "autoRecruiter",
    "dryRunMode",
    "batchState"
  ],
  (data) => {
    if (data.sheetWebhookUrl) {
      inputUrl.value = data.sheetWebhookUrl;
      cargarPestanas(data.sheetWebhookUrl, data.selectedSheet);
    }
    if (data.openaiKey) inputKey.value = data.openaiKey;
    if (typeof data.minMatch === "number") minMatchInput.value = data.minMatch;
    if (typeof data.autoCloseTab === "boolean") chkCloseTab.checked = data.autoCloseTab;
    if (typeof data.autoConnect === "boolean") chkConnect.checked = data.autoConnect;
    if (typeof data.autoRecruiter === "boolean") chkRecruiter.checked = data.autoRecruiter;
    if (typeof data.dryRunMode === "boolean") chkDryRun.checked = data.dryRunMode;
    if (data.batchState?.active) {
      btnStart.style.display = "none";
      btnStop.style.display = "block";
      setStatus(`⏳ Lote activo en fila ${data.batchState.currentRow}...`, "#0a66c2");
    }
  }
);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  if (changes.selectedSheet?.newValue) {
    const nuevoRol = changes.selectedSheet.newValue;
    const existeOpcion = Array.from(sheetSelect?.options || []).some(
      (opt) => opt.value === nuevoRol
    );

    if (existeOpcion && sheetSelect.value !== nuevoRol) {
      [sheetSelect, xrayRoleSelect, dbRoleSelect].forEach((sel) => {
        if (sel && sel.value !== nuevoRol) {
          sel.value = nuevoRol;
        }
      });
      cargarConfigDeRol(inputUrl.value.trim(), nuevoRol);
    }
  }

  if (changes.batchState) {
    const st = changes.batchState.newValue;
    if (st?.active) {
      btnStart.style.display = "none";
      btnStop.style.display = "block";
      setStatus(`⏳ Lote activo en fila ${st.currentRow}...`, "#0a66c2");
    } else {
      btnStart.style.display = "block";
      btnStop.style.display = "none";
    }
  }
});

// Eventos pestaña X-Ray
xrayCountry.addEventListener("change", reconstruirQueryXray);
btnXrayAnalyze.addEventListener("click", () => extraerYGuardarXray());

btnXrayCopy.addEventListener("click", async () => {
  const q = xrayQuery.value.trim();
  if (!q) return;
  await navigator.clipboard.writeText(q);
  setStatus("✔ Búsqueda X-Ray copiada al portapapeles", "#057642");
});

btnXrayOpen.addEventListener("click", () => {
  const q = xrayQuery.value.trim();
  if (!q) {
    setStatus("⚠️ Genera o escribe primero la búsqueda X-Ray", "#c92a2a");
    return;
  }
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  chrome.tabs.create({ url: googleUrl });
});

document.querySelector('[data-tab="tab-xray"]').addEventListener("click", () => {
  if (xrayCacheBadge.textContent === "Sin analizar" && dbJd.value.trim()) {
    extraerYGuardarXray();
  }
});

// Guardar cambios de AGENTE_DB directo en Sheets (y crear fila/pestaña si no existían)
document.getElementById("btn-save-db").addEventListener("click", async () => {
  const url = inputUrl.value.trim();
  const role = sheetSelect.value;
  if (!url || !role) return;

  const nuevaJd = dbJd.value.trim();
  const cambioJd = nuevaJd !== jdOriginalCargada;

  setStatus("⏳ Guardando en AGENTE_DB...", "#0a66c2");
  try {
    const payload = {
      action: "UPDATE_CONFIG",
      role,
      proyecto: dbProyecto.value.trim(),
      jd: nuevaJd,
      mensaje: dbMensaje.value.trim(),
      mensajeLargo: dbMensajeLargo.value.trim()
    };

    if (cambioJd) {
      payload.xrayJson = "";
    }

    const resp = await fetch(url, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    if (data.ok) {
      jdOriginalCargada = nuevaJd;
      if (cambioJd) {
        aplicarDatosXrayEnUI(null, false);
      }
      setStatus(`✔ "${role}" actualizado en AGENTE_DB`, "#057642");
    } else {
      setStatus(data.message || "Error al guardar", "#c92a2a");
    }
  } catch (e) {
    setStatus("Error de red al guardar en Sheets", "#c92a2a");
  }
});

// Guardar Config
document.getElementById("btn-save-cfg").addEventListener("click", async () => {
  const url = inputUrl.value.trim();
  const key = inputKey.value.trim();
  await chrome.storage.local.set({ sheetWebhookUrl: url, openaiKey: key });
  setStatus("✔ Configuración guardada", "#057642");
  await cargarPestanas(url, sheetSelect.value);
});

// Iniciar evaluación individual o por lote (Fila inicio -> Fila fin)
btnStart.addEventListener("click", async () => {
  const sheetName = sheetSelect.value;
  const startRow = rowStartInput.value ? parseInt(rowStartInput.value, 10) : null;
  const endRow = rowEndInput.value ? parseInt(rowEndInput.value, 10) : null;
  const minMatch = parseInt(minMatchInput.value, 10) || 75;

  await chrome.storage.local.set({
    selectedSheet: sheetName,
    minMatch,
    autoCloseTab: chkCloseTab.checked,
    autoConnect: chkConnect.checked,
    autoRecruiter: chkRecruiter.checked,
    dryRunMode: chkDryRun.checked
  });

  if (startRow && endRow && endRow >= startRow) {
    btnStart.style.display = "none";
    btnStop.style.display = "block";
    setStatus(`⏳ Iniciando lote filas ${startRow} a ${endRow}...`, "#0a66c2");

    const resp = await chrome.runtime.sendMessage({
      action: "START_BATCH",
      sheetName,
      startRow,
      endRow
    });
    if (!resp?.ok) {
      btnStart.style.display = "block";
      btnStop.style.display = "none";
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

// Detener lote
btnStop.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ action: "STOP_BATCH" });
  btnStart.style.display = "block";
  btnStop.style.display = "none";
  setStatus("⏹ Lote detenido por el usuario", "#c92a2a");
});