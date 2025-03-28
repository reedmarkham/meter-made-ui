"use client";

import React, { useState, useEffect } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useLoadScript } from "@react-google-maps/api";
import { Library } from "@googlemaps/js-api-loader";

const libraries: Library[] = ["geometry", "places"];

interface InputState {
  d: string;
  h: number;
  x: number;
  y: number;
}

interface Point {
  x: number;  // longitude
  y: number;  // latitude
  result: number;
  address?: string;  // Optional field for address
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
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<Point[]>([]);

  const inputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isLoaded || loadError || !inputRef.current) return;

    const options = {
      componentRestrictions: { country: "us" },
      fields: ["address_components", "geometry"],
    };

    if (typeof window !== "undefined" && window.google?.maps) {
      const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current!, options);
      autocomplete.addListener("place_changed", () => handlePlaceChanged(autocomplete));

      return () => window.google.maps.event.clearInstanceListeners(autocomplete);
    }
  }, [isLoaded, loadError]);

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
      x: location.lng(),
      y: location.lat(),
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

      // Generate 5 random points (addresses) and fetch their predictions
      const generatedPoints = generateRandomPointsInDC(5);
      const pointsWithResults = await Promise.all(
        generatedPoints.map(async (point) => {
          const result = await makePrediction({
            d: input.d,
            h: input.h,
            x: point.x,
            y: point.y,
          });

          // Fetch address for each generated point using reverse geocoding
          const address = await getAddressFromCoordinates(point.x, point.y);

          return { ...point, result, address };
        })
      );
      setPoints(pointsWithResults);

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

  const dcBoundaryPolygon = [
    [-77.119759, 38.791645],
    [-77.009051, 38.791645],
    [-77.009051, 38.995548],
    [-77.119759, 38.995548],
    [-77.119759, 38.791645],
    [-77.052066, 38.791645],
    [-77.052066, 38.995548],
    [-77.069781, 38.995548],
    [-77.069781, 38.905553],
    [-77.087945, 38.905553],
    [-77.087945, 38.852533],
    [-77.118206, 38.852533],
    [-77.118206, 38.791645],
  ];
  
  const isPointInDC = (longitude: number, latitude: number): boolean => {
    const point = new google.maps.LatLng(latitude, longitude);
    const polygon = new google.maps.Polygon({ paths: dcBoundaryPolygon });
    return google.maps.geometry.poly.containsLocation(point, polygon);
  };
  
  const generateRandomPointsInDC = (n: number): Point[] => {
    const latMin = 38.791;  // Southernmost point of DC
    const latMax = 38.995;  // Northernmost point of DC
    const lngMin = -77.119;  // Westernmost point of DC
    const lngMax = -76.909;  // Easternmost point of DC
  
    const points: Point[] = [];
    let attempts = 0;
  
    // Generate points until we have n valid ones within DC's bounds
    while (points.length < n && attempts < 100) {
      const lat = Math.random() * (latMax - latMin) + latMin;
      const lng = Math.random() * (lngMax - lngMin) + lngMin;
  
      // Check if the point is within DC's geographical bounds using the polygon check
      if (isPointInDC(lng, lat)) {
        points.push({ x: lng, y: lat, result: -1 });  // -1 to denote an unpredicted point
      }
  
      attempts++;
    }
  
    return points;
  };

  // Function to reverse geocode coordinates to an address
  const getAddressFromCoordinates = async (longitude: number, latitude: number): Promise<string> => {
    const geocoder = new google.maps.Geocoder();
    return new Promise((resolve, reject) => {
      const latLng = new google.maps.LatLng(latitude, longitude);
      geocoder.geocode({ location: latLng }, (results, status) => {
        if (status === google.maps.GeocoderStatus.OK && results?.[0]) {
          const address = results[0].formatted_address;
          const addressComponents = results[0].address_components;
  
          // Check if the address contains "Washington" or "District of Columbia"
          const isDC = addressComponents?.some((component) =>
            component.long_name.includes("Washington") || component.long_name.includes("District of Columbia")
          );
  
          if (isDC) {
            resolve(address);  // Return address if it's in DC
          } else {
            reject("Address is not in Washington, DC");
          }
        } else {
          reject("Failed to get address");
        }
      });
    });
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="w-full max-w-xl flex flex-col gap-4 bg-gray-800 p-6 rounded-lg shadow-lg">
        <h1 className="text-center text-white font-semibold text-4xl">meter-made</h1>
        <h2 className="text-center text-white text-2xl">
          A machine learning model to predict parking tickets for expired meters in Washington, DC
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
        {!hasSubmitted && <div className="mt-4 text-white">Please select a DC address, date, and time above. Upon submission, a sample of model predictions will also display below.</div>}
        {isLoading && <div className="mt-4 text-white">Loading...</div>}
        {predictionResult !== null && (
          <div className={`mt-4 p-4 border rounded ${
            predictionResult === 0 ? "bg-[#003B5C] text-white" : "bg-[#56A0D3] text-white"
          }`}>
            <strong>Prediction Result:</strong>{" "}
            {predictionResult === 0
              ? "You are unlikely to get an expired meter ticket"
              : "You are likely to get an expired meter ticket"}
          </div>
        )}
        
        {/* Display the sampled points with addresses and prediction results */}
        <div className="mt-4 text-white">
          <h3 className="text-xl font-semibold">Sampled Points and Predictions</h3>
          <ul>
            {points.map((point, index) => (
              <li key={index} className="py-2">
                <strong>Address:</strong> {point.address || "Address not found"}<br />
                <strong>Prediction:</strong> {point.result === 0
                  ? "Unlikely to get an expired meter ticket"
                  : "Likely to get an expired meter ticket"}
              </li>
            ))}
          </ul>
        </div>

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
