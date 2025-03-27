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
      console.log("Importing Leaflet...");
      import("leaflet").then((leaflet) => {
        console.log("Leaflet imported.");
        setL(leaflet);
      });
    }
  }, [isClient]);

  useEffect(() => {
    if (!L) return;

    if (!mapRef.current) {
      console.log("Initializing map...");
      mapRef.current = L.map("map").setView(DC_COORDINATES, 12);
      console.log("Map initialized.");

      console.log("Adding tile layer...");
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(mapRef.current);
      console.log("Tile layer added.");
    }

    if (mapRef.current) {
      const map = mapRef.current;

      console.log("Clearing existing data layers...");
      map.eachLayer((layer) => {
        if (!(layer instanceof L.TileLayer)) {
          map.removeLayer(layer);
          console.log("Removed a data layer.");
        }
      });

      console.log("Fitting map to data bounds...");
      if (mapData.length > 0) {
        const bounds = L.geoJSON(mapData).getBounds();
        console.log("Computed bounds:", bounds);
        if (bounds.isValid()) {
          map.fitBounds(bounds);
        } else {
          console.warn("Invalid bounds computed from mapData.");
        }
      }

      console.log("Adding points to the map...");
      data.forEach((point, index) => {
        L.circle([point.x, point.y], { // Swapped x and y
          color: point.result === 0 ? "#003B5C" : "#56A0D3",
          radius: 100,
        }).addTo(map);
        console.log(`Added point ${index + 1}: (${point.x}, ${point.y}) with color ${point.result === 0 ? "#003B5C" : "#56A0D3"}`);
      });

      console.log("Ensuring map container size is correct...");
      setTimeout(() => {
        map.invalidateSize();
      }, 300); // Delay to let rendering settle
    }

    return () => {
      console.log("Clearing map layers on cleanup...");
      if (mapRef.current) {
        mapRef.current.eachLayer((layer) => {
          if (!(layer instanceof L.TileLayer)) {
            mapRef.current?.removeLayer(layer);
            console.log("Removed a layer during cleanup.");
          }
        });
      }
    };
  }, [L, mapData, data]);

  if (!isClient || typeof window === "undefined") {
    console.log("Map is loading...");
    return <div>Loading...</div>;
  }

  console.log("Rendering map container...");
  return <div id="map" style={{ height: "600px" }} />;
};

export default Map;
