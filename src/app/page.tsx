"use client";

import React, { useEffect, useState, useRef } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useLoadScript } from "@react-google-maps/api";
import { Library } from "@googlemaps/js-api-loader";
import dynamic from "next/dynamic";
import { Topology } from "topojson-specification";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import * as topojson from "topojson-client";

// Dynamically import Leaflet components to avoid SSR issues
const MapContainer = dynamic(() => import("react-leaflet").then((mod) => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((mod) => mod.TileLayer), { ssr: false });

// Dynamically import custom Map component
const Map = dynamic(() => import('@/components/map/'), { ssr: false });

const libraries: Library[] = ["places"];
const SAMPLE_SIZE = 50;
const DC_COORDINATES: [number, number] = [38.9072, -77.0369]; // Coordinates for Washington, DC

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

async function gatherEligiblePoints(mapData: GeoJSON.Feature[], isClient: boolean): Promise<Point[]> {
  if (typeof window === "undefined" || !isClient) return [];

  const { default: L } = await import("leaflet");
  const dcBoundary = mapData;
  if (!dcBoundary) {
    console.warn("DC map data not found.");
    return [];
  }

  const eligiblePoints: Point[] = [];
  const bounds = L.geoJSON(dcBoundary).getBounds();
  const latMin = bounds.getSouthWest().lat;
  const latMax = bounds.getNorthEast().lat;
  const lngMin = bounds.getSouthWest().lng;
  const lngMax = bounds.getNorthEast().lng;

  for (let i = 0; i < SAMPLE_SIZE * 10; i++) {
    const lat = latMin + Math.random() * (latMax - latMin);
    const lng = lngMin + Math.random() * (lngMax - lngMin);
    const isInside = bounds.contains([lat, lng]);
    
    if (isInside) {
      eligiblePoints.push({ x: lng, y: lat, result: Math.round(Math.random()) });
      if (eligiblePoints.length >= SAMPLE_SIZE * 2) break;
    }
  }

  return eligiblePoints;
}

function samplePoints(eligiblePoints: Point[], sampleSize: number): Point[] {
  if (eligiblePoints.length === 0) {
    return [];
  }
  const sampledPoints: Point[] = [];
  while (sampledPoints.length < sampleSize && eligiblePoints.length > 0) {
    const index = Math.floor(Math.random() * eligiblePoints.length);
    sampledPoints.push(eligiblePoints.splice(index, 1)[0]);
  }
  return sampledPoints;
}

function RenderMap({ isClient, mapData, data }: { isClient: boolean; mapData: GeoJSON.Feature[]; data: Point[] }) {
  const mapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isClient && mapRef.current) {
      import("leaflet").then((L) => {
        const map = L.map(mapRef.current as HTMLElement).setView(DC_COORDINATES, 12);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

        const bounds = L.geoJSON(mapData).getBounds();
        map.fitBounds(bounds);

        data.forEach((point) => {
          L.circle([point.y, point.x], {
            color: point.result === 0 ? "#56A0D3" : "#003B5C",
            fillOpacity: 0.6,
            radius: 200,
          }).addTo(map);
        });

        const legend = new L.Control({ position: "bottomright" });

        legend.onAdd = function () {
          const div = L.DomUtil.create("div", "info legend");
          div.innerHTML = `
            <h4>Legend</h4>
            <i style="background: #56A0D3"></i> Likely to get a ticket<br>
            <i style="background: #003B5C"></i> Unlikely to get a ticket
          `;
          return div;
        };

        legend.addTo(map);

        return () => {
          map.remove();
        };
      });
    }
  }, [isClient, mapData, data]);

  if (!isClient) return null;
  return <Map isClient={isClient} mapData={mapData} data={data} />;
}

export default function App() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("NEXT_PUBLIC_GOOGLE_API_KEY environment variable is not defined");
  }

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey,
    libraries,
  });

  const [input, setInput] = useState<InputState>({
    d: new Date().toISOString(),
    h: new Date().getHours(),
    x: 0,
    y: 0,
  });

  const [predictionResult, setPredictionResult] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hasSubmitted, setHasSubmitted] = useState<boolean>(false);
  const [isMapLoading, setIsMapLoading] = useState<boolean>(true);
  const [mapData, setMapData] = useState<GeoJSON.Feature[]>([]);
  const [points, setPoints] = useState<Point[]>([]);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(typeof window !== "undefined");
  }, []);

  useEffect(() => {
    if (!isClient || !isLoaded || loadError) return;

    const fetchData = async () => {
      try {
        const response = await fetch("https://d3js.org/us-10m.v1.json");
        const us: Topology = await response.json();
        const mapData = (topojson.feature(us, us.objects.states) as unknown as GeoJSON.FeatureCollection).features.filter(
          (d) => d.id === "11"
        );
        const eligiblePoints = await gatherEligiblePoints(mapData, isClient);
        const data = samplePoints(eligiblePoints, SAMPLE_SIZE);

        setMapData(mapData);
        setPoints(data);
        setIsMapLoading(false);
      } catch (error) {
        console.error("Error fetching map data:", error);
        setIsMapLoading(false);
      }
    };

    fetchData();
  }, [isClient, isLoaded, loadError]);

  useEffect(() => {
    if (!isClient || !isLoaded || loadError || !inputRef.current) return;

    const options = {
      componentRestrictions: { country: "us" },
      fields: ["address_components", "geometry"],
    };

    if (typeof window !== "undefined" && window.google?.maps) {
      const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current!, options);
      autocomplete.addListener("place_changed", () => handlePlaceChanged(autocomplete));

      return () => window.google.maps.event.clearInstanceListeners(autocomplete);
    }
  }, [isClient, isLoaded, loadError]);

  const handlePlaceChanged = (autocomplete: google.maps.places.Autocomplete) => {
    const place = autocomplete.getPlace();
    if (!place || !place.geometry || !place.geometry.location) return;

    const location = place.geometry.location;
    const addressComponents = place.address_components;
    const isDC = addressComponents?.some((component) =>
      component.short_name === "DC" || component.long_name === "District of Columbia"
    );

    if (!isDC) {
      setError("Please select an address in the District of Columbia.");
      return;
    }

    setError(null);
    setInput((prev) => ({
      ...prev,
      x: location.lat(),
      y: location.lng(),
    }));
  };

  const handleChange = (date: Date | null) => {
    if (date) {
      setInput((prev) => ({
        ...prev,
        d: date.toISOString().split("T")[0],
        h: date.getHours(),
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (error) {
      alert(error);
      return;
    }
    setIsLoading(true);
    setHasSubmitted(true);
    try {
      const result = await makePrediction(input);
      setPredictionResult(result);
    } catch (error) {
      console.error("Prediction error:", error);
      if (error instanceof Error) {
        alert(`Prediction failed: ${error.message}`);
      } else {
        alert("Prediction failed: An unknown error occurred");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const safeParseDate = (dateStr: string) => {
    const parsedDate = new Date(dateStr);
    return isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="w-full max-w-xl flex flex-col gap-4 bg-gray-800 p-6 rounded-lg shadow-lg">
        <h1 className="text-center text-white font-semibold">meter-made</h1>
        <h2 className="text-center text-white">
          A machine learning model trained on expired meter parking tickets in Washington, DC issued in 2024
        </h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            ref={inputRef}
            type="text"
            placeholder="Enter an address"
            className="border p-2 w-full rounded"
          />
          <DatePicker
            selected={safeParseDate(input.d)}
            onChange={handleChange}
            showTimeSelect
            dateFormat="Pp"
            className="border p-2 w-full rounded custom-datepicker"
          />
          <button type="submit" className="bg-blue-500 text-white p-2 rounded" disabled={isLoading}>
            {isLoading ? "Loading..." : "Submit"}
          </button>
        </form>
        {error && <div className="mt-4 text-red-500">{error}</div>}
        {!hasSubmitted && <div className="mt-4 text-white">Please select a DC address, date, and time above</div>}
        {isLoading && <div className="mt-4 text-white">Loading...</div>}
        {predictionResult !== null && (
          <div
            className={`mt-4 p-4 border rounded ${
              predictionResult === 0 ? "bg-[#56A0D3] text-[#56A0D3]" : "bg-[#003B5C] text-[#003B5C]"
            }`}
          >
            <strong>Prediction Result:</strong>{" "}
            {predictionResult === 0
              ? "You are unlikely to get an expired meter ticket"
              : "You are likely to get an expired meter ticket"}
          </div>
        )}
        {isMapLoading && (
          <div className="mt-4 text-white loading-text">
            📍 Loading map... (this may take some time) 📍
          </div>
        )}
        {!isMapLoading && (
          <>
            <h2 className="mt-4 text-white">Below is a sample of model predictions for the current date and time:</h2>
            <MapContainer center={DC_COORDINATES} zoom={12} style={{ height: "600px" }}>
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="&copy; OpenStreetMap contributors"
              />
              <RenderMap isClient={isClient} mapData={mapData} data={points} />
            </MapContainer>
          </>
        )}
        <footer className="mt-8 text-center text-white">
          <a href="mailto:reedmarkham@gmail.com" className="flex items-center justify-center gap-2">
            <span>💌</span> reedmarkham@gmail.com
          </a>
        </footer>
      </div>
    </div>
  );
}

async function makePrediction(inputData: InputState) {
  const apiUrl = process.env.NEXT_PUBLIC_MODEL_API;
  if (!apiUrl) {
    throw new Error("NEXT_PUBLIC_MODEL_API environment variable is not defined");
  }

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(inputData),
    });

    const data = await response.json();

    if (response.ok) {
      return data.ticketed;
    } else {
      throw new Error(data.error || "Prediction failed");
    }
  } catch (error) {
    console.error("Prediction error:", error);
    throw error;
  }
}