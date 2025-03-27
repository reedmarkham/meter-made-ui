import React, { useEffect, useRef, useState } from "react";
import { Feature } from "geojson";

interface Point {
  x: number;
  y: number;
  result: number;
}

interface MapProps {
  isClient: boolean;
  mapData: Feature[];
  data: Point[];
}

const Map: React.FC<MapProps> = ({ isClient, mapData, data }) => {
  const [L, setL] = useState<typeof import("leaflet") | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (isClient && typeof window !== "undefined") {
      import("leaflet").then((leaflet) => {
        setL(leaflet);
      });
    }
  }, [isClient]);

  useEffect(() => {
    if (!L) return;

    // Only initialize if map doesn't already exist
    if (!mapRef.current) {
      mapRef.current = L.map("bottomMap").setView([38.9072, -77.0369], 12);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(mapRef.current);
    }

    if (mapRef.current) {
      const map = mapRef.current;

      // Remove only data layers, keep the tile layer
      map.eachLayer((layer) => {
        if (!(layer instanceof L.TileLayer)) {
          map.removeLayer(layer);
        }
      });

      // Fit map to data bounds
      if (mapData.length > 0) {
        const bounds = L.geoJSON(mapData).getBounds();
        map.fitBounds(bounds);
      }

      // Add new points
      data.forEach((point) => {
        L.circle([point.y, point.x], {
          color: point.result === 0 ? "#003B5C" : "#56A0D3",
          radius: 50,
        }).addTo(map);
      });
    }

    return () => {
      // Don't remove the map entirely; just clear layers
      if (mapRef.current) {
        mapRef.current.eachLayer((layer) => {
          if (!(layer instanceof L.TileLayer)) {
            mapRef.current?.removeLayer(layer);
          }
        });
      }
    };
  }, [L, mapData, data]);

  if (!isClient || typeof window === "undefined") {
    return <div>Loading...</div>;
  }

  return <div id="bottomMap" style={{ height: "600px" }} />;
};

export default Map;
