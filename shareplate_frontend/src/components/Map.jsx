import React, { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";
import iconRetina from "leaflet/dist/images/marker-icon-2x.png";

const DefaultIcon = L.icon({
  iconUrl: icon,
  iconRetinaUrl: iconRetina,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41],
});

const createVehicleIcon = (label = "LIVE") =>
  L.divIcon({
    className: "",
    html: `
      <div style="display:flex;align-items:center;gap:8px;transform:translate(-8px,-8px);">
        <div style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:9999px;background:linear-gradient(135deg,#ff6b35 0%,#ff8f3f 100%);box-shadow:0 10px 24px rgba(255,107,53,0.35);color:white;font-size:18px;">
          🛵
        </div>
        <div style="padding:6px 10px;border-radius:9999px;background:#111827;color:white;font-size:10px;font-weight:700;letter-spacing:0.18em;">
          ${label}
        </div>
      </div>
    `,
    iconSize: [96, 44],
    iconAnchor: [18, 18],
  });

L.Marker.prototype.options.icon = DefaultIcon;

const Map = ({
  locations = [],
  center,
  zoom = 15,
  height = "500px",
  routePath = [],
  movingMarker,
  routeColor = "#fb923c",
  routeGlowColor = "#fdba74",
  routeDashArray,
}) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const staticMarkersRef = useRef([]);
  const routeLayerRef = useRef(null);
  const routeGlowLayerRef = useRef(null);
  const movingMarkerRef = useRef(null);
  const movingAnimationRef = useRef(null);
  const previousMovingPositionRef = useRef(null);

  const validLocations = useMemo(
    () => locations.filter((location) => Number.isFinite(location?.lat) && Number.isFinite(location?.lng)),
    [locations]
  );

  const validRoutePath = useMemo(
    () =>
      routePath
        .filter((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lng))
        .map((point) => [point.lat, point.lng]),
    [routePath]
  );

  useEffect(() => {
    if (!mapRef.current) return;

    let mapCenter = center;
    let mapZoom = zoom;

    if (mapCenter && typeof mapCenter === "object" && !Array.isArray(mapCenter)) {
      mapCenter = [mapCenter.lat, mapCenter.lng];
    }

    if (!mapCenter) {
      const points = [
        ...validLocations.map((location) => [location.lat, location.lng]),
        ...validRoutePath,
      ];

      if (Number.isFinite(movingMarker?.lat) && Number.isFinite(movingMarker?.lng)) {
        points.push([movingMarker.lat, movingMarker.lng]);
      }

      if (points.length === 1) {
        mapCenter = points[0];
        mapZoom = 15;
      } else if (points.length > 1) {
        const bounds = L.latLngBounds(points);
        if (bounds.isValid()) {
          mapCenter = [bounds.getCenter().lat, bounds.getCenter().lng];
        }
      }
    }

    mapCenter = mapCenter || [20.5937, 78.9629];

    if (!mapInstanceRef.current) {
      const centerCoords = Array.isArray(mapCenter) ? mapCenter : [mapCenter.lat || 20.5937, mapCenter.lng || 78.9629];
      mapInstanceRef.current = L.map(mapRef.current, {
        center: centerCoords,
        zoom: mapZoom,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(mapInstanceRef.current);

      mapInstanceRef.current.zoomControl.setPosition("bottomright");
    }

    const map = mapInstanceRef.current;

    staticMarkersRef.current.forEach((marker) => map.removeLayer(marker));
    staticMarkersRef.current = [];

    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }
    if (routeGlowLayerRef.current) {
      map.removeLayer(routeGlowLayerRef.current);
      routeGlowLayerRef.current = null;
    }

    validLocations.forEach((location, index) => {
      const marker = L.circleMarker([location.lat, location.lng], {
        radius: 11,
        color: "#ffffff",
        weight: 3,
        fillColor: index === 0 ? "#2563eb" : "#0f766e",
        fillOpacity: 1,
      }).addTo(map);

      if (location.name || location.title || location.description || location.address) {
        marker.bindPopup(`
          <div style="padding:8px;max-width:250px;">
            <h3 style="margin:0 0 8px 0;font-weight:700;font-size:16px;">
              ${location.name || location.title || "Location"}
            </h3>
            ${location.description ? `<p style="margin:0;color:#666;font-size:14px;">${location.description}</p>` : ""}
            ${location.address ? `<p style="margin:4px 0 0 0;color:#888;font-size:12px;">${location.address}</p>` : ""}
          </div>
        `);
      }

      if (index === 0) {
        marker.openPopup();
      }

      staticMarkersRef.current.push(marker);
    });

    if (validRoutePath.length >= 2) {
      routeGlowLayerRef.current = L.polyline(validRoutePath, {
        color: routeGlowColor,
        weight: 14,
        opacity: 0.28,
        lineCap: "round",
        lineJoin: "round",
        dashArray: routeDashArray,
      }).addTo(map);

      routeLayerRef.current = L.polyline(validRoutePath, {
        color: routeColor,
        weight: 7,
        opacity: 0.98,
        lineCap: "round",
        lineJoin: "round",
        dashArray: routeDashArray,
      }).addTo(map);
    }

    const pointsForBounds = [
      ...validLocations.map((location) => [location.lat, location.lng]),
      ...validRoutePath,
    ];

    if (Number.isFinite(movingMarker?.lat) && Number.isFinite(movingMarker?.lng)) {
      pointsForBounds.push([movingMarker.lat, movingMarker.lng]);
    }

    if (pointsForBounds.length > 1) {
      const bounds = L.latLngBounds(pointsForBounds);
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [30, 30] });
      }
    } else if (pointsForBounds.length === 1) {
      map.setView(pointsForBounds[0], mapZoom);
    }

    return () => {
      if (movingAnimationRef.current) {
        cancelAnimationFrame(movingAnimationRef.current);
        movingAnimationRef.current = null;
      }
      staticMarkersRef.current.forEach((marker) => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.removeLayer(marker);
        }
      });
      staticMarkersRef.current = [];
    };
  }, [validLocations, validRoutePath, center, zoom, movingMarker, routeColor, routeGlowColor, routeDashArray]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!movingMarker || !Number.isFinite(movingMarker.lat) || !Number.isFinite(movingMarker.lng)) {
      if (movingMarkerRef.current) {
        map.removeLayer(movingMarkerRef.current);
        movingMarkerRef.current = null;
      }
      previousMovingPositionRef.current = null;
      return;
    }

    const target = L.latLng(movingMarker.lat, movingMarker.lng);

    if (!movingMarkerRef.current) {
      movingMarkerRef.current = L.marker(target, {
        icon: createVehicleIcon(movingMarker.label),
        zIndexOffset: 2000,
      }).addTo(map);
      if (movingMarker.description) {
        movingMarkerRef.current.bindPopup(`
          <div style="padding:8px;max-width:220px;">
            <h3 style="margin:0 0 6px 0;font-weight:700;font-size:14px;">${movingMarker.label || "Courier live"}</h3>
            <p style="margin:0;color:#666;font-size:13px;">${movingMarker.description}</p>
          </div>
        `);
      }
      previousMovingPositionRef.current = target;
      return;
    }

    movingMarkerRef.current.setIcon(createVehicleIcon(movingMarker.label));

    const start = previousMovingPositionRef.current || movingMarkerRef.current.getLatLng();
    const animationStart = performance.now();
    const duration = 900;

    const animate = (timestamp) => {
      const progress = Math.min((timestamp - animationStart) / duration, 1);
      const nextLat = start.lat + (target.lat - start.lat) * progress;
      const nextLng = start.lng + (target.lng - start.lng) * progress;
      movingMarkerRef.current.setLatLng([nextLat, nextLng]);

      if (progress < 1) {
        movingAnimationRef.current = requestAnimationFrame(animate);
      } else {
        previousMovingPositionRef.current = target;
        movingAnimationRef.current = null;
      }
    };

    if (movingAnimationRef.current) {
      cancelAnimationFrame(movingAnimationRef.current);
    }

    movingAnimationRef.current = requestAnimationFrame(animate);

    return () => {
      if (movingAnimationRef.current) {
        cancelAnimationFrame(movingAnimationRef.current);
        movingAnimationRef.current = null;
      }
    };
  }, [movingMarker]);

  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={mapRef}
      style={{
        height,
        width: "100%",
        margin: "0",
        borderRadius: "24px",
        overflow: "hidden",
        zIndex: 0,
        border: "1px solid rgba(251, 146, 60, 0.18)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6), 0 18px 40px rgba(15,23,42,0.08)",
      }}
      aria-label="Map"
    />
  );
};

export default Map;
