# Guía de Instalación — Módulo de Ruteo para MyGeotab

## Requisitos previos

- Cuenta de administrador en MyGeotab (o permisos para gestionar Add-ins)
- Base de datos de MyGeotab activa
- Navegador moderno (Chrome, Edge, Firefox)

---

## Método 1: Instalación desde archivos locales (desarrollo)

Este método sirve para probar el add-in en tu base de datos antes de desplegarlo en producción.

### Paso 1 — Preparar los archivos

Descarga la carpeta `routing-addin/` que contiene:

```
routing-addin/
  ├── addin.json              ← Configuración del add-in
  ├── index.html              ← Entry point
  ├── app.js                  ← Lógica principal
  ├── routeBuilder.js         ← Constructor de rutas
  ├── trackingEngine.js       ← Motor de seguimiento
  ├── deviationDetector.js    ← Detección de desvíos
  ├── exceptionsHandler.js    ← Captura de excepciones
  ├── uiPanel.js              ← Panel lateral UI
  ├── styles.css              ← Estilos
  └── images/
      └── icon.svg            ← Ícono del add-in
```

### Paso 2 — Hospedar los archivos

El add-in necesita estar accesible por HTTPS. Opciones:

**Opción A — GitHub Pages (recomendado para pruebas):**

1. Crea un repositorio en GitHub (ej: `mygeotab-routing-addin`)
2. Sube todos los archivos de la carpeta `routing-addin/`
3. Ve a Settings > Pages > Selecciona "main" branch > Save
4. Tu URL será: `https://tu-usuario.github.io/mygeotab-routing-addin/`

**Opción B — Servidor propio:**

1. Sube los archivos a tu servidor web con certificado SSL
2. Asegúrate de que la URL base sea accesible por HTTPS
3. Ejemplo: `https://addins.tuempresa.com/routing/`

**Opción C — Desarrollo local con ngrok:**

1. Sirve los archivos localmente: `npx http-server ./routing-addin -p 8080`
2. Expón con ngrok: `ngrok http 8080`
3. Usa la URL HTTPS de ngrok (temporaria)

### Paso 3 — Registrar el Add-in en MyGeotab

1. Inicia sesión en tu base de datos MyGeotab
2. Ve a **Administración > Sistema > Add-Ins**
3. Haz clic en **"Agregar"** (botón azul arriba a la derecha)
4. Completa los campos:

| Campo | Valor |
|-------|-------|
| Nombre | `Módulo de Ruteo` |
| URL | La URL HTTPS donde hospedaste los archivos |
| Configuración | Pega el contenido de `addin.json` (ver abajo) |

5. Haz clic en **"Guardar"**

### Paso 4 — Configuración JSON

En el campo "Configuración" del add-in, pega exactamente este JSON:

```json
{
  "name": "Routing Module",
  "supportEmail": "soporte@tuempresa.com",
  "version": "1.0.0",
  "items": [
    {
      "url": "index.html",
      "path": "map",
      "menuName": {
        "en": "Route Planner",
        "es": "Planificador de Rutas"
      },
      "icon": "images/icon.svg"
    }
  ],
  "isSigned": false,
  "key": "",
  "signature": ""
}
```

**Nota importante:** El valor `"path": "map"` es lo que hace que el add-in se monte directamente sobre la sección de Mapa de MyGeotab, como un overlay.

### Paso 5 — Verificar la instalación

1. Recarga MyGeotab (F5 o Ctrl+R)
2. Ve a la sección **"Mapa"** en el menú principal
3. Deberías ver el panel lateral del add-in apareciendo sobre el mapa
4. Si no aparece, verifica en la consola del navegador (F12) si hay errores

---

## Método 2: Instalación vía Marketplace (producción)

Para despliegues en producción a múltiples bases de datos:

1. Registra tu add-in en el **Geotab Marketplace**: https://marketplace.geotab.com
2. Completa el proceso de certificación de Geotab
3. Una vez aprobado, los clientes pueden instalarlo desde Administration > Marketplace

---

## Método 3: Instalación vía API (automatizada)

Para instalación programática en múltiples bases de datos:

```javascript
api.call("Add", {
  typeName: "SystemSettings",
  entity: {
    customerPages: [{
      name: "Routing Module",
      url: "https://tu-servidor.com/routing-addin/index.html",
      path: "map",
      menuName: { en: "Route Planner", es: "Planificador de Rutas" },
      icon: "https://tu-servidor.com/routing-addin/images/icon.svg"
    }]
  }
}, function(result) {
  console.log("Add-in instalado:", result);
}, function(error) {
  console.error("Error:", error);
});
```

---

## Configuración post-instalación

### Motor de ruteo

El add-in incluye un interpolador básico entre puntos. Para rutas reales sobre calles, configura uno de estos servicios en `routeBuilder.js`:

**Opción 1 — OSRM (gratuito, self-hosted):**

```javascript
// En routeBuilder.js, reemplazar interpolateRoute() con:
async function calculateRoute(waypoints) {
  const coords = waypoints.map(w => w.lng + "," + w.lat).join(";");
  const resp = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${coords}?geometries=geojson&overview=full`
  );
  const data = await resp.json();
  return data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
}
```

**Opción 2 — Google Directions API:**

Requiere una API key de Google Cloud con Directions API habilitada.

**Opción 3 — Geotab Routing (si tu plan lo incluye):**

```javascript
api.call("GetDirections", {
  waypoints: points.map(p => ({ x: p.lng, y: p.lat }))
}, function(result) {
  // result contiene la ruta optimizada
});
```

### Permisos de usuario

El add-in respeta automáticamente los permisos de MyGeotab. Los usuarios solo ven los vehículos a los que tienen acceso según sus grupos asignados. No se requiere configuración adicional.

### Umbrales configurables

| Parámetro | Default | Dónde |
|-----------|---------|-------|
| Umbral de desvío | 100m | Slider en pestaña "Planificar" |
| Frecuencia de polling | 15s | `trackingEngine.js` → `pollingFreqMs` |
| Umbral de waypoint visitado | 80m | `deviationDetector.js` → `waypointThresholdM` |
| Velocidad promedio estimada | 40 km/h | `routeBuilder.js` → `estimateTime()` |

---

## Solución de problemas

**El panel no aparece sobre el mapa:**
- Verifica que `"path": "map"` esté en el JSON de configuración
- Revisa la consola del navegador (F12) por errores de carga
- Confirma que la URL HTTPS sea accesible (no bloqueada por CORS)

**No se cargan los vehículos:**
- El usuario debe tener permisos de lectura sobre dispositivos
- Verifica en Administration > Users que el usuario tenga acceso al grupo correcto

**Errores de CORS:**
- Los archivos deben servirse con headers `Access-Control-Allow-Origin: *`
- GitHub Pages y la mayoría de CDNs manejan esto automáticamente

**El add-in no persiste datos entre sesiones:**
- Verifica que el usuario tenga permisos para AddInData
- Revisa la consola por errores en las llamadas `api.call("Add", { typeName: "AddInData" })`

---

## Arquitectura del código

```
app.js                  ← Orquestador principal, lifecycle hooks de MyGeotab
  ├── routeBuilder.js   ← Waypoints, cálculo de ruta, polilínea
  ├── trackingEngine.js ← Polling de DeviceStatusInfo cada N segundos
  ├── deviationDetector.js ← Algoritmo punto-a-segmento, alertas
  ├── exceptionsHandler.js ← GetFeed de ExceptionEvent, clasificación
  └── uiPanel.js        ← Renderizado DOM del panel lateral
```

Cada módulo es independiente y se comunica a través de callbacks definidos en `app.js`. Esto facilita testing unitario y mantenimiento.

---

## Recursos adicionales

- SDK de Add-ins MyGeotab: https://geotab.github.io/sdk/software/guides/developing-addins/
- API Reference: https://geotab.github.io/sdk/software/api/reference/
- Repositorio de ejemplos: https://github.com/Geotab/sdk-addin-samples
- Foro de desarrolladores: https://community.geotab.com/s/
