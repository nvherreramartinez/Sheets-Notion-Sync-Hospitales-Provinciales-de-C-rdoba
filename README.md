# 🏥 Sheets → Notion Sync — Hospitales Provinciales de Córdoba

Sincronización automatizada entre Google Sheets y Notion para la gestión de servicios de hospitales provinciales de la Provincia de Córdoba, Argentina.
Desarrollado con Google Apps Script y la API de Notion, con asistencia iterativa de Claude, ChatGPT y Gemini.
**Autor:** [@nvherreramartinez](https://github.com/nvherreramartinez)  
**Stack:** Google Apps Script · Notion API v1 · Google Sheets

---

## 📋 Descripción

Este script sincroniza una hoja de cálculo (`Fuente`) con una base de datos en Notion, manteniendo actualizado el registro de servicios, secciones y modalidades de entrega de turnos (Ventanilla / Call-CIDI) por hospital y zona (Capital / Interior).

Cada fila en Notion representa una combinación única de:
- **Centro** (hospital)
- **Servicio**
- **Sección**
- **Aplicación** (modalidad de entrega de turnos)
- **Zona** (Capital o Interior)

---

## ⚙️ Funcionalidades

- ✅ Sincronización incremental con cache hash — solo procesa lo que cambió
- ✅ Creación, actualización y eliminación automática de páginas en Notion
- ✅ Deduplicación: si un servicio tiene Ventanilla y Call/CIDI, prioriza Call/CIDI
- ✅ Sanitización de caracteres conflictivos en campos `select` de Notion (comas → ` /`)
- ✅ Retry automático ante errores 429 (rate limit) y 5xx
- ✅ Debounce de 5 minutos: al editar la hoja, espera silencio antes de sincronizar
- ✅ Log persistente en hoja `LOG_SYNC`
- ✅ Reporte por ejecución en hoja `REPORTE`
- ✅ `syncParcial()` para carga inicial en tandas de 200 filas (evita timeout de 6 min)
- ✅ Utilidades de emergencia: limpieza total de Notion y diagnóstico de API

---

## 🗂️ Estructura del repositorio

```
/
├── Código.gs          # Script principal (Apps Script)
└── README.md
```

---

## 🚀 Instalación y primer uso

### 1. Prerrequisitos
- Google Sheets con una hoja llamada `Fuente` con columnas: `Centro`, `Servicio`, `Sección`, `Aplicaciones`
- Base de datos en Notion con propiedades: `Consulta` (title), `ID_Compuesto`, `Centro`, `Servicio`, `Sección`, `Aplicaciones`, `Zona`
- Token de integración de Notion con acceso a la base de datos

### 2. Configuración
En el archivo `Código.gs`, completá las constantes al inicio:

```javascript
const NOTION_TOKEN = "tu_token_aqui";
const DB_ID_UNICA = "id_de_tu_base_de_datos";
```

### 3. Instalación de triggers
Corré **una sola vez** desde el editor de Apps Script:

```javascript
instalarTriggers()
```

Esto instala:
- `onEditFuente` — detecta cambios en la hoja Fuente
- `checkPendingSync` — corre cada 10 minutos y evalúa si hay sync pendiente

### 4. Carga inicial
Si la base de datos en Notion está vacía, corré `syncParcial()` repetidamente hasta que el log indique `COMPLETO ✅`. Cada ejecución procesa 200 filas.

Si la base ya tiene datos previos que no fueron cargados por este script, correr primero:

```javascript
limpiarNotion()   // archiva todo en Notion
// luego limpiar NOTION_CACHE en Propiedades del script (dejar como {})
// luego correr syncParcial() en tandas
```

---

## 🔄 Flujo de sincronización automática

```
Edición en hoja Fuente
        ↓
onEditFuente() guarda flag + timestamp
        ↓
checkPendingSync() cada 10 min
        ↓
¿Pasaron 5 min sin ediciones? → NO → espera
        ↓ SI
sync() — compara hashes, crea/actualiza/elimina en Notion
        ↓
Guarda cache · Escribe LOG_SYNC · Escribe REPORTE
```

---

## 📊 Hojas generadas automáticamente

| Hoja | Contenido |
|------|-----------|
| `LOG_SYNC` | Registro detallado de cada operación (timestamp, tipo, id, acción, status, detalle) |
| `REPORTE` | Resumen por ejecución: creados, actualizados, eliminados, errores, duración |

> Tip: podés renombrar estas hojas para archivarlas. El script genera nuevas automáticamente en la próxima ejecución.

---

## 🛠️ Funciones de emergencia

| Función | Uso |
|---------|-----|
| `limpiarNotion()` | Archiva todas las páginas de la base de datos en Notion |
| `diagnosticarNotion()` | Muestra el estado real de las primeras 10 páginas vía API |
| `borrarDelCachePorServicio()` | Elimina entradas del cache por nombre de servicio o sección para forzar re-sync |
| `syncParcial()` | Carga inicial en tandas de 200 filas con offset persistente |

---

## ⚠️ Limitaciones conocidas

- **Timeout de 6 minutos:** Apps Script limita cada ejecución a 6 minutos. Por eso la carga inicial usa `syncParcial()` y el sync automático solo procesa cambios incrementales.
- **Rate limit de Notion:** la API acepta ~3 requests/segundo. El script incluye retry con backoff exponencial ante errores 429.
- **Cache en Script Properties:** el cache JSON tiene límite de 9KB por propiedad. Con ~1500 filas está dentro del límite, pero a escalar conviene migrar a una hoja de cache.

---

## 🤖 Proceso de desarrollo con IA

Este proyecto fue desarrollado de forma iterativa con asistencia de tres modelos de lenguaje, cada uno aportando en distintas etapas:

| Herramienta | Rol en el proyecto |
|-------------|-------------------|
| **ChatGPT** | Versión inicial del script: estructura base, mapeo de hospitales, lógica de hash y cache, request builders |
| **Google Gemini** | Revisión intermedia y ajustes de lógica |
| **Claude (Anthropic)** | Refactorización final: unificación de loggers, debounce con trigger independiente, fix de rate limit con retry, sanitización de selects, deduplicación Ventanilla/Call-CIDI, `syncParcial()` para carga inicial, limpieza total de Notion, y documentación |

> El flujo de trabajo con múltiples IAs demostró ser efectivo para iterar rápido: cada modelo aportó su perspectiva y el resultado final es más robusto que cualquier versión individual.

---

## 📌 Próximas versiones

- [ ] Sincronización inversa Notion → Sheets
- [ ] Segunda integración con estructura de columnas diferente
- [ ] Migración del cache a hoja de Google Sheets para mayor capacidad

---

## 📄 Licencia

MIT — libre uso con atribución.
