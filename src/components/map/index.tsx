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
      console.log("Importing Leaflet...");
      import("leaflet").then((leaflet) => {
        console.log("Leaflet imported.");
        setL(leaflet);
      });
    }
  }, [isClient]);

  useEffect(() => {
    if (L && !mapRef.current) {
      console.log("Initializing map...");
      mapRef.current = L.map("map").setView([38.9072, -77.0369], 12);
      console.log("Map initialized.");

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(mapRef.current);
      console.log("Tile layer added to map.");
    }

    if (L && mapRef.current) {
      const map = mapRef.current;
      console.log("Clearing existing layers...");
      
      // Clear existing layers (except the base tile layer)
      map.eachLayer((layer) => {
        if (!(layer instanceof L.TileLayer)) {
          map.removeLayer(layer);
        }
      });
      console.log("Existing layers cleared.");

      if (mapData.length > 0) {
        console.log("Setting map bounds...");
        const bounds = L.geoJSON(mapData).getBounds();
        map.fitBounds(bounds);
        console.log("Map bounds set.");
      }

      console.log("Adding points to map...");
      data.forEach((point) => {
        L.circle([point.y, point.x], {
          color: point.result === 0 ? "#56A0D3" : "#003B5C",
          radius: 50,
        }).addTo(map);
      });
      console.log("Points added to map.");
    }

    return () => {
      if (mapRef.current) {
        console.log("Removing map...");
        mapRef.current.remove();
        mapRef.current = null;
        console.log("Map removed.");
      }
    };
  }, [L, mapData, data]);

  if (!isClient || typeof window === "undefined") {
    return <div>Loading...</div>;
  }

  return <div id="map" style={{ height: "600px" }} />;
};

export default Map;
