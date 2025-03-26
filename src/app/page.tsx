"use client";

import React, { useEffect, useState, useRef } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useLoadScript } from "@react-google-maps/api";
import { Library } from '@googlemaps/js-api-loader';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import "leaflet/dist/leaflet.css";
import "./styles.css"; // Import the custom CSS file
import { Topology } from "topojson-specification";
import * as topojson from "topojson-client";

const libraries: Library[] = ["places"];

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

function gatherEligiblePoints(mapData: GeoJSON.Feature[]): Point[] {
  const dcBoundary = mapData.find(feature => feature.properties?.name === "District of Columbia");
  if (!dcBoundary) return [];

  const eligiblePoints: Point[] = [];
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

function RenderMap({ mapData, data }: { mapData: GeoJSON.Feature[], data: Point[] }) {
  const map = useMap();

  useEffect(() => {
    const bounds = L.geoJSON(mapData).getBounds();
    map.fitBounds(bounds);

    data.forEach(point => {
      L.circle([point.y, point.x], {
        color: point.result === 0 ? 'green' : 'red',
        radius: 50
      }).addTo(map);
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

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isLoaded || loadError) return;

    const options = {
      componentRestrictions: { country: "us" },
      fields: ["address_components", "geometry"],
    };

    const autocomplete = new google.maps.places.Autocomplete(inputRef.current!, options);
    autocomplete.addListener("place_changed", () => handlePlaceChanged(autocomplete));

    return () => google.maps.event.clearInstanceListeners(autocomplete);
  }, [isLoaded, loadError]);

  useEffect(() => {
    const cachedMapData = localStorage.getItem("mapData");
    if (cachedMapData) {
      const mapData = JSON.parse(cachedMapData);
      const eligiblePoints = gatherEligiblePoints(mapData);
      const data = samplePoints(eligiblePoints, 100);
      setMapData(mapData);
      setPoints(data);
      setIsMapLoading(false);
    } else {
      fetch("https://d3js.org/us-10m.v1.json")
        .then(response => response.json())
        .then((us: Topology) => {
          const mapData = (topojson.feature(us, us.objects.states) as unknown as GeoJSON.FeatureCollection).features;
          localStorage.setItem("mapData", JSON.stringify(mapData));
          const eligiblePoints = gatherEligiblePoints(mapData);
          const data = samplePoints(eligiblePoints, 100);
          setMapData(mapData);
          setPoints(data);
          setIsMapLoading(false);
        });
    }
  }, [isLoaded, loadError]);

  const handlePlaceChanged = (autocomplete: google.maps.places.Autocomplete) => {
    const place = autocomplete.getPlace();
    if (!place || !place.geometry || !place.geometry.location) return;

    const location = place.geometry.location;
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
        d: date.toISOString().split('T')[0],
        h: date.getHours(),
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
            className="border p-2 w-full rounded custom-datepicker" // Apply custom class
          />
          <button type="submit" className="bg-blue-500 text-white p-2 rounded" disabled={isLoading}>
            {isLoading ? "Loading..." : "Submit"}
          </button>
        </form>
        {!hasSubmitted && <div className="mt-4 text-white">Please select a DC address, date, and time above</div>}
        {isLoading && <div className="mt-4 text-white">Loading...</div>}
        {predictionResult !== null && (
          <div className={`mt-4 p-4 border rounded ${predictionResult === 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            <strong>Prediction Result:</strong> {predictionResult === 0 ? "You are unlikely to get an expired meter ticket" : "You are likely to get an expired meter ticket"}
          </div>
        )}
        {isMapLoading && <div className="mt-4 text-white">Loading map...</div>}
        {!isMapLoading && (
          <>
            <h2 className="mt-4 text-white">Below is a sample of model predictions for the current date and time:</h2>
            <MapContainer center={[38.9072, -77.0369]} zoom={12} style={{ height: "600px" }}>
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="&copy; OpenStreetMap contributors"
              />
              <RenderMap mapData={mapData} data={points} />
            </MapContainer>
          </>
        )}
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
        "accept": "application/json",
        "Content-Type": "application/json"
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