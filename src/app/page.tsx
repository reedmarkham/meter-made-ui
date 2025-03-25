"use client";

import React, { useEffect, useState, useRef } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useLoadScript } from "@react-google-maps/api";
import { Library } from '@googlemaps/js-api-loader';
import * as d3 from "d3";
import * as topojson from "topojson-client";

const libraries: Library[] = ["places"];

interface InputState {
  d: string;
  h: number;
  x: number;
  y: number;
}

export default function App() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("NEXT_PUBLIC_GOOGLE_API_KEY environment variable is not defined");
  }

  console.log("NEXT_PUBLIC_GOOGLE_API_KEY:", apiKey);

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
    // Set up the SVG canvas dimensions
    const width = 800;
    const height = 600;

    // Create the SVG element
    const svg = d3.select(mapRef.current)
      .append("svg")
      .attr("width", width)
      .attr("height", height);

    // Define the projection and path generator
    const projection = d3.geoAlbersUsa()
      .scale(1000)
      .translate([width / 2, height / 2]);

    const path = d3.geoPath().projection(projection);

    // Color scale for the results
    const color = d3.scaleOrdinal()
      .domain(["0", "1"])
      .range(["#13294B", "#4B9CD3"]);

    // Load and display the map of DC
    d3.json("https://d3js.org/us-10m.v1.json").then(function(us: any) {
      svg.append("g")
        .selectAll("path")
        .data((topojson.feature(us, us.objects.states) as any).features)
        .enter().append("path")
        .attr("d", path as unknown as string)
        .attr("fill", "#ccc")
        .attr("stroke", "#333");

      // Generate random data points for demonstration
      const data = d3.range(100).map(() => ({
        x: Math.random() * width,
        y: Math.random() * height,
        result: Math.round(Math.random())
      }));

      // Plot the data points
      svg.selectAll("circle")
        .data(data)
        .enter().append("circle")
        .attr("cx", (d: { x: number; y: number; result: number }) => d.x)
        .attr("cy", (d: { x: number; y: number; result: number }) => d.y)
        .attr("r", 5)
        .attr("fill", (d: { x: number; y: number; result: number }) => color(d.result.toString()) as string);
    });

    // Function to call the model and get predictions
    async function makePrediction(inputData: InputState) {
      const apiUrl = process.env.NEXT_PUBLIC_MODEL_API;
      if (!apiUrl) {
        throw new Error("NEXT_PUBLIC_MODEL_API environment variable is not defined");
      }

      console.log("NEXT_PUBLIC_MODEL_API:", apiUrl);
      console.log("Input Data:", inputData);

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
        console.log("API Response:", data);

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

    // Update the data points with model predictions
    async function updateData() {
      const currentDate = new Date();
      const data = await Promise.all(d3.range(100).map(async () => {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const inputData = {
          d: currentDate.toISOString().split('T')[0],
          h: currentDate.getHours(),
          x: x,
          y: y
        };
        const result = await makePrediction(inputData);
        return { x, y, result };
      }));

      svg.selectAll("circle")
        .data(data)
        .attr("fill", (d: { x: number; y: number; result: number }) => color(d.result.toString()) as string);
    }

    // Update the data every hour
    setInterval(updateData, 3600000);
  }, []);

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
      console.log("Prediction result:", result);
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
        <div className="text-white">
          By (of code) <a href="https://cs.wikipedia.org/wiki/User:-xfi-" className="extiw" title="cs:User:-xfi-">cs:User:-xfi-</a> - own code according to <a rel="nofollow" className="external text" href="http://fotw.vexillum.com/flags/us-dc.html">Construction Details</a> (Government of the District of Columbia, untitled monograph, 1963, pp. 21-23., Public Domain, <a href="https://commons.wikimedia.org/w/index.php?curid=326649">Link</a>
        </div>
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
            className="border p-2 w-full rounded"
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

  console.log("NEXT_PUBLIC_MODEL_API:", apiUrl);
  console.log("Input Data:", inputData);

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
    console.log("API Response:", data);

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