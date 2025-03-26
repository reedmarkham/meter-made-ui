import React, { useEffect, useState } from "react";
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

  useEffect(() => {
    if (isClient && typeof window !== "undefined") {
      import("leaflet").then((leaflet) => {
        setL(leaflet);
      });
    }
  }, [isClient]);

  useEffect(() => {
    if (L) {
      let map = L.map("map");
  
      // Prevent duplicate maps
      if (map) {
        map.remove();
      }
  
      map = L.map("map").setView([38.9072, -77.0369], 12);
  
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
  
      if (mapData.length > 0) {
        const bounds = L.geoJSON(mapData).getBounds();
        map.fitBounds(bounds);
      }
  
      data.forEach((point) => {
        L.circle([point.y, point.x], {
          color: point.result === 0 ? "#56A0D3" : "#003B5C",
          radius: 50,
        }).addTo(map);
      });
  
      return () => {
        map.remove(); // Cleanup on unmount
      };
    }
  }, [L, mapData, data]);

  if (!isClient || typeof window === "undefined") {
    return <div>Loading...</div>;
  }

  return <div id="map" style={{ height: "600px" }} />;
};

export default Map;