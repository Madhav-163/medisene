"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, MapPin, Phone, Clock, Star, Navigation, Filter, Search, AlertTriangle, Loader2 } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"
import { supabase } from "@/lib/supabase-client"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import Script from "next/script"
import { cn } from "@/lib/utils"

// Google Maps API Key for hospital finder
// const GOOGLE_MAPS_API_KEY = "AIzaSyAigzVKeNFdqDQjCw_D9SBZGuXFl0hF3oA" // Commented out
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

// Add TypeScript declarations for Google Maps API
declare global {
  interface Window {
    google: typeof google
  }
}

interface HospitalWithDistance {
  id: string;
  name: string;
  address: string;
  phone_number?: string;
  website?: string;
  rating?: number;
  distance: number;
  availability: "open" | "closed" | "unknown";
  waitTime: string;
  latitude?: number;
  longitude?: number;
  services_offered?: string;
  operating_hours?: string;
  images?: string[];
  type?: string;
  specialties?: string[];
  accepts_insurance?: boolean;
}

// Define interface for geolocation coordinates
interface Coordinates {
  latitude: number
  longitude: number
}

export default function HospitalsPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [hospitals, setHospitals] = useState<HospitalWithDistance[]>([])
  const [filteredHospitals, setFilteredHospitals] = useState<HospitalWithDistance[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [filterType, setFilterType] = useState("nearest")
  const [userLocation, setUserLocation] = useState<string>("")
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null)
  const [locationError, setLocationError] = useState<string>("")
  const [map, setMap] = useState<google.maps.Map | null>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const [markers, setMarkers] = useState<google.maps.Marker[]>([])
  const [isMapScriptLoaded, setIsMapScriptLoaded] = useState(false);

  const { user, loading } = useAuth()

  // Function to get user's current location
  const getUserLocation = () => {
    console.log("[Debug] getUserLocation invoked."); // Log when this function is called
    if (navigator.geolocation) {
      setIsLoading(true)
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords
          console.log(`[Debug] Location acquired: Lat=${latitude}, Lon=${longitude}, Accuracy=${accuracy} meters`);
          setCoordinates({ latitude, longitude })
          // Get address from coordinates using reverse geocoding
          fetchAddressFromCoordinates(latitude, longitude)
        },
        (error) => {
          console.error("Error getting location:", error)
          setLocationError("Unable to get your location. Please enable location services.")
          setIsLoading(false)
          // Fallback to default location
          setUserLocation("Location unavailable")
          fetchHospitals(null)
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      )
    } else {
      setLocationError("Geolocation is not supported by your browser.")
      setIsLoading(false)
      // Fallback to default location
      setUserLocation("Location unavailable")
      fetchHospitals(null)
    }
  }

  // Fetch address from coordinates using Google Maps Geocoding API
  const fetchAddressFromCoordinates = async (latitude: number, longitude: number) => {
    if (!GOOGLE_MAPS_API_KEY) {
      console.error("Google Maps API key is not configured.")
      setLocationError("Google Maps API key is not configured. Please check your environment variables.")
      setUserLocation("API key error.")
      setIsLoading(false)
      return
    }
    console.log("[Debug] Fetching address for coordinates:", { latitude, longitude }); // Log coordinates
    console.log("[Debug] Using Google Maps API Key (first 5 chars):", GOOGLE_MAPS_API_KEY ? GOOGLE_MAPS_API_KEY.substring(0, 5) : "KEY_IS_UNDEFINED");
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`
      )
      console.log("[Debug] Geocoding API Response Status:", response.status);
      const data = await response.json()
      console.log("[Debug] Geocoding API Response Data:", data);

      if (data.status === "OK" && data.results && data.results.length > 0) {
        const formattedAddress = data.results[0].formatted_address
        setUserLocation(formattedAddress)
        setLocationError("") // Clear previous location errors
      } else {
        console.error("Error fetching address from Google Geocoding API:", data.status, data.error_message);
        setLocationError(`Could not get address. Geocoding: ${data.status} ${data.error_message || ""}`.trim())
        setUserLocation(`Lat: ${latitude.toFixed(4)}, Lon: ${longitude.toFixed(4)} (Address not found)`)
      }

      fetchHospitals({ latitude, longitude })
    } catch (error) {
      console.error("Exception fetching address:", error);
      setLocationError("Exception occurred while fetching address. Check console.")
      setUserLocation(`Lat: ${latitude.toFixed(4)}, Lon: ${longitude.toFixed(4)} (Address fetch failed)`)
      fetchHospitals({ latitude, longitude }) // Still try to fetch hospitals with raw coords
    }
  }

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth")
      return
    }

    // Only attempt to get location if we have a user AND we don't already have coordinates
    if (user && !coordinates) { 
      console.log("[Debug] Auth useEffect: User loaded and no coordinates exist, calling getUserLocation.");
      getUserLocation()
    } else if (user && coordinates) {
      console.log("[Debug] Auth useEffect: User loaded and coordinates already exist, skipping getUserLocation call.");
    }
  }, [user, loading, router, coordinates]); // Added coordinates to dependency array

  // Initialize map when coordinates are available and map script is loaded
  useEffect(() => {
    // This effect is responsible for creating and cleaning up the map instance itself.
    if (coordinates && isMapScriptLoaded && !mapRef.current && document.getElementById("map")) {
      console.log("[Debug] Initializing new map instance via ref.");
      const newMapInstance = new google.maps.Map(document.getElementById("map")!, {
        center: { lat: coordinates.latitude, lng: coordinates.longitude },
        zoom: 12,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
      });

      // Add user location marker
      new google.maps.Marker({
        position: { lat: coordinates.latitude, lng: coordinates.longitude },
        map: newMapInstance,
        title: "Your Location",
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#4285F4",
          fillOpacity: 1,
          strokeColor: "white",
          strokeWeight: 2,
        },
      });
      mapRef.current = newMapInstance;
      setMap(newMapInstance); // Update state to trigger other effects that depend on the map

    } else if (coordinates && isMapScriptLoaded && !document.getElementById("map")) {
      console.warn("Map element not found when trying to initialize, delaying.");
    }

    // Cleanup function: Called when dependencies change or component unmounts.
    return () => {
      if (mapRef.current) {
        console.log("[Debug] Cleaning up map instance from ref.");
        markers.forEach(marker => {
          try {
            marker.setMap(null);
          } catch (e) {
            console.warn("[Debug] Error clearing marker during map cleanup:", e);
          }
        }); 
        mapRef.current = null;
      }
      setMap(null); 
      setMarkers([]); 
    };
  }, [coordinates, isMapScriptLoaded]); 

  // Add/Update markers for hospitals
  useEffect(() => {
    if (map && google && google.maps) { 
      // Store a reference to current markers before updating, for safe cleanup
      const oldMarkers = [...markers];

      // Clear existing markers from the current map instance before adding new ones
      oldMarkers.forEach(marker => {
        try {
          marker.setMap(null);
        } catch (e) {
          console.warn("[Debug] Error clearing old marker during update:", e);
        }
      });
      const newMarkers: google.maps.Marker[] = [];

      if (filteredHospitals.length > 0) {
        filteredHospitals.forEach(hospital => {
          if (hospital.latitude && hospital.longitude) {
            const marker = new google.maps.Marker({
              position: { lat: hospital.latitude, lng: hospital.longitude },
              map: map, // Use the map from state
              title: hospital.name,
              icon: {
                url: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
              },
            });

            const infoWindow = new google.maps.InfoWindow({
              content: `
                <div style="width: 200px">
                  <h3 style="margin: 0; font-size: 16px;">${hospital.name}</h3>
                  <p style="margin: 5px 0; font-size: 12px;">${hospital.address}</p>
                  <p style="margin: 5px 0; font-size: 12px;">Distance: ${hospital.distance.toFixed(1)} miles</p>
                  <p style="margin: 5px 0; font-size: 12px;">Wait time: ${hospital.waitTime}</p>
                </div>
              `,
            });

            marker.addListener("click", () => {
              infoWindow.open(map, marker);
            });
            newMarkers.push(marker);
          }
        });
      }
      setMarkers(newMarkers); // Update state with new markers (even if empty)
    }
    // This effect should run when the map is ready or when filteredHospitals change
  }, [map, filteredHospitals]); // Removed markers and setMarkers from deps as we are setting them here

  // Calculate distance between two coordinates using Haversine formula
  const calculateDistance = useCallback((lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 3958.8; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return parseFloat(distance.toFixed(1));
  }, []);

  const fetchHospitals = useCallback(async (coords: Coordinates | null) => {
    if (!coords || !map || !isMapScriptLoaded) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    // Ensure google.maps.places.PlacesService is available
    if (!google || !google.maps || !google.maps.places || !map) {
      console.error("Google Maps Places Service or map instance not available.");
      setLocationError("Map service not ready. Please try again shortly.");
      setIsLoading(false);
      return;
    }

    const placesService = new google.maps.places.PlacesService(map);
    const request: google.maps.places.PlaceSearchRequest = {
      location: new google.maps.LatLng(coords.latitude, coords.longitude),
      radius: 50000, // 50km radius
      type: "hospital",
    };

    placesService.nearbySearch(request, (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        const fetchedHospitalsWithDistance: HospitalWithDistance[] = results.map((place, index) => {
          const placeLocation = place.geometry?.location;
          let distance = 0;
          if (placeLocation && coords) {
            distance = calculateDistance(
              coords.latitude,
              coords.longitude,
              placeLocation.lat(),
              placeLocation.lng()
            );
          }

          let availabilityStatus: "open" | "closed" | "unknown" = "unknown";
          // Detailed logging for opening_hours
          if (place.name && (index < 3 || place.name.toLowerCase().includes("general"))) { // Log for first 3 results or specific names for easier debugging
              console.log(`[Debug OpeningHours] Place: ${place.name}, Raw opening_hours:`, JSON.parse(JSON.stringify(place.opening_hours || null)));
          }

          if (place.opening_hours) {
            if (typeof place.opening_hours.open_now === 'boolean') {
              availabilityStatus = place.opening_hours.open_now ? "open" : "closed";
              if (place.name && (index < 3 || place.name.toLowerCase().includes("general"))) {
                  console.log(`[Debug OpeningHours] Place: ${place.name}, Status from open_now property: ${availabilityStatus}`);
              }
            } else {
              // open_now is undefined, try isOpen() method
              try {
                availabilityStatus = place.opening_hours.isOpen() ? "open" : "closed";
                if (place.name && (index < 3 || place.name.toLowerCase().includes("general"))) {
                  console.log(`[Debug OpeningHours] Place: ${place.name}, Status from isOpen() method: ${availabilityStatus}`);
                }
              } catch (e) {
                if (place.name && (index < 3 || place.name.toLowerCase().includes("general"))) {
                  console.warn(`[Debug OpeningHours] Place: ${place.name}, Error calling isOpen():`, e);
                }
                availabilityStatus = "unknown"; // Fallback if isOpen() fails
              }
            }
          } else {
            if (place.name && (index < 3 || place.name.toLowerCase().includes("general"))) {
              console.log(`[Debug OpeningHours] Place: ${place.name}, No opening_hours object provided.`);
            }
            availabilityStatus = "unknown";
          }

          let displayType = "hospital";
          if (place.types?.includes("clinic")) displayType = "clinic";
          if (place.types?.includes("urgent_care_facility")) displayType = "urgent-care";
          if (place.types?.includes("doctor")) displayType = "doctor";
          if (place.types?.includes("hospital")) displayType = "hospital";

          return {
            id: place.place_id || `hospital-${index}`,
            name: place.name || "Unknown Hospital",
            address: place.vicinity || "Address not available",
            phone_number: place.international_phone_number || undefined,
            website: place.website || undefined,
            operating_hours: place.opening_hours?.weekday_text?.join(", ") || undefined,
            rating: place.rating || undefined,
            images: place.photos?.map(p => p.getUrl({maxWidth: 400, maxHeight: 300})) || [],
            distance: distance,
            availability: availabilityStatus,
            waitTime: "Varies", // Placeholder, actual wait time is complex
            latitude: placeLocation?.lat(),
            longitude: placeLocation?.lng(),
            type: displayType,
            specialties: place.types || [],
            services_offered: place.types?.join(', ')
          };
        });
        setHospitals(fetchedHospitalsWithDistance);
        // setFilteredHospitals will be updated by the other useEffect dependent on 'hospitals'
        if (fetchedHospitalsWithDistance.length === 0) {
          setLocationError("No hospitals found within the search radius for your current location and filters.");
        } else {
          setLocationError("");
        }
      } else {
        console.error("Error fetching hospitals from Google Places:", status);
        let placesError = "Could not fetch hospitals. ";
        switch (status) {
          case google.maps.places.PlacesServiceStatus.ZERO_RESULTS:
            placesError += "No hospitals found matching your criteria.";
            break;
          case google.maps.places.PlacesServiceStatus.OVER_QUERY_LIMIT:
            placesError += "API usage limit reached. Please check your Google Cloud quota.";
            break;
          case google.maps.places.PlacesServiceStatus.REQUEST_DENIED:
            placesError += "Request denied. Check your API key and ensure Places API is enabled.";
            break;
          case google.maps.places.PlacesServiceStatus.INVALID_REQUEST:
            placesError += "Invalid request. (This is likely a code issue).";
            break;
          default:
            placesError += `Google Places API returned: ${status}`;
        }
        setLocationError(placesError);
        setHospitals([]);
        // setFilteredHospitals([]); // This will be handled by the other useEffect
      }
      setIsLoading(false);
    });
  }, [map, isMapScriptLoaded, calculateDistance, setIsLoading, setLocationError, setHospitals]); // Added missing state setters to dependencies

  // This is the new function that will manage staged searching.
  const performStagedSearch = useCallback(async (coords: Coordinates | null) => {
    if (!coords || !map || !isMapScriptLoaded) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setHospitals([]); // Clear previous results before new staged search
    setFilteredHospitals([]);
    setLocationError(""); // Clear previous errors

    const searchStages = [
      { radius: 1000, keyword: "hospital OR clinic OR urgent care", attempt: 1 }, // 1km
      { radius: 5000, keyword: "hospital OR clinic OR urgent care", attempt: 2 }, // 5km
      { radius: 10000, keyword: "hospital OR clinic OR urgent care", attempt: 3 } // 10km
    ];

    let foundSufficientResults = false;
    for (const stage of searchStages) {
      if (foundSufficientResults) break;
      console.log(`[Debug] Staged search: Attempt ${stage.attempt}, Radius: ${stage.radius}m, Keyword: ${stage.keyword}`);
      
      // Directly call the Places API search logic here, adapted from old fetchHospitals
      if (!google || !google.maps || !google.maps.places || !map) {
        console.error("Google Maps Places Service or map instance not available for staged search.");
        setLocationError("Map service not ready. Please try again shortly.");
        setIsLoading(false);
        return;
      }
      const placesService = new google.maps.places.PlacesService(map);
      const request: google.maps.places.PlaceSearchRequest = {
        location: new google.maps.LatLng(coords.latitude, coords.longitude),
        radius: stage.radius,
        keyword: stage.keyword,
        // `type` parameter is restrictive, keyword search is more flexible for multiple types
      };

      // Promisify nearbySearch
      const nearbySearchPromise = () => new Promise<google.maps.places.PlaceResult[]>((resolve, reject) => {
        placesService.nearbySearch(request, (results, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && results) {
            resolve(results);
          } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
            resolve([]); // Resolve with empty if zero results, not an error for staging
          } else {
            reject(status); // Other statuses are errors
          }
        });
      });

      try {
        const results = await nearbySearchPromise();
        if (results.length > 0) {
          const fetchedHospitalsWithDistance: HospitalWithDistance[] = results.map((place, index) => {
            const placeLocation = place.geometry?.location;
            let distance = 0;
            if (placeLocation && coords) {
              distance = calculateDistance(
                coords.latitude,
                coords.longitude,
                placeLocation.lat(),
                placeLocation.lng()
              );
            }
            let availabilityStatus: "open" | "closed" | "unknown" = "unknown";
            // Detailed logging for opening_hours
            if (place.name && (index < 3 || place.name.toLowerCase().includes("general"))) { 
                console.log(`[Debug OpeningHours] Place: ${place.name}, Raw opening_hours:`, JSON.parse(JSON.stringify(place.opening_hours || null)));
            }

            if (place.opening_hours) {
              // Per Google's deprecation notice, avoid direct use of place.opening_hours.open_now from nearbySearch results.
              // Rely on isOpen() method, understanding it might have limitations without a getDetails call.
              try {
                availabilityStatus = place.opening_hours.isOpen() ? "open" : "closed";
                if (place.name && (index < 3 || place.name.toLowerCase().includes("general"))) {
                  console.log(`[Debug OpeningHours] Place: ${place.name}, Status from isOpen() method: ${availabilityStatus}`);
                }
              } catch (e) {
                if (place.name && (index < 3 || place.name.toLowerCase().includes("general"))) {
                  console.warn(`[Debug OpeningHours] Place: ${place.name}, Error calling isOpen():`, e);
                }
                availabilityStatus = "unknown"; // Fallback if isOpen() fails
              }
            } else {
              if (place.name && (index < 3 || place.name.toLowerCase().includes("general"))) {
                console.log(`[Debug OpeningHours] Place: ${place.name}, No opening_hours object provided.`);
              }
              availabilityStatus = "unknown";
            }

            let displayType = "hospital"; // Default
            const types = place.types || [];
            if (types.includes("clinic") || types.includes("medical_clinic")) displayType = "clinic";
            if (types.includes("urgent_care_facility")) displayType = "urgent-care";
            // Hospital should be prioritized if it's also other types
            if (types.includes("hospital")) displayType = "hospital";

            return {
              id: place.place_id || `hospital-${index}`,
              name: place.name || "Unknown Hospital",
              address: place.vicinity || "Address not available",
              phone_number: place.international_phone_number || undefined,
              website: place.website || undefined,
              operating_hours: place.opening_hours?.weekday_text?.join(", ") || undefined,
              rating: place.rating || undefined,
              images: place.photos?.map(p => p.getUrl({maxWidth: 400, maxHeight: 300})) || [],
              distance: distance,
              availability: availabilityStatus,
              waitTime: "Varies",
              latitude: placeLocation?.lat(),
              longitude: placeLocation?.lng(),
              type: displayType,
              specialties: types,
              services_offered: types.join(', ')
            };
          }).filter(h => h.distance <= stage.radius / 1000); // Ensure distance is within current stage radius (km)
          
          // Accumulate results or replace if a new search stage yields more
          // For this implementation, we'll take results from the first stage that has them and is good enough.
          // Or, we can accumulate, but that means results from previous smaller radii are also shown.
          // Let's try: if this stage has results, and previous had none or few, use these.
          // Simple approach: If current stage gives results, and they are more than previous, use them.
          // Or if previous had 0 results and this one has some, use these.

          if (fetchedHospitalsWithDistance.length > 0) {
             // Merge results, ensuring no duplicates, and then sort
            setHospitals(prevHospitals => {
                const allResults = [...prevHospitals, ...fetchedHospitalsWithDistance];
                const uniqueResults = Array.from(new Map(allResults.map(h => [h.id, h])).values());
                uniqueResults.sort((a, b) => a.distance - b.distance); // Sort all unique results by distance
                return uniqueResults;
            });
          }

          if (fetchedHospitalsWithDistance.length >= 5) { // Consider 5 a good enough number
            console.log(`[Debug] Found ${fetchedHospitalsWithDistance.length} results in stage ${stage.attempt}, stopping search.`);
            foundSufficientResults = true;
            setLocationError(""); // Clear error if this stage is successful
          }
        }
      } catch (status) {
        console.error(`Error fetching hospitals in stage ${stage.attempt} from Google Places:`, status);
        // Set error only if it's the last stage and still failing
        if (stage.attempt === searchStages.length) {
            let placesError = "Could not fetch hospitals. ";
            // ... (error handling switch like before) ...
            setLocationError(placesError + `Google Places API returned: ${status}`);
        }
      }
    } // end of for loop for stages
    setIsLoading(false);
    if (!foundSufficientResults && hospitals.length === 0) { // Check hospitals state here
        setLocationError("No healthcare facilities found matching your criteria after all search attempts.");
    }

  }, [map, isMapScriptLoaded, calculateDistance, setIsLoading, setLocationError, setHospitals]);

  // Fetch hospitals when coordinates change and map is ready - NOW CALLS performStagedSearch
  useEffect(() => {
    if (coordinates && map && isMapScriptLoaded) {
      performStagedSearch(coordinates);
    }
  }, [coordinates, map, isMapScriptLoaded, performStagedSearch]);

  useEffect(() => {
    // Filter hospitals based on search and type
    let newFilteredHospitals = [...hospitals]; // Start with a fresh copy

    if (searchTerm) {
      newFilteredHospitals = newFilteredHospitals.filter(
        (hospital) => {
          const term = searchTerm.toLowerCase();
          const nameMatch = hospital.name.toLowerCase().includes(term);
          const addressMatch = hospital.address.toLowerCase().includes(term);
          // Search in specialties (which contains all original place.types)
          const specialtyMatch = Array.isArray(hospital.specialties) &&
                                 hospital.specialties.some((specialty) =>
                                   typeof specialty === 'string' && specialty.toLowerCase().includes(term)
                                 );
          return nameMatch || addressMatch || specialtyMatch;
        }
      );
    }

    // Apply type/sort filters
    if (filterType === "all") {
      newFilteredHospitals.sort((a, b) => a.distance - b.distance); // Sort "all" by distance
    } else if (filterType === "nearest") {
      newFilteredHospitals.sort((a, b) => a.distance - b.distance);
    } else if (filterType === "open") {
      newFilteredHospitals = newFilteredHospitals.filter(h => h.availability === "open");
      newFilteredHospitals.sort((a, b) => a.distance - b.distance); // Sort open ones by distance
    } else if (filterType === "top_rated") {
      newFilteredHospitals = newFilteredHospitals.filter(h => h.rating && h.rating >= 4.0);
      newFilteredHospitals.sort((a,b) => (b.rating || 0) - (a.rating || 0) || a.distance - b.distance);
    } else if (["hospital", "clinic", "urgent-care"].includes(filterType)) {
       newFilteredHospitals = newFilteredHospitals.filter((hospital) => hospital.type === filterType);
       newFilteredHospitals.sort((a, b) => a.distance - b.distance);
    }

    setFilteredHospitals(newFilteredHospitals);
  }, [searchTerm, filterType, hospitals]);

  const getAvailabilityColor = (availability: string) => {
    switch (availability) {
      case "open":
        return "bg-green-100 text-green-800"
      case "busy":
        return "bg-yellow-100 text-yellow-800"
      case "closed":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getTypeLabel = (type: string | undefined) => {
    if (!type) return "Facility"; // Default label
    switch (type) {
      case "hospital":
        return "Hospital"
      case "clinic":
        return "Clinic"
      case "urgent-care": // This is our internal filter value
        return "Urgent Care"
      case "urgent_care_facility": // This is Google's type string
        return "Urgent Care Facility"
      default:
        // For other Google types that might be in specialties, format them nicely
        return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }
  }

  const handleMapLoad = () => {
    setIsMapScriptLoaded(true)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold mb-2">Finding Nearby Hospitals</h2>
          <p className="text-gray-600">Locating healthcare facilities in your area...</p>
        </div>
      </div>
    )
  }

  // Load Google Maps script
  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <Alert variant="destructive" className="m-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Configuration Error</AlertTitle>
        <AlertDescription>
          Google Maps API key is not configured. Please set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in your .env.local file.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <>
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`}
        strategy="lazyOnload"
        onLoad={handleMapLoad}
        onError={(e) => {
          console.error("Failed to load Google Maps script:", e);
          setLocationError("Failed to load Google Maps. Please check your connection or API key configuration.");
          setIsMapScriptLoaded(false); // Ensure we know script loading failed
          setIsLoading(false);
        }}
      />
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white shadow-sm border-b">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center py-4">
              <Button variant="ghost" onClick={() => router.push("/dashboard")} className="mr-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
              <div className="flex items-center space-x-3">
                <MapPin className="h-6 w-6 text-blue-600" />
                <h1 className="text-xl font-semibold text-gray-900">Find Hospitals</h1>
              </div>
            </div>
          </div>
        </header>
        
        {locationError && (
          <Alert className="max-w-6xl mx-auto mt-4 px-4 sm:px-6 lg:px-8">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Location & Hospital Search Status</AlertTitle>
            <AlertDescription>{locationError}</AlertDescription>
          </Alert>
        )}

        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Location Info */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Navigation className="h-5 w-5 text-blue-600" />
                <span>Your Location</span>
              </CardTitle>
              <CardDescription>{userLocation}</CardDescription>
            </CardHeader>
          </Card>

          {/* Google Map */}
          <Card className="mb-6 overflow-hidden">
            <div id="map" style={{ height: "400px", width: "100%" }} className="rounded-md">
              {isLoading && !map && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 dark:bg-black/80 z-10">
                  <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                  <p className="text-lg font-semibold">Loading Map & Hospitals...</p>
                  {locationError && <p className="text-sm text-red-500 mt-2">{locationError}</p>}
                  {!coordinates && !locationError && <p className="text-sm text-muted-foreground mt-2">Getting your location...</p>}
                </div>
              )}
            </div>
          </Card>

          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search hospitals, clinics, or specialties..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-full sm:w-48">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types & Sorts</SelectItem>
                <SelectItem value="hospital">Hospitals</SelectItem>
                <SelectItem value="clinic">Clinics</SelectItem>
                <SelectItem value="urgent-care">Urgent Care</SelectItem>
                <SelectItem value="open">Open Now</SelectItem>
                <SelectItem value="nearest">Nearest</SelectItem>
                <SelectItem value="top_rated">Rating</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Results Count */}
          <div className="mb-4">
            <p className="text-gray-600">Found {filteredHospitals.length} healthcare facilities near you</p>
          </div>

          {/* Hospital List */}
          <div className="space-y-4">
            {filteredHospitals.map((hospital) => (
              <Card key={hospital.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
                    <div>
                      <CardTitle className="hover:text-blue-600 transition-colors">
                        {hospital.website ? (
                          <a href={hospital.website} target="_blank" rel="noopener noreferrer">
                            {hospital.name}
                          </a>
                        ) : (
                          hospital.name
                        )}
                      </CardTitle>
                      <CardDescription className="flex items-center text-sm text-gray-500 mt-1">
                        <MapPin className="h-4 w-4 mr-1.5 flex-shrink-0" /> {hospital.address}
                      </CardDescription>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0 mt-2 sm:mt-0">
                       <Badge variant="outline" className="whitespace-nowrap">{getTypeLabel(hospital.type)}</Badge>
                       <Badge className={cn(getAvailabilityColor(hospital.availability), "whitespace-nowrap")}>{hospital.availability.charAt(0).toUpperCase() + hospital.availability.slice(1)}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                    <div className="flex items-center space-x-2">
                      <Navigation className="h-4 w-4 text-gray-500" />
                      <span className="text-sm">{hospital.distance} miles away</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Star className="h-4 w-4 text-yellow-500" />
                      <span className="text-sm">{hospital.rating ? (
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                          {hospital.rating.toFixed(1)}
                          {hospital.specialties && hospital.specialties.length > 0 && 
                            <span className="ml-2">{hospital.specialties.join(", ")}</span>
                          }
                          {hospital.accepts_insurance !== undefined && (
                             <span className="ml-2">{hospital.accepts_insurance ? "Accepts Insurance" : "Insurance Not Specified"}</span>
                          )}
                        </Badge>
                      ) : (
                        <Badge variant="outline">No rating</Badge>
                      )}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Clock className="h-4 w-4 text-gray-500" />
                      <span className="text-sm">Wait: {hospital.waitTime}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Phone className="h-4 w-4 text-gray-500" />
                      <span className="text-sm">{hospital.phone_number}</span>
                    </div>
                  </div>

                  <div className="mb-4">
                    <h4 className="font-medium text-sm text-gray-700 mb-2">Specialties</h4>
                    <div className="flex flex-wrap gap-2">
                      {hospital.specialties?.map((specialty, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {specialty}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button className="flex-1" onClick={() => window.open(`tel:${hospital.phone_number}`, "_self")}>
                      <Phone className="h-4 w-4 mr-2" />
                      Call Now
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() =>
                        window.open(`https://maps.google.com/?q=${encodeURIComponent(hospital.address)}`, "_blank")
                      }
                    >
                      <MapPin className="h-4 w-4 mr-2" />
                      Get Directions
                    </Button>
                    {hospital.accepts_insurance !== undefined && (
                      <Badge variant="outline" className="self-center px-3 py-1">
                        Insurance Accepted
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                    <Badge 
                      variant={hospital.availability === "open" ? "default" : hospital.availability === "closed" ? "destructive" : "outline"}
                      className={cn(
                        hospital.availability === "open" && "bg-green-500 dark:bg-green-600 text-white",
                        hospital.availability === "closed" && "bg-red-500 dark:bg-red-600 text-white"
                      )}
                    >
                      {hospital.availability.charAt(0).toUpperCase() + hospital.availability.slice(1)}
                    </Badge>
                    {hospital.operating_hours && (
                      <p className="truncate" title={hospital.operating_hours}>Operating Hours: {hospital.operating_hours.split(",")[0]}</p>
                    )}
                  </div>

                  {hospital.images && hospital.images.length > 0 && (
                    <div className="mt-4">
                      <img src={hospital.images[0]} alt={`${hospital.name} image`} className="rounded-md object-cover h-40 w-full" />
                    </div>
                  )}

                </CardContent>
                <CardFooter className="flex-col items-start gap-2 pt-4">
                  <div className="flex items-center space-x-2">
                    <Navigation className="h-4 w-4 text-gray-500" />
                    <span className="text-sm">{hospital.distance} miles away</span>
                  </div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1"><Clock className="h-4 w-4" /> {hospital.waitTime}</p>
                </CardFooter>
              </Card>
            ))}
          </div>

          {filteredHospitals.length === 0 && (
            <Card className="text-center py-8">
              <CardContent>
                <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Results Found</h3>
                <p className="text-gray-600 mb-4">
                  Try adjusting your search terms or filters to find healthcare facilities.
                </p>
                <Button
                  onClick={() => {
                    setSearchTerm("")
                    setFilterType("all")
                  }}
                >
                  Clear Filters
                </Button>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </>
  )
}
