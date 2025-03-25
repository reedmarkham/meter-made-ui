"use client";

import React, { useEffect, useState, useRef } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useLoadScript } from "@react-google-maps/api";
import { Library } from '@googlemaps/js-api-loader';
import * as d3 from "d3";
import * as topojson from "topojson-client";
import "./styles.css"; // Import the custom CSS file

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

function gatherEligiblePoints(mapData: GeoJSON.Feature[], projection: d3.GeoProjection, width: number, height: number): Point[] {
  const dcBoundary = mapData.find(feature => feature.properties?.name === "District of Columbia");
  if (!dcBoundary) return [];

  const eligiblePoints: Point[] = [];
  for (let x = 0; x < width; x += 10) {
    for (let y = 0; y < height; y += 10) {
      const invertedPoint = projection.invert ? projection.invert([x, y]) : null;
      if (invertedPoint) {
        const [longitude, latitude] = invertedPoint;
        if (d3.geoContains(dcBoundary, [longitude, latitude])) {
          eligiblePoints.push({ x, y, result: Math.round(Math.random()) });
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

function renderMap(mapData: GeoJSON.Feature[], mapRef: React.RefObject<HTMLDivElement>, data: Point[]) {
  const width = 800;
  const height = 600;

  const svg = d3.select(mapRef.current)
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const projection = d3.geoAlbersUsa()
    .scale(1000)
    .translate([width / 2, height / 2]);

  const path = d3.geoPath().projection(projection);

  const color = d3.scaleOrdinal()
    .domain(["0", "1"])
    .range(["#001f3f", "#7FDBFF"]);

  svg.append("g")
    .selectAll("path")
    .data(mapData)
    .enter().append("path")
    .attr("d", path as unknown as string)
    .attr("fill", "#ccc")
    .attr("stroke", "#333");

  svg.selectAll("circle")
    .data(data)
    .enter().append("circle")
    .attr("cx", (d: Point) => d.x)
    .attr("cy", (d: Point) => d.y)
    .attr("r", 5)
    .attr("fill", (d: Point) => color(d.result.toString()) as string);
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

  const inputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);

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
      const width = 800;
      const height = 600;
      const projection = d3.geoAlbersUsa()
        .scale(1000)
        .translate([width / 2, height / 2]);
      const eligiblePoints = gatherEligiblePoints(mapData, projection, width, height);
      const data = samplePoints(eligiblePoints, 100);
      if (mapRef.current) {
        renderMap(mapData, mapRef as React.RefObject<HTMLDivElement>, data);
      }
      setIsMapLoading(false);
    } else {
      const width = 800;
      const height = 600;

      const projection = d3.geoAlbersUsa()
        .scale(1000)
        .translate([width / 2, height / 2]);

      d3.json("https://d3js.org/us-10m.v1.json").then(function(us: any) {
        const mapData = (topojson.feature(us, us.objects.states) as unknown as GeoJSON.FeatureCollection).features;
        localStorage.setItem("mapData", JSON.stringify(mapData));
        const eligiblePoints = gatherEligiblePoints(mapData, projection, width, height);
        const data = samplePoints(eligiblePoints, 100);
        if (mapRef.current) {
          renderMap(mapData, mapRef as React.RefObject<HTMLDivElement>, data);
        }
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
        <div ref={mapRef} className="mt-4"></div> {/* Add a div to render the map */}
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