# 🏥 Fichas → Notion Sync — Hospitales Provinciales de Córdoba

Sincronización automatizada entre Google Sheets y Notion para la gestión de servicios de hospitales provinciales de la Provincia de Córdoba, Argentina. Desarrollado con Google Apps Script y la API de Notion, con asistencia iterativa de Claude, ChatGPT y Gemini.  
**Autor:** @nvherreramartinez  
**Pila:** Google Apps Script · Notion API v1 · Google Sheets  
**Estado:** ✅ Finalizado

---

## 📋 Descripción

Este script sincroniza una hoja de cálculo (`Fuente`) con una base de datos en Notion, manteniendo actualizado el registro de servicios, secciones y modalidades de entrega de turnos (Ventanilla / Call-CIDI) por hospital y zona (Capital / Interior).

Cada fila en Notion representa una combinación única de:

- **Centro** (hospital)
- **Servicio**
- **Sección**
- **Aplicación** (modalidad de entrega de turnos)
- **Zona** (Capital o Interior)
- **Edad** (inferida automáticamente desde el servicio y sección)

---

## ⚙️ Funcionalidades

- ✅ Sincronización incremental con hash de caché — solo procesa lo que cambió
- ✅ Creación, actualización y eliminación automática de páginas en Notion
- ✅ Deduplicación: si un servicio tiene Ventanilla y Call/CIDI, prioriza Call/CIDI
- ✅ Inferencia automática de franja etaria (`Edad`) por servicio y sección
- ✅ Sanitización de caracteres conflictivos en campos `select` de Notion (comas → ` /`)
- ✅ Reintento automático ante errores 429 (rate limit) y 5xx con backoff exponencial
- ✅ Debounce de 5 minutos: al editar la hoja, espera silencio antes de sincronizar
- ✅ Log persistente en hoja `LOG_SYNC`
- ✅ Informe por ejecución en hoja `REPORTE`
- ✅ `syncParcial()` para carga inicial en tandas de 200 filas (evita timeout de 6 min)

---

## 🗂️ Estructura del repositorio

```
/
├── Código.gs   # Script principal (Apps Script)
└── README.md
```

---

## 🏗️ Arquitectura

```
Google Sheets (Fuente)
        ↓
   Apps Script
   ├── leerYLimpiarFuente()    — lee y deduplica filas
   ├── inferirEdad()           — calcula Edad desde MAPEO_EDAD
   ├── hashFila()              — detecta cambios por MD5
   ├── executeBatch()          — requests con retry y rate limit
   └── sync() / syncParcial() — orquesta create / update / delete
        ↓
   Notion API (v1/pages)
   └── Base de datos con columnas:
       Consulta · ID_Compuesto · Centro · Servicio
       Sección · Edad · Aplicaciones · Zona
```

---

## 🚀 Instalación y primer uso

### 1. Prerrequisitos

- Google Sheets con una hoja llamada `Fuente` con columnas: `Centro`, `Servicio`, `Sección`, `Aplicaciones`
- Base de datos en Notion con propiedades: `Consulta` (título), `ID_Compuesto`, `Centro`, `Servicio`, `Sección`, `Edad`, `Aplicaciones`, `Zona`
- Token de integración de Notion con acceso a la base de datos

### 2. Configuración

En el archivo `Código.gs`, completar las constantes al inicio:

```javascript
const NOTION_TOKEN = "tu_token_aqui";
const DB_ID_UNICA  = "id_de_tu_base_de_datos";
```

### 3. Instalación de triggers

Correr una sola vez desde el editor de Apps Script:

```javascript
instalarTriggers()
```

Esto instala:
- `onEditFuente` — detecta cambios en la hoja `Fuente`
- `checkPendingSync` — corre cada 10 minutos y evalúa si hay sync pendiente

### 4. Carga inicial

Si la base de datos de Notion está vacía, correr `syncParcial()` repetidamente hasta que el log indique `COMPLETO ✅`. Cada ejecución procesa 200 filas.

Si la base ya tiene datos anteriores que no fueron cargados por este script:

```
1. limpiarNotion()     — archiva todo en Notion
2. Limpiar NOTION_CACHE en Propiedades del script (dejar como {})
3. syncParcial()       — en tandas hasta COMPLETO ✅
```

---

## 🔄 Flujo de sincronización automática

```
Edición en hoja Fuente
        ↓
onEditFuente() — guarda flag + timestamp
        ↓
checkPendingSync() cada 10 min
        ↓
¿Pasaron 5 min sin ediciones? → NO → espera
        ↓ SI
sync() — compara hashes, crea/actualiza/elimina en Notion
        ↓
Guarda caché · Escribe LOG_SYNC · Escribe REPORTE
```

---

## 📊 Hojas generadas automáticamente

| Hoja | Contenido |
|---|---|
| `LOG_SYNC` | Registro detallado de cada operación (timestamp, tipo, id, acción, estado, detalle) |
| `REPORTE` | Resumen por ejecución: creados, actualizados, eliminados, errores, duración |

> Se pueden renombrar para archivarlas. El script genera nuevas automáticamente en la próxima ejecución.

---

## 🧠 MAPEO_EDAD — inferencia de franja etaria

La edad se infiere en `inferirEdad(servicio, seccion)` con esta prioridad:

1. Clave compuesta `"Servicio|Sección"` → para casos neonatales donde la sección determina la edad
2. Clave simple `"Servicio"` → para todos los demás casos
3. Fallback `"Adulto"` → para servicios no mapeados

**Valores posibles:** `Neonatal` · `Pediátrico` · `Adolescente` · `Adulto` · `Todas las edades`

Ejemplos de claves compuestas (neonatales):

```
"Cardiología Pediátrica|Cardiología Neonatal"          → Neonatal
"Neurología Pediátrica|Neurología Neonatal"             → Neonatal
"Infectología Pediátrica|Infectología Neonatal"         → Neonatal
"Oftalmología Pediátrica|Oftalmología Neonatal"         → Neonatal
"Otorrinolaringología Pediátrica|Otorrinolaringología Neonatal" → Neonatal
```

> Para agregar un nuevo caso especial, simplemente agregarlo en `MAPEO_EDAD` y seguir el procedimiento de mantenimiento correspondiente.

---

## 🛠️ Procedimientos de mantenimiento

### Agregar un hospital nuevo
1. Agregar la fila en la sheet `Fuente`
2. Si es un centro nuevo, agregarlo en `MAPEO_HOSPITALES` con su zona (`Capital` / `Interior`)
3. El sync automático lo detecta en los próximos 10 minutos

### Agregar un servicio nuevo
1. Agregar la fila en la sheet `Fuente`
2. Si la franja etaria no es `Adulto`, agregarlo en `MAPEO_EDAD`
3. El sync automático lo detecta

### Modificar MAPEO_EDAD o MAPEO_HOSPITALES

> ⚠️ Estos cambios **no tocan la sheet Fuente**, por lo tanto `onEditFuente` no se dispara y el hash de las filas no cambia. El sync automático no va a detectar el cambio.

Procedimiento manual requerido:

```
1. reconstruirCacheDesdeNotion()  — recuperar pageIds reales desde Notion
2. invalidarHashesCache()         — forzar update de todos los registros
3. syncParcial() × veces necesarias hasta "COMPLETO ✅"
```

> Estas funciones no están en el script productivo (se eliminaron en la limpieza final). El código está disponible en el historial del proyecto — ver sección Incidentes.

### Si aparecen duplicados en Notion
Correr `eliminarDuplicadosNotion()` — código disponible en el historial del proyecto.

---

## 🚨 Incidentes resueltos

### INC-01 — Columna Edad no se sincronizaba (junio 2026)

**Síntoma:** La columna `Edad` fue creada en Notion y el campo fue agregado a `buildProperties()`, pero al correr `sync()` todos los registros quedaban sin valor en Edad.

**Causa raíz:** El hash de cada fila se calcula con `centro + servicio + seccion + aplicaciones + zona`. `Edad` es un campo *calculado* por el script, no un dato de la Fuente, por lo que no forma parte del hash. Los registros existentes tenían el mismo hash que antes → el script los consideró sin cambios → no los actualizó.

**Resolución paso a paso:**
1. `resetCache()` — borrar el caché para forzar reescritura total
2. `syncParcial()` — procesar en lotes de 200 para evitar timeout
3. ⚠️ Al borrar el caché sin reconstruirlo, el script perdió los `pageId` reales → creó ~1024 páginas duplicadas en Notion
4. `reconstruirCacheDesdeNotion()` — leer Notion y recuperar los `pageId` reales
5. `invalidarHashesCache()` — forzar update masivo de todos los registros
6. `syncParcial()` × 6 veces — actualizar las ~1024 filas restantes
7. `eliminarDuplicadosNotion()` — archivar los ~1024 duplicados
8. `reconstruirCacheDesdeNotion()` — dejar el caché limpio y consistente

**Resultado:** 1024 filas con Edad correcta. Base de datos consistente.

**Lección aprendida:** Al agregar un campo calculado a `buildProperties()`, el hash no cambia. El procedimiento correcto es siempre: reconstruir caché → invalidar hashes → syncParcial. No hacer `resetCache()` sin reconstruir inmediatamente.

---

## ⚠️ Limitaciones conocidas

| Limitación | Detalle |
|---|---|
| Timeout de 6 min | Apps Script limita cada ejecución. La carga inicial usa `syncParcial()` y el sync automático solo procesa cambios incrementales |
| Rate limit de Notion | La API acepta ~3 req/seg. El script incluye retry con backoff exponencial ante errores 429 |
| Límite de caché | `PropertiesService` tiene límite de ~9 KB por propiedad. Con ~1500 filas está dentro del límite. A mayor escala conviene migrar a una hoja de caché |
| Campos calculados y hash | Cambios en `MAPEO_EDAD` o `MAPEO_HOSPITALES` no disparan sync automático — requieren procedimiento manual |

---

## 📊 Volumen actual

| Dato | Valor |
|---|---|
| Filas en sheet Fuente | ~1.376 |
| Registros en Notion | ~1.024 |
| Hospitales mapeados | 45 (14 Capital + 31 Interior) |
| Servicios en MAPEO_EDAD | ~95 |
| Lote de syncParcial | 200 filas |
| Timeout Apps Script | 6 minutos |

---

## 🤖 Proceso de desarrollo con IA

Este proyecto fue desarrollado de forma iterativa con asistencia de tres modelos de lenguaje:

| Herramienta | Rol en el proyecto |
|---|---|
| **ChatGPT** | Versión inicial: estructura base, mapeo de hospitales, lógica de hash y caché, request builders |
| **Google Gemini** | Revisión intermedia y ajustes de lógica |
| **Claude (Anthropic)** | Refactorización final: debounce con trigger independiente, fix de rate limit con retry, sanitización de selects, deduplicación Ventanilla/Call-CIDI, `syncParcial()`, columna Edad con inferencia por mapeo, resolución del incidente INC-01, limpieza del script y documentación |

El flujo con múltiples IAs demostró ser efectivo para iterar rápido: cada modelo aportó su perspectiva y el resultado final es más robusto que cualquier versión individual.

---

## 📄 Licencia

MIT — libre uso con atribución.

---

*Última actualización: 05/06/2026*
