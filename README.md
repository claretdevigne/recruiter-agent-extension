LinkedIn AI Recruiter & X-Ray Assistant
Extensión de navegador (Manifest V3) conectada a Google Sheets (mediante una Web App en Google Apps Script) y a la API de OpenAI (gpt-4o-mini) para agilizar el sourcing booleano X-Ray, la evaluación automática de perfiles de LinkedIn contra una Job Description (JD) y las acciones de contacto/guardado en LinkedIn y LinkedIn Recruiter.

1. Qué es y cómo funciona el proyecto
El sistema opera sobre todo el flujo de reclutamiento técnico:

Sourcing X-Ray (popup.html / popup.js + background.js):

Lee o analiza la JD de una vacante (Role) con gpt-4o-mini mediante json_schema estricto para extraer código de país (countryCode), títulos de rol (roles) y tecnologías/habilidades (skills).

Construye en vivo una búsqueda booleana site:[xx.linkedin.com/in/](https://xx.linkedin.com/in/)..., permite copiarla o abrirla en Google Search y guarda el resultado en caché en la columna XRay_JSON (Columna F) de la hoja AGENTE_DB (invalidándose si cambia la JD).

Evaluación individual o por lotes (popup.js, sheets_widget.js, background.js, extractor.js):

Permite evaluar un candidato individual (por fila o siguiente pendiente) o un rango de filas (Fila inicio a Fila fin) en una pestaña de rol de Google Sheets.

Abre el perfil /in/ en LinkedIn, fuerza la carga del DOM con scroll y expansión de textos, lee subpáginas de experiencia cuando existen y envía el texto extraído a background.js para evaluarlo contra la JD con gpt-4o-mini (devolviendo porcentaje entero de 0 a 100 y razon).

Guarda el % de Match en la hoja del rol (Columna B, formato porcentaje) y, si cumple el umbral mínimo configurado (minMatch), puede ejecutar conexión con nota corta y/o abrir el perfil en LinkedIn Recruiter.

Automatización en LinkedIn Recruiter (recruiter.js + background.js):

En perfiles o flujos vinculados a LinkedIn Recruiter (/talent/), guarda al candidato en el proyecto configurado en AGENTE_DB (respetando dryRunMode / Modo Prueba), notifica RECRUITER_DONE para marcar "X" en la Columna A del Sheet (cuando aplica) y avanzar el lote.

En vistas de proyecto de Recruiter, monta un botón/panel flotante para consultar y copiar el Mensaje Largo (Columna E) por rol.

Insignias de estado y widget flotante (db_badges.js, sheets_widget.js, manifest.json):

Mantiene un índice de perfiles en caché en chrome.storage.local (con TTL de 5 minutos, refrescado tras escrituras) para pintar insignias en resultados de Google y perfiles de LinkedIn.

Despliega un panel flotante y arrastrable dentro del Google Sheet de trabajo para controlar lotes sin abrir el popup.

2. Estructura de archivos y arquitectura
manifest.json: Define Manifest V3, permisos (activeTab, scripting, storage, tabs), host_permissions para OpenAI, Google Apps Script, LinkedIn y dominios de búsqueda de Google, el service worker background.js, el popup popup.html, los content_scripts (extractor.js, recruiter.js, sheets_widget.js, db_badges.js) y el comando Alt+Shift+E (run-extractor).

Código.gs: Web App de Google Apps Script (doGet y doPost) que gestiona AGENTE_DB (Role, JD, Mensaje, Proyecto, MensajeLargo, XRay_JSON) y las pestañas de cada vacante (Check en Columna A, Match en Columna B, URL en Columna C).

popup.html / popup.js: Interfaz principal con pestañas Ejecutar, X-Ray, Vacante y Config, selectores de rol sincronizados, creación de vacantes (CREATE_ROLE), edición/guardado de config (UPDATE_CONFIG), generador X-Ray y control de evaluación individual o por lote.

background.js: Service worker central que orquesta llamadas a Google Apps Script y OpenAI, administra el estado del lote (batchState), abre pestañas y subpáginas, dispara AUTO_EXTRACT una sola vez por pestaña con control de concurrencia (loteEnProceso, evaluacionActivaTabId, pestanasYaDisparadas) y coordina PROFILE_ACTIONS_DONE y RECRUITER_DONE.

extractor.js: Content script en *://*[.linkedin.com/in/](https://.linkedin.com/in/)*. Extrae encabezado y secciones del perfil, muestra el HUD/sonido para matches altos, ejecuta conexión con nota corta ({nombre}), abre Recruiter si corresponde y ofrece barra flotante con copia manual, modal Consultar Match (Solo lectura) y modal Conectar / Guardar en Proyecto.

recruiter.js: Content script en *://*[.linkedin.com/talent/](https://.linkedin.com/talent/)*. Automatiza guardar en proyecto existente (con soporte para inputs controlados de React/Ember y modo prueba), reporta RECRUITER_DONE y muestra el panel de Mensaje Largo en vistas de proyecto.

db_badges.js: Content script en búsquedas de Google y perfiles /in/ de LinkedIn para mostrar insignias de estado basadas en el índice de Sheets.

sheets_widget.js: Content script en la hoja de cálculo de trabajo (1IgctcXouhK3QRIO-4LDhf4uTOWV8XuM-M7omzqowF6Y), arrastrable y minimizable, sincronizado con chrome.storage.local para iniciar o detener evaluaciones y lotes.

3. Referencia detallada de funciones por módulo
background.js
Utilidades y caché de índice:

esperar(ms): Pausa asíncrona basada en Promise y setTimeout.

normalizarSlugLinkedIn(urlOrSlug): Extrae y normaliza el slug del perfil a partir de una URL o ruta /in/... (minúsculas, decodificada y sin barras finales).

sincronizarIndiceDb(forzar = false): Consulta ?action=index en Apps Script (respetando caché de 5 minutos en dbIndexCache salvo forzar = true) y agrupa entradas por slug (role, row, match, checked).

Consultas a AGENTE_DB:

obtenerListaRoles(): Llama a ?action=sheets y devuelve la lista de pestañas de roles.

obtenerConfigRol(role): Llama a ?action=config&sheet=<role> y devuelve la configuración de la vacante.

Subpáginas e integración con OpenAI:

obtenerTextoSubpagina(url): Abre una pestaña inactiva (active: false), espera complete + 1200ms, extrae el innerText de main o body con chrome.scripting.executeScript y cierra la pestaña en finally.

evaluarPerfilConOpenAI(perfilTexto, jd): Envía el perfil (recortado a 12,000 caracteres) y la JD a [https://api.openai.com/v1/chat/completions](https://api.openai.com/v1/chat/completions) con modelo gpt-4o-mini y response_format json_schema estricto (porcentaje entero y razon breve).

evaluarManualSoloLectura(perfilTexto, jdTexto): Reutiliza evaluarPerfilConOpenAI y formatea el texto de salida (Match: XX% + razón) sin escribir en Google Sheets.

extraerKeywordsXRayConOpenAI(jd): Solicita a gpt-4o-mini un JSON estricto con countryCode, roles y skills a partir de la JD para búsquedas X-Ray.

Escritura en Sheets y control de lotes:

guardarResultadoEnSheets({ sheet, row, porcentaje, marcarX }): Envía un POST a la URL del Web App para actualizar % de match y/o marcarX, y dispara un refresco del índice en segundo plano.

abrirSiguienteCandidato(sheetName, row = null): Consulta ?action=next (con &row= opcional), crea la pestaña del candidato y guarda candidatoActual en chrome.storage.local.

avanzarLoteSiCorresponde(): Protegido por loteEnProceso; calcula siguienteFila, actualiza batchState.currentRow, abre el siguiente candidato o salta filas omitibles (skipRow) hasta terminar el rango o limpiar batchState.

Listeners:

chrome.tabs.onUpdated: Dispara AUTO_EXTRACT una sola vez por tabId cuando status === "complete" y evaluacionActivaTabId === null.

chrome.tabs.onRemoved: Limpia pestanasYaDisparadas y libera evaluacionActivaTabId si se cierra la pestaña activa.

chrome.runtime.onMessage: Enruta GET_DB_INDEX, GET_ROLES_LIST, GET_ROLE_CONFIG, FETCH_SUBPAGE_TEXT, EXTRACT_XRAY_KEYWORDS, EVALUATE_MANUAL_ONLY, OPEN_FROM_SHEETS, START_BATCH, STOP_BATCH, EVALUATE_AND_UPDATE_SHEETS, OPEN_RECRUITER_TAB, PROFILE_ACTIONS_DONE y RECRUITER_DONE.

chrome.commands?.onCommand: Escucha run-extractor (Alt+Shift+E) y envía START_EXTRACTION a la pestaña activa.

extractor.js
Extracción de perfil:

identificarSeccion(linea): Clasifica encabezados de sección (ACERCA DE, EXPERIENCIA, EDUCACIÓN, LICENCIAS Y CERTIFICACIONES, APTITUDES) en español e inglés.

expandirBotonesVerMas(): Hace clic en botones de expansión (ver más, más, see more, more).

forzarCargaDOM(): Localiza el contenedor con scroll y hace un recorrido vertical escalonado para forzar la carga perezosa del DOM antes de volver a la posición original.

obtenerDatosPerfil(onStatusUpdate): Coordina scroll, expansión, lectura opcional de experiencia completa vía FETCH_SUBPAGE_TEXT, parseo de encabezado y secciones, y arma datos.textoCompleto.

HUD y efectos:

reproducirSonidoLevelUp(): Genera una secuencia corta de notas con Web Audio API (AudioContext) si el navegador lo permite.

mostrarHudMatchVideojuego(porcentaje, duracionMs): Muestra una tarjeta animada con contador progresivo y barra de puntaje para matches altos.

Acciones y flujos:

copiarAlPortapapeles(texto): Copia texto al portapapeles mediante un textarea temporal y execCommand("copy").

esperar(ms): Promesa de retardo en milisegundos.

conectarConNotaCorta(mensajeCorto, nombreCompleto, modoPrueba, actualizarEstado): Localiza Conectar (o Más → Conectar), busca Añadir nota, rellena el mensaje sustituyendo {nombre} (máximo 300 caracteres) y envía la invitación si modoPrueba es false.

abrirEnRecruiterDesdePerfil(nombreCandidato, actualizarEstado, contactoRealizado): Busca Ver en Recruiter / View in Recruiter y solicita OPEN_RECRUITER_TAB (o hace clic directo si no hay href).

ejecutarFlujoAutomatico(): Extrae el perfil, lo copia, invoca EVALUATE_AND_UPDATE_SHEETS, muestra el HUD si porcentaje > 80, ejecuta conexión y/o Recruiter si corresponde y notifica siempre PROFILE_ACTIONS_DONE.

ejecutarCopiaManual(): Extrae el perfil y lo copia al portapapeles sin llamar a OpenAI ni modificar Sheets.

abrirModalConsultaMatch(): Abre/alterna el modal de consulta manual de match (solo lectura, sin tocar Sheets) con selector de rol, edición de JD y copia del resultado.

abrirModalConectarProyecto(): Abre/alterna el modal manual para cargar proyecto y mensaje de un rol y ejecutar conexión y/o apertura en Recruiter.

montarBotonesFlotantes(): Inserta la barra inferior derecha con los botones Conectar / Proyecto, Consultar Match y Copiar perfil.

recruiter.js
Helpers de DOM y mensajería:

esperar(ms): Pausa asíncrona en milisegundos.

querySelectorAllDeep(selector, root): Recorre elementos incluyendo shadowRoot abiertos.

esVisible(el): Verifica estilos de visibilidad y dimensiones (width > 0 && height > 0).

mostrarEstadoRecruiter(texto, color) / ocultarEstadoRecruiter(delayMs): Muestra y oculta la insignia flotante de estado en la esquina inferior izquierda.

buscarElementoPorTexto(selector, regex, soloVisibles) / esperarElementoPorTexto(selector, regex, timeoutMs): Busca o espera de forma periódica un elemento que coincida con la expresión regular.

clicReal(el): Dispara mousedown, mouseup y click.

escribirEnInputReact(input, valor): Asigna el valor usando el setter nativo de HTMLInputElement.prototype.value y dispara input, change y keyup.

simularTecla(elemento, key, code, keyCode): Emite eventos de teclado (keydown, keypress, keyup).

enviarMensajeExtensionConReintento(payload, reintentos): Envía mensajes a chrome.runtime con reintentos ante fallos transitorios.

copiarAlPortapapeles(texto): Copia texto usando un textarea temporal y execCommand("copy").

Flujos y UI:

guardarEnProyectoExistente(): Lee recruiterTask, abre el diálogo de guardar en proyecto, selecciona proyecto existente si aplica, busca y elige el proyecto configurado, confirma Guardar (salvo en dryRunMode) y envía RECRUITER_DONE en finally.

esVistaDeProyecto(): Detecta si la ruta está en /talent/ sin ser /profile/.

montarControlesProyecto(): Añade el botón flotante Mensaje Largo en vistas de proyecto.

abrirPanelMensajeLargo(): Abre el panel para elegir rol, visualizar/editar mensajeLargo (Columna E) y copiarlo al portapapeles.

iniciarSiHayTarea(): Evita ejecuciones concurrentes de guardarEnProyectoExistente().

popup.js
Estado visual y X-Ray:

setStatus(txt, color): Actualiza el mensaje y color del área de estado del popup.

limpiarCamposVacante(): Limpia los campos de vacante y reinicia la vista X-Ray.

reconstruirQueryXray(): Arma la consulta booleana combinando el prefijo site:... del país, roles marcados y skills marcadas.

renderChipsXray(container, items, seleccionadosPorDefecto): Renderiza los chips seleccionables de roles o skills y enlaza sus cambios a reconstruirQueryXray().

aplicarDatosXrayEnUI(xrayObj, desdeCache): Aplica el objeto X-Ray (o estado vacío) en país, roles, skills, badge de caché y query.

extraerYGuardarXray(): Llama a EXTRACT_XRAY_KEYWORDS y persiste el JSON en AGENTE_DB mediante SAVE_XRAY_DATA.

Sincronización con Google Sheets y acciones:

cargarConfigDeRol(url, roleName): Consulta ?action=config&sheet=..., rellena los campos de vacante y carga o genera los datos X-Ray.

cargarPestanas(url, pestanaGuardada): Consulta ?action=sheets, sincroniza los tres selectores de rol (Ejecutar, X-Ray, Vacante) y carga la configuración del rol activo.

manejarCambioDeRol(nuevoRol): Mantiene sincronizados los selectores entre pestañas, guarda selectedSheet y carga la configuración del rol.

Listeners de botones y pestañas: Cambio de pestañas, creación de vacante (CREATE_ROLE), guardado de vacante (UPDATE_CONFIG, limpiando xrayJson si cambia la JD), guardado de configuración (sheetWebhookUrl, openaiKey), copia/apertura de búsqueda X-Ray en Google, e inicio (OPEN_FROM_SHEETS o START_BATCH) y detención (STOP_BATCH) de evaluaciones.

sheets_widget.js
Encapsulado en una IIFE para la hoja objetivo (1IgctcXouhK3QRIO-4LDhf4uTOWV8XuM-M7omzqowF6Y), monta el panel flotante arrastrable y minimizable, sincroniza valores con chrome.storage.local y chrome.storage.onChanged, carga/refresca roles vía GET_ROLES_LIST y dispara START_BATCH, OPEN_FROM_SHEETS o STOP_BATCH.

Código.gs
Endpoints HTTP:

doGet(e): Atiende action=sheets (lista roles excluyendo AGENTE_DB y sincroniza filas), action=config (lee configuración del rol en AGENTE_DB), action=index (construye el índice de URLs, matches y marcas Check de todas las hojas de roles) y obtención de candidato por row específica o siguiente fila pendiente (sin Check ni Match).

doPost(e): Procesa CREATE_ROLE, UPDATE_CONFIG, SAVE_XRAY_DATA y la actualización de Match (Columna B) y Check ("X" en Columna A) en la hoja del rol.

Helpers de hoja:

asegurarAgenteDb(ss): Crea o verifica la pestaña AGENTE_DB y sus encabezados.

asegurarPestanaRol(ss, roleName): Crea o verifica la pestaña de un rol y sus encabezados (Check, Match, URL).

sincronizarPestanasEnAgenteDb(ss, nombresPestanas): Agrega en AGENTE_DB cualquier pestaña de rol que aún no tenga fila.

obtenerConfigVacante(ss, roleName): Busca el rol en AGENTE_DB y devuelve su configuración estructurada.