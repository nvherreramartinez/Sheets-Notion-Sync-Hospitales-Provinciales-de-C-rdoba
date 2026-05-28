// =============================================
// CONFIGURACIÓN
// =============================================
const NOTION_TOKEN = "tu_token_aqui";
const DB_ID_UNICA = "id_de_tu_base_de_datos";

const BATCH_SIZE = 20;
const MAX_RETRIES = 5;
const BASE_DELAY = 300;
const MAX_RPS = 3;

const MAPEO_HOSPITALES = {
  // --- CAPITAL ---
  "Hospital Córdoba": "Capital",
  "Hospital Eva Peron": "Capital",
  "Hospital Florencio Díaz": "Capital",
  "Hospital Maternidad Prov. Brig. Gral. Juan Bautista Bustos": "Capital",
  "Hospital Materno Neonatal Ministro Dr. Ramón Carrillo": "Capital",
  "Hospital Misericordia": "Capital",
  "Hospital Neuropsiquiatrico": "Capital",
  "Hospital Oncológico Dr. José Miguel Urrutia": "Capital",
  "Hospital Pediátrico del Niño Jesús": "Capital",
  "Hospital Provincial del Noreste Elpidio Torres": "Capital",
  "Hospital Rawson": "Capital",
  "Hospital San Roque Viejo": "Capital",
  "Hospital Tránsito Cáceres de Allende": "Capital",
  "Nuevo Hospital San Roque": "Capital",
  // --- INTERIOR ---
  "Hospital Alta Gracia Dr. Arturo U. Illia": "Interior",
  "Hospital Aurelio Crespo (Cruz del Eje)": "Interior",
  "Hospital de Niños De la Santisima Trinidad": "Interior",
  "Hospital de Santa Rosa de Calamuchita": "Interior",
  "Hospital Domingo Funes": "Interior",
  "Hospital Dr. Abel Ayerza (Marcos Juárez)": "Interior",
  "Hospital Dr. Emilio Vidal Abal (Oliva)": "Interior",
  "Hospital Dr. Ernesto Romagosa (Deán Funes)": "Interior",
  "Hospital Dr. Jose Antonio Ceballos (Bell Ville)": "Interior",
  "Hospital Dr. Pedro Vella (Corral de Bustos)": "Interior",
  "Hospital Dr. René Favaloro (Huinca Renancó)": "Interior",
  "Hospital Luis F. María Bellodi (Mina Clavero)": "Interior",
  "Hospital Luis Pasteur - Villa Maria": "Interior",
  "Hospital Materno Infantil Dr Illia (La Calera)": "Interior",
  "Hospital Provincial Brigadier Gral. Juan B. Bustos (Río Tercero)": "Interior",
  "Hospital Provincial Profesor José Miguel Urrutia (Unquillo)": "Interior",
  "Hospital Provincial Villa Dolores": "Interior",
  "Hospital Ramón Bautista Mestre (Sta. Rosa de Río Primero)": "Interior",
  "Hospital Ramón José Cárcano (Laboulaye)": "Interior",
  "Hospital Regional José Bernardo Iturraspe": "Interior",
  "Hospital Regional Vicente Agüero (Jesús María)": "Interior",
  "Hospital San Antonio (La Carlota)": "Interior",
  "Hospital San Antonio de Padua (Río IV)": "Interior",
  "Hospital San Jose de la Dormida": "Interior",
  "Hospital San Vicente de Paul (Villa del Rosario)": "Interior",
  "Hospital Zonal (Oliva)": "Interior"
};

// =============================================
// LOGGER UNIFICADO
// =============================================
function logSync(tipo, id, accion, status, detalle = "") {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("LOG_SYNC");
  if (!sheet) {
    sheet = ss.insertSheet("LOG_SYNC");
    sheet.appendRow(["timestamp", "tipo", "id", "accion", "status", "detalle"]);
  }
  sheet.appendRow([new Date(), tipo, id, accion, status, detalle]);
}

// =============================================
// REPORTE DE SYNC
// =============================================
function escribirReporte(crear, actualizar, eliminar, duracionSeg, errores) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("REPORTE");
  if (!sheet) {
    sheet = ss.insertSheet("REPORTE");
    sheet.appendRow(["Fecha", "Creados", "Actualizados", "Eliminados", "Errores", "Duración (s)", "Estado"]);
    sheet.getRange(1, 1, 1, 7).setFontWeight("bold");
  }
  const estado = errores === 0 ? "✅ OK" : "⚠️ Con errores";
  sheet.appendRow([new Date(), crear, actualizar, eliminar, errores, duracionSeg, estado]);
}

// =============================================
// HASH + CACHE
// =============================================
function hashFila(f) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.MD5,
      [f.centro, f.servicio, f.seccion, f.aplicaciones, f.zona].join("|")
    )
  );
}
function getCache() {
  const raw = PropertiesService.getScriptProperties().getProperty("NOTION_CACHE");
  return raw ? JSON.parse(raw) : {};
}
function saveCache(cache) {
  PropertiesService.getScriptProperties()
    .setProperty("NOTION_CACHE", JSON.stringify(cache));
}
// =============================================
// SANITIZAR SELECTS
// =============================================
function sanitizarSelect(valor) {
  return String(valor).replace(/,/g, " /");
}
// =============================================
// BUILD PROPERTIES
// =============================================
function buildProperties(centro, servicio, seccion, aplicaciones, zona, id) {
  return {
    "Consulta": {
      title: [{ text: { content: aplicaciones + " - " + servicio } }]
    },
    "ID_Compuesto": {
      rich_text: [{ text: { content: id } }]
    },
    "Centro": { select: { name: sanitizarSelect(centro) } },
    "Servicio": { select: { name: sanitizarSelect(servicio) } },
    "Sección": { select: { name: sanitizarSelect(seccion) } },
    "Aplicaciones": {
      rich_text: [{ text: { content: String(aplicaciones) } }]
    },
    "Zona": { select: { name: sanitizarSelect(zona) } }
  };
}

// =============================================
// REQUEST BUILDERS
// =============================================
function buildCreateReq(f) {
  return {
    url: "https://api.notion.com/v1/pages",
    method: "post",
    headers: getHeaders(),
    payload: JSON.stringify({
      parent: { database_id: DB_ID_UNICA },
      properties: buildProperties(f.centro, f.servicio, f.seccion, f.aplicaciones, f.zona, f.id)
    }),
    muteHttpExceptions: true
  };
}
function buildUpdateReq(f) {
  return {
    url: "https://api.notion.com/v1/pages/" + f.pageId,
    method: "patch",
    headers: getHeaders(),
    payload: JSON.stringify({
      properties: buildProperties(f.centro, f.servicio, f.seccion, f.aplicaciones, f.zona, f.id)
    }),
    muteHttpExceptions: true
  };
}
function buildDeleteReq(f) {
  return {
    url: "https://api.notion.com/v1/pages/" + f.pageId,
    method: "patch",
    headers: getHeaders(),
    payload: JSON.stringify({ archived: true }),
    muteHttpExceptions: true
  };
}
function getHeaders() {
  return {
    "Authorization": "Bearer " + NOTION_TOKEN,
    "Content-Type": "application/json",
    "Notion-Version": "2022-06-28"
  };
}

// =============================================
// EXECUTOR CON RETRY + LOG
// =============================================
function executeBatch(requests, meta) {
  let pending = requests.map((r, i) => ({ r, i, tries: 0, meta: meta[i] }));
  const results = new Array(requests.length);
  let errores = 0;
  while (pending.length) {
    const batch = pending.splice(0, BATCH_SIZE);
    const responses = UrlFetchApp.fetchAll(batch.map(x => x.r));
    const retry = [];
    responses.forEach((res, idx) => {
      const item = batch[idx];
      const code = res.getResponseCode();
      const body = res.getContentText();
      if (code >= 200 && code < 300) {
        logSync("notion", item.meta.id, item.meta.accion, "OK");
        results[item.i] = { ok: true, body };
      } else if ((code === 429 || code >= 500) && item.tries < MAX_RETRIES) {
        Utilities.sleep(BASE_DELAY * Math.pow(2, item.tries));
        retry.push({ ...item, tries: item.tries + 1 });
      } else {
        logSync("ERROR", item.meta.id, item.meta.accion, "FAIL", `HTTP ${code}`);
        results[item.i] = { ok: false };
        errores++;
      }
    });
    pending = retry.concat(pending);
  }
  return { results, errores };
}

// =============================================
// LECTURA SHEETS
// =============================================
function leerYLimpiarFuente() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const fuente = ss.getSheetByName("Fuente");
  const data = fuente.getDataRange().getValues();
  const headers = data.shift();
  const idx = {
    centro: headers.indexOf("Centro"),
    servicio: headers.indexOf("Servicio"),
    seccion: headers.indexOf("Sección"),
    aplicaciones: headers.indexOf("Aplicaciones")
  };

  // Primer paso: agrupamos por clave sin aplicaciones
  const porClave = new Map();

  data.forEach(r => {
    let centro = r[idx.centro];
    let servicio = r[idx.servicio];
    let seccion = r[idx.seccion];
    let aplicaciones = String(r[idx.aplicaciones]).toLowerCase().trim();
    if (aplicaciones === "sin aplicaciones") aplicaciones = "Ventanilla";
    const zona = MAPEO_HOSPITALES[centro] || "Sin asignar";
    const claveBase = [centro, servicio, seccion].join("|");

    if (!porClave.has(claveBase)) {
      porClave.set(claveBase, { centro, servicio, seccion, aplicaciones, zona });
    } else {
      // Si ya existe, priorizamos call/cidi sobre Ventanilla
      const existing = porClave.get(claveBase);
      if (aplicaciones !== "Ventanilla") {
        porClave.set(claveBase, { centro, servicio, seccion, aplicaciones, zona });
      }
    }
  });

  // Segundo paso: construimos el array final con ID compuesto
  return [...porClave.values()].map(f => ({
    ...f,
    id: [f.centro, f.servicio, f.seccion, f.aplicaciones].join("|")
  }));
}

// =============================================
// 🚀 SYNC PRINCIPAL
// =============================================
function sync() {
  const t0 = new Date();
  const filas = leerYLimpiarFuente();
  const cache = getCache();
  const crear = [];
  const actualizar = [];
  const eliminar = [];
  const nuevosCache = {};
  const ids = new Set();

  filas.forEach(f => {
    const hash = hashFila(f);
    const c = cache[f.id];
    ids.add(f.id);
    if (!c) crear.push({ ...f, hash });
    else if (c.hash !== hash) actualizar.push({ ...f, pageId: c.pageId, hash });
    nuevosCache[f.id] = { pageId: c ? c.pageId : null, hash };
  });

  Object.keys(cache).forEach(id => {
    if (!ids.has(id)) eliminar.push(cache[id]);
  });

  let totalErrores = 0;

  // CREATE
  const { results: resCreate, errores: eCreate } = executeBatch(
    crear.map(buildCreateReq),
    crear.map(f => ({ id: f.id, accion: "create" }))
  );
  totalErrores += eCreate;
  resCreate.forEach((r, i) => {
    if (r && r.ok) {
      const data = JSON.parse(r.body);
      nuevosCache[crear[i].id].pageId = data.id;
    }
  });

  // UPDATE
  const { errores: eUpdate } = executeBatch(
    actualizar.map(buildUpdateReq),
    actualizar.map(f => ({ id: f.id, accion: "update" }))
  );
  totalErrores += eUpdate;

  // DELETE
  const { errores: eDelete } = executeBatch(
    eliminar.map(buildDeleteReq),
    eliminar.map(f => ({ id: f.pageId, accion: "delete" }))
  );
  totalErrores += eDelete;

  saveCache(nuevosCache);

  const duracion = ((new Date() - t0) / 1000).toFixed(1);

  logSync("sync", "global", "summary", "OK",
    `crear:${crear.length} update:${actualizar.length} delete:${eliminar.length} errores:${totalErrores}`
  );
  escribirReporte(crear.length, actualizar.length, eliminar.length, duracion, totalErrores);
  Logger.log(`✅ DONE en ${duracion}s`);
}
// =============================================
// SYNC PARCIAL (solo para el primer arranque)
// =============================================
function syncParcial() {
  const LIMITE = 200;
  const t0 = new Date();
  const props = PropertiesService.getScriptProperties();
  const offset = Number(props.getProperty("SYNC_OFFSET") || 0);

  const todasLasFilas = leerYLimpiarFuente();

  if (offset >= todasLasFilas.length) {
    logSync("system", "-", "sync-parcial", "OK", "Ya no hay filas pendientes");
    props.deleteProperty("SYNC_OFFSET");
    Logger.log("✅ Todo ya estaba procesado");
    return;
  }

  const lote = todasLasFilas.slice(offset, offset + LIMITE);
  const cache = getCache();
  const crear = [];
  const actualizar = [];
  const nuevosCache = { ...cache };
  let totalErrores = 0;

  lote.forEach(f => {
    const hash = hashFila(f);
    const c = cache[f.id];
    if (!c) crear.push({ ...f, hash });
    else if (c.hash !== hash) actualizar.push({ ...f, pageId: c.pageId, hash });
    nuevosCache[f.id] = { pageId: c ? c.pageId : null, hash };
  });

  // CREATE
  const { results: resCreate, errores: eCreate } = executeBatch(
    crear.map(buildCreateReq),
    crear.map(f => ({ id: f.id, accion: "create" }))
  );
  totalErrores += eCreate;
  resCreate.forEach((r, i) => {
    if (r && r.ok) {
      const data = JSON.parse(r.body);
      nuevosCache[crear[i].id].pageId = data.id;
    }
  });

  // UPDATE
  const { errores: eUpdate } = executeBatch(
    actualizar.map(buildUpdateReq),
    actualizar.map(f => ({ id: f.id, accion: "update" }))
  );
  totalErrores += eUpdate;

  saveCache(nuevosCache);

  const nuevoOffset = offset + lote.length;
  const esUltimo = nuevoOffset >= todasLasFilas.length;
  if (esUltimo) {
    props.deleteProperty("SYNC_OFFSET");
  } else {
    props.setProperty("SYNC_OFFSET", String(nuevoOffset));
  }

  const duracion = ((new Date() - t0) / 1000).toFixed(1);
  logSync(
    "sync-parcial", "global", `lote ${offset + 1}-${nuevoOffset}`, "OK",
    `crear:${crear.length} update:${actualizar.length} errores:${totalErrores} — ${esUltimo ? "COMPLETO ✅" : "continuar..."}`
  );
  escribirReporte(crear.length, actualizar.length, 0, duracion, totalErrores);
  Logger.log(`✅ Lote ${offset + 1}-${nuevoOffset} de ${todasLasFilas.length} en ${duracion}s${esUltimo ? " — COMPLETO" : " — corré syncParcial() de nuevo"}`);
}
// =============================================
// DEBOUNCE + TRIGGER AUTOMÁTICO
// =============================================
function onEditFuente(e) {
  if (!e || !e.source) return;
  const sheet = e.source.getActiveSheet();
  if (sheet.getName() !== "Fuente") return;

  const props = PropertiesService.getScriptProperties();
  props.setProperty("PENDING_SYNC", "true");
  props.setProperty("LAST_EDIT_TS", String(Date.now()));
}

function checkPendingSync() {
  const props = PropertiesService.getScriptProperties();
  const pending = props.getProperty("PENDING_SYNC");
  if (pending !== "true") return;

  const lastEdit = Number(props.getProperty("LAST_EDIT_TS") || 0);
  const cincoMin = 5 * 60 * 1000;
  if (Date.now() - lastEdit < cincoMin) return;

  // Borramos el flag ANTES de sync para no relanzar si falla
  props.deleteProperty("PENDING_SYNC");
  logSync("system", "-", "auto-sync", "START", "Disparado por checkPendingSync");
  sync();
}

// =============================================
// INSTALADOR DE TRIGGERS (correr una sola vez)
// =============================================
function instalarTriggers() {
  // Limpia triggers existentes para no duplicar
  ScriptApp.getProjectTriggers().forEach(t => {
    const fn = t.getHandlerFunction();
    if (fn === "onEditFuente" || fn === "checkPendingSync") {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Trigger onEdit
  ScriptApp.newTrigger("onEditFuente")
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit()
    .create();

  // Trigger cada 10 minutos
  ScriptApp.newTrigger("checkPendingSync")
    .timeBased()
    .everyMinutes(10)
    .create();

  Logger.log("✅ Triggers instalados: onEditFuente + checkPendingSync");
}
// UTILIDADES DE EMERGENCIA
// =============================================
// LIMPIEZA TOTAL DE NOTION (usar una sola vez)
// =============================================
function limpiarNotion() {
  const t0 = new Date();
  let cursor = undefined;
  let totalArchivados = 0;
  let totalErrores = 0;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const res = UrlFetchApp.fetch(
      "https://api.notion.com/v1/databases/" + DB_ID_UNICA + "/query",
      {
        method: "post",
        headers: getHeaders(),
        payload: JSON.stringify(body),
        muteHttpExceptions: true
      }
    );
    const data = JSON.parse(res.getContentText());
    const paginas = (data.results || []).filter(p => !p.archived);
    if (paginas.length === 0) {
      cursor = data.has_more ? data.next_cursor : undefined;
      continue;
    }
    // Mandamos de a 20 con retry por 429
    for (let i = 0; i < paginas.length; i += 20) {
      const lote = paginas.slice(i, i + 20);
      let intentos = 0;
      let exito = false;
      while (!exito && intentos < MAX_RETRIES) {
        const requests = lote.map(p => ({
          url: "https://api.notion.com/v1/pages/" + p.id,
          method: "patch",
          headers: getHeaders(),
          payload: JSON.stringify({ archived: true }),
          muteHttpExceptions: true
        }));
        const responses = UrlFetchApp.fetchAll(requests);
        const hayRate = responses.some(r => r.getResponseCode() === 429);
        if (hayRate) {
          intentos++;
          Utilities.sleep(BASE_DELAY * Math.pow(2, intentos));
          continue;
        }
        responses.forEach(r => {
          if (r.getResponseCode() >= 200 && r.getResponseCode() < 300) {
            totalArchivados++;
          } else {
            totalErrores++;
          }
        });
        exito = true;
      }
      Utilities.sleep(300);
    }
    cursor = data.has_more ? data.next_cursor : undefined;
    Logger.log(`📦 ${totalArchivados} archivados hasta ahora...`);
  } while (cursor);
  const duracion = ((new Date() - t0) / 1000).toFixed(1);
  logSync("system", "-", "limpiar-notion", "OK",
    `archivados:${totalArchivados} errores:${totalErrores} tiempo:${duracion}s`
  );
  Logger.log(`✅ Limpieza completa: ${totalArchivados} archivadas en ${duracion}s`);
}
// =============================================
// LOG DIAGNOSTICO
// =============================================
function diagnosticarNotion() {
  const res = UrlFetchApp.fetch(
    "https://api.notion.com/v1/databases/" + DB_ID_UNICA + "/query",
    {
      method: "post",
      headers: getHeaders(),
      payload: JSON.stringify({ page_size: 10 }),
      muteHttpExceptions: true
    }
  );
  Logger.log(res.getResponseCode());
  Logger.log(res.getContentText());
}
