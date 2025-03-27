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

const DC_COORDINATES: [number, number] = [38.9072, -77.0369];

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

    if (!mapRef.current) {
      mapRef.current = L.map("map").setView(DC_COORDINATES, 12);

      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(mapRef.current);
    }

    if (mapRef.current) {
      const map = mapRef.current;

      map.eachLayer((layer) => {
        if (!(layer instanceof L.TileLayer)) {
          map.removeLayer(layer);
        }
      });

      if (mapData.length > 0) {
        const bounds = L.geoJSON(mapData).getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds);
        } else {
          console.warn("Invalid bounds computed from mapData.");
        }
      }

      data.forEach((point, index) => {
        L.circle([point.x, point.y], { // Swapped x and y
          color: point.result === 0 ? "#003B5C" : "#56A0D3",
          radius: 100,
        }).addTo(map);
      });

      setTimeout(() => {
        map.invalidateSize();
      }, 300); // Delay to let rendering settle
    }

    return () => {
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

  return <div id="map" style={{ height: "600px" }} />;
};

export default Map;
