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
import proj4 from "proj4";

proj4.defs([
  ["EPSG:5070", "+proj=aea +lat_1=29.5 +lat_2=45.5 +lat_0=23 +lon_0=-96 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs"],
  ["EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs"]
]);

const libraries: Library[] = ["places"];
const SAMPLE_SIZE = 50;

// Dynamically import custom Map component
const Map = dynamic(() => import('@/components/map/'), { ssr: false });

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
  // const { default: proj4 } = await import("proj4");

  // proj4.defs([
  //  ["EPSG:3857", "+proj=merc +lon_0=0 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs"],
  //  ["EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs"],
  //]);

  if (!mapData || mapData.length === 0) {
    console.warn("DC map data not found.");
    return [];
  }

  const eligiblePoints: Point[] = [];
  const bounds = L.geoJSON(mapData).getBounds();
  const latMin = bounds.getSouthWest().lat;
  const latMax = bounds.getNorthEast().lat;
  const lngMin = bounds.getSouthWest().lng;
  const lngMax = bounds.getNorthEast().lng;

  console.log("Bounds: ", { latMin, latMax, lngMin, lngMax });

  for (let i = 0; i < SAMPLE_SIZE * 10; i++) {
    const lat = latMin + Math.random() * (latMax - latMin);
    const lng = lngMin + Math.random() * (lngMax - lngMin);
    const isInside = bounds.contains([lat, lng]);

    // console.log(`Generated lat/lng: [${lat}, ${lng}] - Is inside bounds: ${isInside}`);

    if (isInside) {
      const x = lng;
      const y = lat;

      // Log before and after projection
      // console.log("Before projection: lat/lng", lat, lng);

      //if (proj4) {
        //[x, y] = proj4("EPSG:4326", "EPSG:3857", [lng, lat]);
        // console.log("After projection: x/y", x, y);
      //}

      if (!isNaN(x) && !isNaN(y)) {
        eligiblePoints.push({ x, y, result: Math.round(Math.random()) });
        // console.log("Eligible point added:", { x, y });
      }
    }
  }

  console.log("Total eligible points:", eligiblePoints.length);
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

function RenderMap({ isClient, mapData, data }: { isClient: boolean; mapData: GeoJSON.FeatureCollection; data: Point[] }) {
  if (!isClient) return null;
  console.log("Rendering map container...");
  return <Map isClient={isClient} mapData={mapData} data={data} />;
}

type Position = number[];

function reprojectFeature(feature: GeoJSON.Feature): GeoJSON.Feature {
  const isValidCoordinate = (coord: any) => 
    Array.isArray(coord) && coord.length === 2 && !isNaN(coord[0]) && !isNaN(coord[1]);
  
  const reprojectGeometryCoordinates = (coordinates: [number, number][][]): Position[][] => {
    return coordinates
      .map((polygon) =>
        polygon.filter((coord) => isValidCoordinate(coord))
      )
      .map((polygon) => 
        polygon.map((coord) => {
          const projectedCoord: Position = proj4("EPSG:5070", "EPSG:4326", coord);
          return [projectedCoord[0], projectedCoord[1]]; // Return as [number, number] tuple
        })
      );
  };

  if (feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon") {
    feature.geometry.coordinates = reprojectGeometryCoordinates(feature.geometry.coordinates as [number, number][][]);
  }

  return feature;
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
  const [geoJsonReprojected, setMapData] = useState<GeoJSON.FeatureCollection<GeoJSON.Geometry, GeoJSON.GeoJsonProperties>>({
    type: "FeatureCollection",
    features: []
  });
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
    
        // Convert TopoJSON to GeoJSON, and explicitly cast to GeoJSON.FeatureCollection
        const geoJson = topojson.feature(us, us.objects.states) as GeoJSON.FeatureCollection;
    
        // Filter for Washington, DC by its id
        const mapData: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: geoJson.features.filter((d) => d.id === "11"),  // Filtering for DC
        };
    
        // Log the GeoJSON before using it
        console.log("Original mapData:", mapData);
    
        // Validate if the coordinates are in EPSG:4326 (lat/lng)
         /* mapData.forEach((feature) => {
          const geometry = feature.geometry;
    
          if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
            const coordinates = geometry.coordinates;
    
            // Handle MultiPolygon or Polygon coordinates
            if (Array.isArray(coordinates[0][0])) {
              // MultiPolygon (array of polygons)
              (coordinates as GeoJSON.Position[][]).forEach((polygon: GeoJSON.Position[]) => {
                polygon.forEach((coord: GeoJSON.Position) => {
                  console.log(`Feature ${index}: coord`, coord); // Log each coordinate pair
                });
              });
            } else {
              // Polygon (single polygon)
              (coordinates as GeoJSON.Position[][]).forEach((polygon: GeoJSON.Position[]) => {
                polygon.forEach((coord: GeoJSON.Position) => {
                  console.log(`Feature ${index}: coord`, coord); // Log each coordinate pair
                });
              });
            }
          } else {
            console.warn(`Unsupported geometry type: ${geometry.type}`);
          }
        }); */
    
        // Pass mapData to gatherEligiblePoints to ensure correct bounds        
        const geoJsonReprojected = mapData.features.map(reprojectFeature);
        const eligiblePoints = await gatherEligiblePoints(geoJsonReprojected, isClient);
        const data = samplePoints(eligiblePoints, SAMPLE_SIZE);
    
        setMapData({
          type: "FeatureCollection",
          features: geoJsonReprojected.map(reprojectFeature)
        });
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
        {!hasSubmitted && <div className="mt-4 text-white">Please select a DC address, date, and time above</div>}
        {isLoading && <div className="mt-4 text-white">Loading...</div>}
        {predictionResult !== null && (
            <div
            className={`mt-4 p-4 border rounded ${
              predictionResult === 0 ? "bg-[#003B5C] text-white" : "bg-[#56A0D3] text-white"
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
        {!isMapLoading && geoJsonReprojected && points.length > 0 && (
          <>
            <h2 className="mt-4 text-white">Below is a sample of predicted tickets (or not) for the current date and time:</h2>
            <RenderMap isClient={isClient} mapData={geoJsonReprojected} data={points} />
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