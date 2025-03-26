"use client";

import React, { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useLoadScript } from "@react-google-maps/api";
import { Library } from "@googlemaps/js-api-loader";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import { useMap } from "react-leaflet";
import { Topology } from "topojson-specification";
import * as topojson from "topojson-client";

const libraries: Library[] = ["places"];

const MapContainer = dynamic(() => import("react-leaflet").then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then(mod => mod.TileLayer), { ssr: false });

interface InputState {
  d: string;
  h: number;
  x: number;
  y: number;
}

interface Point {
  x: number;
  y: number;
  result: number;
}

function RenderMap({ mapData, data }: { mapData: GeoJSON.Feature[], data: Point[] }) {
  const map = useMap();

  useEffect(() => {
    if (typeof window === "undefined") return;
    import("leaflet").then((L) => {
      const bounds = L.geoJSON(mapData).getBounds();
      map.fitBounds(bounds);
      data.forEach(point => {
        L.circle([point.y, point.x], {
          color: point.result === 0 ? "green" : "red",
          radius: 50,
        }).addTo(map);
      });
    });
  }, [map, mapData, data]);

  return null;
}

export default function App() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("NEXT_PUBLIC_GOOGLE_API_KEY environment variable is not defined");
  }

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey,
    libraries
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState<InputState>({ d: new Date().toISOString(), h: new Date().getHours(), x: 0, y: 0 });
  const [isMapLoading, setIsMapLoading] = useState(true);
  const [mapData, setMapData] = useState<GeoJSON.Feature[]>([]);
  const [points, setPoints] = useState<Point[]>([]);

  useEffect(() => {
    if (typeof window === "undefined" || !isLoaded || loadError) return;
    if (!window.google) return;

    const options = {
      componentRestrictions: { country: "us" },
      fields: ["address_components", "geometry"],
    };
    const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current!, options);
    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place || !place.geometry || !place.geometry.location) return;
      const location = place.geometry.location;
      setInput(prev => ({ ...prev, x: location.lat(), y: location.lng() }));
    });
    return () => window.google.maps.event.clearInstanceListeners(autocomplete);
  }, [isLoaded, loadError]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const cachedMapData = localStorage.getItem("mapData");
    if (cachedMapData) {
      const mapData = JSON.parse(cachedMapData);
      setMapData(mapData);
      setIsMapLoading(false);
    } else {
      fetch("https://d3js.org/us-10m.v1.json")
        .then(response => response.json())
        .then((us: Topology) => {
          const mapData = (topojson.feature(us, us.objects.states) as GeoJSON.FeatureCollection).features;
          localStorage.setItem("mapData", JSON.stringify(mapData));
          setMapData(mapData);
          setIsMapLoading(false);
        });
    }
  }, [isLoaded, loadError]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="w-full max-w-xl flex flex-col gap-4 bg-gray-800 p-6 rounded-lg shadow-lg">
        <input ref={inputRef} type="text" placeholder="Enter an address" className="border p-2 w-full rounded custom-input" />
        {!isMapLoading && (
          <MapContainer center={[38.9072, -77.0369]} zoom={12} style={{ height: "600px" }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
            <RenderMap mapData={mapData} data={points} />
          </MapContainer>
        )}
      </div>
    </div>
  );
}