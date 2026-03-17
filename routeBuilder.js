/**
 * routeBuilder.js
 * Módulo de construcción de rutas — gestiona waypoints, cálculo de ruta
 * y dibujado sobre el mapa nativo de MyGeotab vía services.canvas.
 */
var RouteBuilder = (function () {
  "use strict";

  var waypoints = [];       // [{lat, lng, label}]
  var routeLine = [];       // [[lat,lng], ...] polilínea interpolada
  var routeDistance = 0;    // metros
  var routeTime = 0;        // minutos
  var mapElements = [];     // IDs de elementos dibujados en el mapa
  var mapService = null;    // services.canvas de Geotab Map API
  var mapEventService = null; // services.map
  var deviationThreshold = 100; // metros

  // ─── Geo helpers ─────────────────────────────
  function toRad(d) { return d * Math.PI / 180; }

  function haversine(a, b) {
    var R = 6371000;
    var dLat = toRad(b[0] - a[0]);
    var dLon = toRad(b[1] - a[1]);
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  /**
   * Interpola entre los waypoints para generar una polilínea más suave.
   * En producción, se reemplazaría con OSRM / Google Directions.
   */
  function interpolateRoute(points, segmentsPerLeg) {
    segmentsPerLeg = segmentsPerLeg || 14;
    var result = [];
    for (var i = 0; i < points.length - 1; i++) {
      var a = points[i], b = points[i + 1];
      for (var j = 0; j <= segmentsPerLeg; j++) {
        var t = j / segmentsPerLeg;
        result.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]);
      }
    }
    return result;
  }

  // ─── Map drawing ─────────────────────────────
  function clearMapElements() {
    if (!mapService) return;
    mapElements.forEach(function (id) {
      try { mapService.removeMapElement(id); } catch (e) { /* ignore */ }
    });
    mapElements = [];
  }

  function drawRoute() {
    clearMapElements();
    if (!mapService || waypoints.length === 0) return;

    // Draw waypoint markers
    waypoints.forEach(function (wp, i) {
      var isStart = i === 0;
      var isEnd = waypoints.length > 1 && i === waypoints.length - 1;
      var color = isStart ? "#34a853" : isEnd ? "#ea4335" : "#4285f4";
      var label = isStart ? "A" : isEnd ? "B" : String(i);

      try {
        var id = mapService.addMapElement({
          type: "marker",
          position: { lat: wp.lat, lng: wp.lng },
          title: wp.label || ("Punto " + (i + 1)),
          svg: {
            html: '<svg width="24" height="32" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">' +
              '<path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z" fill="' + color + '"/>' +
              '<text x="12" y="14" text-anchor="middle" fill="#fff" font-size="10" font-weight="bold">' + label + '</text></svg>',
            width: 24,
            height: 32,
            anchor: { x: 12, y: 32 }
          }
        });
        if (id) mapElements.push(id);
      } catch (e) {
        console.warn("[RouteBuilder] Error adding marker:", e);
      }
    });

    // Draw planned route polyline
    if (routeLine.length > 1) {
      try {
        var id = mapService.addMapElement({
          type: "polyline",
          path: routeLine.map(function (p) { return { lat: p[0], lng: p[1] }; }),
          strokeColor: "#4285f4",
          strokeOpacity: 0.5,
          strokeWeight: 5
        });
        if (id) mapElements.push(id);
      } catch (e) {
        console.warn("[RouteBuilder] Error adding polyline:", e);
      }
    }
  }

  // ─── Route calculation ───────────────────────
  function recalculate() {
    if (waypoints.length < 2) {
      routeLine = [];
      routeDistance = 0;
      routeTime = 0;
      drawRoute();
      return;
    }
    var pts = waypoints.map(function (w) { return [w.lat, w.lng]; });
    routeLine = interpolateRoute(pts, 16);

    // Calculate total distance
    routeDistance = 0;
    for (var i = 0; i < routeLine.length - 1; i++) {
      routeDistance += haversine(routeLine[i], routeLine[i + 1]);
    }
    routeTime = Math.round(routeDistance / 500); // ~30 km/h avg
    drawRoute();
  }

  // ─── Public API ──────────────────────────────
  return {
    /**
     * Initialize with Geotab Map services
     * @param {Object} services - Map Add-in services object
     */
    init: function (services) {
      if (services && services.canvas) {
        mapService = services.canvas;
      }
      if (services && services.map) {
        mapEventService = services.map;
      }
    },

    /** Register a click handler on the map for adding waypoints */
    enableMapClicks: function (callback) {
      if (!mapEventService) return;
      mapEventService.addEventListener("click", function (evt) {
        if (evt && evt.location) {
          callback(evt.location.lat, evt.location.lng);
        }
      });
    },

    addWaypoint: function (lat, lng) {
      waypoints.push({ lat: lat, lng: lng, label: "Punto " + (waypoints.length + 1) });
      recalculate();
    },

    removeWaypoint: function (index) {
      waypoints.splice(index, 1);
      // Re-label
      waypoints.forEach(function (w, i) { w.label = "Punto " + (i + 1); });
      recalculate();
    },

    moveWaypoint: function (fromIdx, toIdx) {
      var item = waypoints.splice(fromIdx, 1)[0];
      waypoints.splice(toIdx, 0, item);
      waypoints.forEach(function (w, i) { w.label = "Punto " + (i + 1); });
      recalculate();
    },

    clearAll: function () {
      waypoints = [];
      routeLine = [];
      routeDistance = 0;
      routeTime = 0;
      clearMapElements();
    },

    getWaypoints: function () { return waypoints.slice(); },
    getRouteLine: function () { return routeLine.slice(); },
    getRouteDistance: function () { return routeDistance; },
    getRouteTime: function () { return routeTime; },

    setDeviationThreshold: function (meters) { deviationThreshold = meters; },
    getDeviationThreshold: function () { return deviationThreshold; },

    /** Redraw (useful after state changes) */
    redraw: drawRoute,

    /** Get the map canvas service for other modules */
    getMapService: function () { return mapService; },

    /** Haversine helper exposed for other modules */
    haversine: haversine
  };
})();
