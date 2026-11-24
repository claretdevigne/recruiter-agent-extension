// ============================================================================
// BACKGROUND SERVICE WORKER (EVALUACIÓN IA + LOTE + RECRUITER + X-RAY + ÍNDICE DB)
// ============================================================================

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Candado para evitar que dos evaluaciones o avances de lote se encimen
let loteEnProceso = false;
let evaluacionActivaTabId = null;
const pestanasYaDisparadas = new Set();

function normalizarSlugLinkedIn(urlOrSlug = "") {
  const match = String(urlOrSlug).match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (match && match[1]) {
    return decodeURIComponent(match[1]).toLowerCase().replace(/\/+$/, "");
  }
  return String(urlOrSlug)
    .replace(/^.*\/in\//i, "")
    .split(/[/?#]/)[0]
    .trim()
    .toLowerCase();
}

// ============================================================================
// ÍNDICE EN CACHÉ DE PERFILES EN GOOGLE SHEETS (PARA BADGES EN GOOGLE Y LINKEDIN)
// ============================================================================
async function sincronizarIndiceDb(forzar = false) {
  const { sheetWebhookUrl, dbIndexCache } = await chrome.storage.local.get([
    "sheetWebhookUrl",
    "dbIndexCache"
  ]);

  const maxEdadMs = 5 * 60 * 1000; // 5 minutos
  if (
    !forzar &&
    dbIndexCache?.bySlug &&
    dbIndexCache.updatedAt &&
    Date.now() - dbIndexCache.updatedAt < maxEdadMs
  ) {
    return { ok: true, bySlug: dbIndexCache.bySlug, cached: true };
  }

  if (!sheetWebhookUrl) {
    return { ok: false, error: "Falta URL de Google Apps Script" };
  }

  const resp = await fetch(`${sheetWebhookUrl}?action=index`);
  const data = await resp.json();
  if (!data?.ok || !Array.isArray(data.entries)) {
    return { ok: false, error: data?.message || "No se pudo leer el índice de la DB" };
  }

  const bySlug = {};
  for (const item of data.entries) {
    const slug = normalizarSlugLinkedIn(item.url);
    if (!slug) continue;
    if (!bySlug[slug]) bySlug[slug] = [];
    bySlug[slug].push({
      role: item.role,
      row: item.row,
      match: item.match,
      checked: item.checked
    });
  }

  const cachePayload = { bySlug, updatedAt: Date.now() };
  await chrome.storage.local.set({ dbIndexCache: cachePayload });
  return { ok: true, bySlug, cached: false };
}

// ============================================================================
// CONSULTAS A AGENTE_DB (ROLES Y CONFIGURACIÓN DE VACANTE)
// ============================================================================
async function obtenerListaRoles() {
  const { sheetWebhookUrl } = await chrome.storage.local.get(["sheetWebhookUrl"]);
  if (!sheetWebhookUrl) {
    return { ok: false, error: "Falta URL de Google Apps Script en ⚙️ Config" };
  }

  const resp = await fetch(`${sheetWebhookUrl}?action=sheets`);
  const data = await resp.json();
  if (!data?.ok) {
    return { ok: false, error: data?.message || "Error al listar pestañas" };
  }
  return { ok: true, sheets: data.sheets || [] };
}

async function obtenerConfigRol(role) {
  const { sheetWebhookUrl } = await chrome.storage.local.get(["sheetWebhookUrl"]);
  if (!sheetWebhookUrl) {
    return { ok: false, error: "Falta URL de Google Apps Script en ⚙️ Config" };
  }

  const resp = await fetch(
    `${sheetWebhookUrl}?action=config&sheet=${encodeURIComponent(role)}`
  );
  const data = await resp.json();
  if (!data?.ok) {
    return { ok: false, error: data?.message || "No se encontró el rol en AGENTE_DB" };
  }
  return { ok: true, config: data.config };
}

// ============================================================================
// LECTURA DE SUBPÁGINAS DE EXPERIENCIA EN SEGUNDO PLANO
// ============================================================================
async function obtenerTextoSubpagina(url) {
  let tabId = null;
  try {
    const tab = await chrome.tabs.create({ url, active: false });
    tabId = tab.id;

    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 10000);
      const listener = (id, info) => {
        if (id === tabId && info.status === "complete") {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });

    await esperar(1200);

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const main = document.querySelector("main") || document.body;
        return (main.innerText || "").trim();
      }
    });

    return { ok: true, texto: result || "" };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    if (tabId) {
      chrome.tabs.remove(tabId).catch(() => {});
    }
  }
}

// ============================================================================
// LLAMADAS A OPENAI (EVALUACIÓN DE CANDIDATO, MANUAL Y EXTRACCIÓN X-RAY)
// ============================================================================
async function evaluarPerfilConOpenAI(perfilTexto, jd) {
  const { openaiKey } = await chrome.storage.local.get(["openaiKey"]);
  if (!openaiKey) {
    throw new Error("Falta configurar OpenAI API Key en ⚙️ Config");
  }

  const prompt = `Evalúa qué tanto encaja este perfil de LinkedIn con la Job Description (JD).
Devuelve únicamente JSON con:
- "porcentaje": número entero de 0 a 100.
- "razon": explicación breve en español (máximo 2 líneas).

JOB DESCRIPTION:
${jd}

PERFIL DE LINKEDIN:
${perfilTexto.slice(0, 12000)}`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.1,
      messages: [{ role: "user", content: prompt }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "candidate_match_evaluation",
          strict: true,
          schema: {
            type: "object",
            properties: {
              porcentaje: { type: "integer" },
              razon: { type: "string" }
            },
            required: ["porcentaje", "razon"],
            additionalProperties: false
          }
        }
      }
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenAI HTTP ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  return JSON.parse(data.choices[0].message.content);
}

async function evaluarManualSoloLectura(perfilTexto, jdTexto) {
  const res = await evaluarPerfilConOpenAI(perfilTexto, jdTexto);
  return {
    ok: true,
    porcentaje: res.porcentaje,
    analisis: `Match: ${res.porcentaje}%\n\n${res.razon}`
  };
}

async function extraerKeywordsXRayConOpenAI(jd) {
  const { openaiKey } = await chrome.storage.local.get(["openaiKey"]);
  if (!openaiKey) {
    return { ok: false, error: "Falta configurar OpenAI API Key en ⚙️ Config" };
  }

  const prompt = `Analiza la siguiente Job Description y extrae términos clave cortos para armar una búsqueda booleana X-Ray en Google sobre LinkedIn (site:xx.linkedin.com/in/).

JOB DESCRIPTION:
${jd}

Reglas estrictas:
1. "countryCode": Si la JD exige un país específico, devuelve su código ISO de 2 letras en minúscula ("co", "mx", "ar", "cl", "pe", "br", "uy", "cr", "ec", "pa", "es", "us"). Si dice "LATAM", "Remoto", varios países o no especifica país, devuelve exactamente "global".
2. "roles": Lista de 2 a 5 títulos cortos de puesto habituales en perfiles de LinkedIn (ej. "Full Stack", "Backend", "DevOps", "Power Platform Developer"). Sin palabras de relleno.
3. "skills": Lista de 6 a 14 tecnologías, lenguajes, frameworks, nubes o herramientas concretas mencionadas en la JD (ej. ".NET", "React", "AKS", "Azure", "C#", "Kubernetes"), ordenadas de la más crítica a la complementaria.`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.1,
      messages: [{ role: "user", content: prompt }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "xray_keywords_extraction",
          strict: true,
          schema: {
            type: "object",
            properties: {
              countryCode: { type: "string" },
              roles: {
                type: "array",
                items: { type: "string" }
              },
              skills: {
                type: "array",
                items: { type: "string" }
              }
            },
            required: ["countryCode", "roles", "skills"],
            additionalProperties: false
          }
        }
      }
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenAI HTTP ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const parsed = JSON.parse(data.choices[0].message.content);
  return { ok: true, data: parsed };
}

// ============================================================================
// ACTUALIZACIÓN EN GOOGLE SHEETS
// ============================================================================
async function guardarResultadoEnSheets({ sheet, row, porcentaje, marcarX }) {
  const { sheetWebhookUrl } = await chrome.storage.local.get(["sheetWebhookUrl"]);
  if (!sheetWebhookUrl || !sheet || !row) return;

  const payload = { sheet, row };
  if (typeof porcentaje === "number") payload.porcentaje = porcentaje;
  if (marcarX === true) payload.marcarX = true;

  await fetch(sheetWebhookUrl, {
    method: "POST",
    body: JSON.stringify(payload)
  });

  sincronizarIndiceDb(true).catch(() => {});
}

// ============================================================================
// APERTURA DE CANDIDATO Y CONTROL DE LOTE (ORDENADO Y SIN SOLAPAMIENTOS)
// ============================================================================
async function abrirSiguienteCandidato(sheetName, row = null) {
  const { sheetWebhookUrl } = await chrome.storage.local.get(["sheetWebhookUrl"]);
  if (!sheetWebhookUrl) {
    return { ok: false, error: "Falta URL de Google Apps Script en ⚙️ Config" };
  }

  let queryUrl = `${sheetWebhookUrl}?action=next&sheet=${encodeURIComponent(sheetName)}`;
  if (row) queryUrl += `&row=${encodeURIComponent(row)}`;

  const resp = await fetch(queryUrl);
  const data = await resp.json();

  if (!data?.ok) {
    return {
      ok: false,
      endOfSheet: Boolean(data?.endOfSheet),
      skipRow: Boolean(data?.skipRow),
      error: data?.message || "No se encontró candidato"
    };
  }

  const tab = await chrome.tabs.create({ url: data.url, active: true });
  pestanasYaDisparadas.delete(tab.id);

  await chrome.storage.local.set({
    candidatoActual: {
      tabId: tab.id,
      sheet: data.sheet,
      row: data.row,
      url: data.url,
      config: data.config,
      autoExtract: true
    }
  });

  return { ok: true, tabId: tab.id, row: data.row, sheet: data.sheet };
}

async function avanzarLoteSiCorresponde() {
  if (loteEnProceso) return;
  loteEnProceso = true;

  try {
    const { batchState } = await chrome.storage.local.get(["batchState"]);
    if (!batchState?.active) return;

    const siguienteFila = (batchState.currentRow || batchState.startRow) + 1;
    if (siguienteFila > batchState.endRow) {
      await chrome.storage.local.remove("batchState");
      return;
    }

    const nuevoEstado = { ...batchState, currentRow: siguienteFila };
    await chrome.storage.local.set({ batchState: nuevoEstado });

    const res = await abrirSiguienteCandidato(batchState.sheetName, siguienteFila);
    if (!res.ok) {
      if (res.skipRow && siguienteFila < batchState.endRow) {
        loteEnProceso = false;
        await avanzarLoteSiCorresponde();
        return;
      }
      await chrome.storage.local.remove("batchState");
    }
  } finally {
    loteEnProceso = false;
  }
}

// Disparar AUTO_EXTRACT UNA SOLA VEZ cuando la pestaña abierta termine de cargar
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab?.url || !tab.url.includes("linkedin.com/in/")) return;

  const { candidatoActual, batchState } = await chrome.storage.local.get([
    "candidatoActual",
    "batchState"
  ]);

  if (
    candidatoActual?.tabId === tabId &&
    candidatoActual?.autoExtract &&
    !pestanasYaDisparadas.has(tabId) &&
    evaluacionActivaTabId === null
  ) {
    pestanasYaDisparadas.add(tabId);
    evaluacionActivaTabId = tabId;

    await chrome.storage.local.set({
      candidatoActual: { ...candidatoActual, autoExtract: false }
    });

    await esperar(1200);
    chrome.tabs.sendMessage(tabId, { action: "AUTO_EXTRACT" }).catch(() => {
      if (evaluacionActivaTabId === tabId) {
        evaluacionActivaTabId = null;
      }
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  pestanasYaDisparadas.delete(tabId);
  if (evaluacionActivaTabId === tabId) {
    evaluacionActivaTabId = null;
  }
});

// ============================================================================
// LISTENER PRINCIPAL DE MENSAJES
// ============================================================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "GET_DB_INDEX") {
    sincronizarIndiceDb(Boolean(msg.force))
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.action === "GET_ROLES_LIST") {
    obtenerListaRoles()
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.action === "GET_ROLE_CONFIG") {
    obtenerConfigRol(msg.role)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.action === "FETCH_SUBPAGE_TEXT") {
    obtenerTextoSubpagina(msg.url)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.action === "EXTRACT_XRAY_KEYWORDS") {
    extraerKeywordsXRayConOpenAI(msg.jd)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.action === "EVALUATE_MANUAL_ONLY") {
    evaluarManualSoloLectura(msg.perfilTexto || "", msg.jdTexto || "")
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.action === "OPEN_FROM_SHEETS") {
    abrirSiguienteCandidato(msg.sheetName, msg.row || null)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.action === "START_BATCH") {
    (async () => {
      evaluacionActivaTabId = null;
      pestanasYaDisparadas.clear();

      const state = {
        active: true,
        sheetName: msg.sheetName,
        startRow: msg.startRow,
        endRow: msg.endRow,
        currentRow: msg.startRow
      };
      await chrome.storage.local.set({ batchState: state });

      const res = await abrirSiguienteCandidato(msg.sheetName, msg.startRow);
      if (!res.ok) {
        if (res.skipRow && msg.startRow < msg.endRow) {
          await avanzarLoteSiCorresponde();
          sendResponse({ ok: true });
        } else {
          await chrome.storage.local.remove("batchState");
          sendResponse(res);
        }
      } else {
        sendResponse(res);
      }
    })();
    return true;
  }

  if (msg.action === "STOP_BATCH") {
    evaluacionActivaTabId = null;
    chrome.storage.local.remove("batchState").then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.action === "EVALUATE_AND_UPDATE_SHEETS") {
    (async () => {
      const tabOrigenId = sender?.tab?.id ?? evaluacionActivaTabId;
      try {
        const {
          candidatoActual,
          selectedSheet,
          minMatch,
          autoConnect,
          autoRecruiter,
          dryRunMode
        } = await chrome.storage.local.get([
          "candidatoActual",
          "selectedSheet",
          "minMatch",
          "autoConnect",
          "autoRecruiter",
          "dryRunMode"
        ]);

        let config = candidatoActual?.config;
        let sheet = candidatoActual?.sheet || selectedSheet;
        let row = candidatoActual?.row || null;

        if (!config?.jd && sheet) {
          const cfgResp = await obtenerConfigRol(sheet);
          if (cfgResp.ok) config = cfgResp.config;
        }

        if (!config?.jd) {
          if (evaluacionActivaTabId === tabOrigenId) evaluacionActivaTabId = null;
          sendResponse({ ok: false, error: "No hay JD configurada para este rol" });
          return;
        }

        const evalRes = await evaluarPerfilConOpenAI(msg.perfilTexto || "", config.jd);
        if (sheet && row) {
          await guardarResultadoEnSheets({
            sheet,
            row,
            porcentaje: evalRes.porcentaje
          });
        }

        const umbral = typeof minMatch === "number" ? minMatch : 75;
        const cumple = evalRes.porcentaje >= umbral;

        sendResponse({
          ok: true,
          porcentaje: evalRes.porcentaje,
          razon: evalRes.razon,
          config,
          ejecutarConectar: Boolean(autoConnect && cumple),
          ejecutarRecruiter: Boolean(autoRecruiter && cumple),
          modoPrueba: dryRunMode !== false
        });
      } catch (err) {
        if (evaluacionActivaTabId === tabOrigenId) evaluacionActivaTabId = null;
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  if (msg.action === "OPEN_RECRUITER_TAB") {
    (async () => {
      try {
        const { dryRunMode, candidatoActual } = await chrome.storage.local.get([
          "dryRunMode",
          "candidatoActual"
        ]);
        await chrome.storage.local.set({
          recruiterTask: {
            pending: true,
            config: candidatoActual?.config || {},
            nombreCandidato: msg.nombreCandidato || "",
            contactoRealizado: Boolean(msg.contactoRealizado),
            dryRunMode: dryRunMode !== false,
            sourceTabId: sender?.tab?.id || null
          }
        });
        await chrome.tabs.create({ url: msg.url, active: true });
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  if (msg.action === "PROFILE_ACTIONS_DONE") {
    (async () => {
      const { autoCloseTab, dryRunMode, batchState } = await chrome.storage.local.get([
        "autoCloseTab",
        "dryRunMode",
        "batchState"
      ]);

      if (!msg.abrioRecruiter) {
        if (!dryRunMode && autoCloseTab && sender?.tab?.id) {
          await esperar(600);
          chrome.tabs.remove(sender.tab.id).catch(() => {});
        }
        evaluacionActivaTabId = null;
        if (batchState?.active) {
          await avanzarLoteSiCorresponde();
        }
      }

      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.action === "RECRUITER_DONE") {
    (async () => {
      const { recruiterTask, autoCloseTab, dryRunMode, candidatoActual, batchState } =
        await chrome.storage.local.get([
          "recruiterTask",
          "autoCloseTab",
          "dryRunMode",
          "candidatoActual",
          "batchState"
        ]);

      if (!dryRunMode && msg.guardado !== false && candidatoActual?.sheet && candidatoActual?.row) {
        await guardarResultadoEnSheets({
          sheet: candidatoActual.sheet,
          row: candidatoActual.row,
          marcarX: true
        });
      }

      await chrome.storage.local.remove("recruiterTask");

      if (!dryRunMode && autoCloseTab) {
        if (sender?.tab?.id) {
          chrome.tabs.remove(sender.tab.id).catch(() => {});
        }
        if (recruiterTask?.sourceTabId) {
          chrome.tabs.remove(recruiterTask.sourceTabId).catch(() => {});
        }
      }

      evaluacionActivaTabId = null;
      if (batchState?.active) {
        await avanzarLoteSiCorresponde();
      }
      sendResponse({ ok: true });
    })();
    return true;
  }
});

// Atajo de teclado Alt+Shift+E para ejecutar extracción en el perfil activo
chrome.commands?.onCommand.addListener(async (command) => {
  if (command !== "run-extractor") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: "START_EXTRACTION" }).catch(() => {});
  }
});