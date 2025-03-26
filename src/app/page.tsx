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
import L from "leaflet";

// Dynamically import Leaflet components to avoid SSR issues
const MapContainer = dynamic(() => import("react-leaflet").then((mod) => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((mod) => mod.TileLayer), { ssr: false });

// Dynamically import custom Map component
const Map = dynamic(() => import('@/components/map/'), { ssr: false });

const libraries: Library[] = ["places"];
const SAMPLE_SIZE = 50;

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

function gatherEligiblePoints(mapData: GeoJSON.Feature[], isClient: boolean): Point[] {
  if (typeof window === 'undefined') return []; 
  
  if (!isClient) {
    return []; // Return an empty array during SSR
  }

  const dcBoundary = mapData.find((feature) => feature.properties?.name === "District of Columbia");
  if (!dcBoundary) return [];

  const eligiblePoints: Point[] = [];
  
  // Ensure Leaflet-related code only runs on the client
  if (isClient) {
    const bounds = L.geoJSON(dcBoundary).getBounds();
    const latMin = bounds.getSouthWest().lat;
    const latMax = bounds.getNorthEast().lat;
    const lngMin = bounds.getSouthWest().lng;
    const lngMax = bounds.getNorthEast().lng;

    for (let lat = latMin; lat <= latMax; lat += 0.01) {
      for (let lng = lngMin; lng <= lngMax; lng += 0.01) {
        if (bounds.contains([lat, lng])) {
          eligiblePoints.push({ x: lng, y: lat, result: Math.round(Math.random()) });
        }
      }
    }
  }

  return eligiblePoints;
}

function samplePoints(eligiblePoints: Point[], sampleSize: number): Point[] {
  const sampledPoints: Point[] = [];
  while (sampledPoints.length < sampleSize && eligiblePoints.length > 0) {
    const index = Math.floor(Math.random() * eligiblePoints.length);
    sampledPoints.push(eligiblePoints.splice(index, 1)[0]);
  }
  return sampledPoints;
}

function RenderMap({
  isClient,
  mapData,
  data,
}: {
  isClient: boolean;
  mapData: GeoJSON.Feature[];
  data: Point[];
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isClient && mapRef.current) {
      // Initialize map using Leaflet only when it's client-side
      const map = L.map(mapRef.current as HTMLElement).setView([38.9072, -77.0369], 12);

      // Add tile layer
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

      const bounds = L.geoJSON(mapData).getBounds();
      map.fitBounds(bounds);

      // Add circles for each point
      data.forEach((point) => {
        L.circle([point.y, point.x], {
          color: point.result === 0 ? "#56A0D3" : "#003B5C", // Lighter blue for negative, darker blue for positive
          radius: 50,
        }).addTo(map);
      });

      // Cleanup on component unmount
      return () => {
        map.remove();
      };
    }
  }, [isClient, mapData, data]);

  // Prevent map rendering during SSR
  if (!isClient) return null;

  // Return the custom Map component with necessary props
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
  const [cacheTimestamp, setCacheTimestamp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsClient(true);
    }
  }, []);

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

  useEffect(() => {
    if (!isClient || typeof localStorage === "undefined") return;
  
    const cachedMapData = localStorage.getItem("mapData");
    const cachedTimestamp = localStorage.getItem("mapDataTimestamp");
    const now = new Date();
  
    // If cache is available and valid
    if (cachedMapData && cachedTimestamp) {
      const cachedDate = new Date(cachedTimestamp);
      const hoursDifference = (now.getTime() - cachedDate.getTime()) / (1000 * 60 * 60);
  
      // Only use cache if it's less than 3 hours old
      if (hoursDifference < 3) {
        try {
          const mapData = JSON.parse(cachedMapData);
          const eligiblePoints = gatherEligiblePoints(mapData, isClient);
          const data = samplePoints(eligiblePoints, SAMPLE_SIZE);
          setMapData(mapData);
          setPoints(data);
          setCacheTimestamp(cachedTimestamp);
          setIsMapLoading(false);
          return; // Exit if cache is valid
        } catch (error) {
          console.error("Error parsing cached map data:", error);
        }
      }
    }
  
    // Fetch new map data if no valid cache is available
    fetch("https://d3js.org/us-10m.v1.json")
      .then((response) => response.json())
      .then((us: Topology) => {
        const mapData = (topojson.feature(us, us.objects.states) as unknown as GeoJSON.FeatureCollection).features;
        const eligiblePoints = gatherEligiblePoints(mapData, isClient);
        const data = samplePoints(eligiblePoints, SAMPLE_SIZE);
        const timestamp = now.toISOString();
        
        // Store in localStorage for future use
        localStorage.setItem("mapData", JSON.stringify(mapData));
        localStorage.setItem("mapDataTimestamp", timestamp);
  
        setMapData(mapData);
        setPoints(data);
        setCacheTimestamp(timestamp);
        setIsMapLoading(false);
      })
      .catch((error) => {
        console.error("Error fetching map data:", error);
        // Handle fetch error (show a fallback message or retry logic)
        setIsMapLoading(false);
      });
  }, [isClient]);
  

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
            📍 Loading map... (this may take some time, but it will be cached for your next visit) 📍
          </div>
        )}
        {!isMapLoading && (
          <>
            <h2 className="mt-4 text-white">Below is a sample of model predictions for the current date and time:</h2>
            <MapContainer center={[38.9072, -77.0369]} zoom={12} style={{ height: "600px" }}>
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="&copy; OpenStreetMap contributors"
              />
              <RenderMap isClient={isClient} mapData={mapData} data={points} />
            </MapContainer>
            {cacheTimestamp && (
              <div className="mt-4 text-white">
                <strong>Map last cached at:</strong> {new Date(cacheTimestamp).toLocaleString()}
              </div>
            )}
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