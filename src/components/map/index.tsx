import React, { useEffect } from "react";
import L from "leaflet";

interface Point {
  x: number;
  y: number;
  result: number;
}

interface MapProps {
  isClient: boolean;
  mapData: GeoJSON.Feature[];
  data: Point[];
}

const Map: React.FC<MapProps> = ({ isClient, mapData, data }) => {
  useEffect(() => {
    if (isClient && typeof window !== "undefined") {
      const map = L.map("map").setView([38.9072, -77.0369], 12);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

      const bounds = L.geoJSON(mapData).getBounds();
      map.fitBounds(bounds);

      data.forEach((point) => {
        L.circle([point.y, point.x], {
          color: point.result === 0 ? "#56A0D3" : "#003B5C", // Lighter blue for negative, darker blue for positive
          radius: 50,
        }).addTo(map);
      });
    }
  }, [isClient, mapData, data]);

  if (!isClient) {
    return <div>Loading...</div>; // or any placeholder UI
  }

  return <div id="map" style={{ height: "600px" }} />;
};

export default Map;