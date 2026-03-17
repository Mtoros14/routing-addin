/**
 * trackingEngine.js
 * Motor de seguimiento en tiempo real.
 * Polling a DeviceStatusInfo cada N segundos.
 */
var TrackingEngine = (function () {
  "use strict";

  var api = null;
  var deviceId = null;
  var pollingInterval = null;
  var pollRate = 15000;
  var trail = [];
  var trailMapElements = [];
  var vehicleMarker = null;
  var progress = 0;
  var elapsedSeconds = 0;
  var startTime = null;
  var isRunning = false;
  var listeners = { position: [], progress: [], error: [] };

  function notify(type, data) {
    (listeners[type] || []).forEach(function (fn) { fn(data); });
  }

  function poll() {
    if (!api || !deviceId) return;
    api.call("Get", {
      typeName: "DeviceStatusInfo",
      search: { deviceSearch: { id: deviceId } }
    }, function (results) {
      if (!results || results.length === 0) return;
      var status = results[0];
      var lat = status.latitude, lng = status.longitude;
      if (lat === undefined || lng === undefined || (lat === 0 && lng === 0)) {
        notify("error", { type: "NO_GPS", message: "Sin señal GPS" });
        return;
      }
      var pos = [lat, lng];
      trail.push(pos);
      if (startTime) elapsedSeconds = Math.round((Date.now() - startTime) / 1000);

      var routeLine = RouteBuilder.getRouteLine();
      if (routeLine.length > 1) {
        var bestIdx = 0, bestDist = Infinity;
        for (var i = 0; i < routeLine.length; i++) {
          var d = RouteBuilder.haversine(pos, routeLine[i]);
          if (d < bestDist) { bestDist = d; bestIdx = i; }
        }
        progress = Math.min(100, Math.round((bestIdx / (routeLine.length - 1)) * 100));
      }

      var threshold = RouteBuilder.getDeviationThreshold();
      var check = DeviationDetector.check(pos, routeLine, threshold);
      drawTrailSegment(pos, check.deviated);
      drawVehicleMarker(pos);

      notify("position", {
        position: pos, speed: status.speed || 0,
        deviated: check.deviated, deviationDistance: check.distance,
        progress: progress, elapsedSeconds: elapsedSeconds
      });
      notify("progress", { progress: progress, elapsed: elapsedSeconds });
    }, function (err) {
      console.error("[TrackingEngine] API error:", err);
      notify("error", { type: "API_ERROR", message: err.message || "Error de API" });
    });
  }

  function drawTrailSegment(pos, deviated) {
    var mapService = RouteBuilder.getMapService();
    if (!mapService || trail.length < 2) return;
    var prev = trail[trail.length - 2];
    try {
      var id = mapService.addMapElement({
        type: "polyline",
        path: [{ lat: prev[0], lng: prev[1] }, { lat: pos[0], lng: pos[1] }],
        strokeColor: deviated ? "#ea4335" : "#34a853",
        strokeOpacity: 0.9, strokeWeight: 4
      });
      if (id) trailMapElements.push(id);
    } catch (e) { /* ignore */ }
  }

  function drawVehicleMarker(pos) {
    var mapService = RouteBuilder.getMapService();
    if (!mapService) return;
    if (vehicleMarker) {
      try { mapService.removeMapElement(vehicleMarker); } catch (e) { /* ignore */ }
    }
    try {
      vehicleMarker = mapService.addMapElement({
        type: "marker",
        position: { lat: pos[0], lng: pos[1] },
        title: "Vehículo",
        svg: {
          html: '<svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#4285f4" stroke="#fff" stroke-width="2.5"/><circle cx="10" cy="10" r="3" fill="#fff"/></svg>',
          width: 20, height: 20, anchor: { x: 10, y: 10 }
        }
      });
    } catch (e) { /* ignore */ }
  }

  function clearTrailElements() {
    var mapService = RouteBuilder.getMapService();
    if (!mapService) return;
    trailMapElements.forEach(function (id) {
      try { mapService.removeMapElement(id); } catch (e) { /* ignore */ }
    });
    trailMapElements = [];
    if (vehicleMarker) {
      try { mapService.removeMapElement(vehicleMarker); } catch (e) { /* ignore */ }
      vehicleMarker = null;
    }
  }

  return {
    init: function (geotabApi) { api = geotabApi; },
    start: function (id, rate) {
      if (isRunning) this.stop();
      deviceId = id; pollRate = rate || 15000;
      trail = []; progress = 0; elapsedSeconds = 0;
      startTime = Date.now(); isRunning = true;
      DeviationDetector.reset(); clearTrailElements();
      poll();
      pollingInterval = setInterval(poll, pollRate);
    },
    stop: function () {
      isRunning = false;
      if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
    },
    reset: function () {
      this.stop(); trail = []; progress = 0;
      elapsedSeconds = 0; startTime = null; clearTrailElements();
    },
    on: function (event, fn) { if (listeners[event]) listeners[event].push(fn); },
    isRunning: function () { return isRunning; },
    getTrail: function () { return trail.slice(); },
    getProgress: function () { return progress; },
    getElapsed: function () { return elapsedSeconds; }
  };
})();
