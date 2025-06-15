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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import Script from "next/script"
import { cn } from "@/lib/utils"

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

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

  const getUserLocation = useCallback(() => {
    if (navigator.geolocation) {
      setIsLoading(true)
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords
          setCoordinates({ latitude, longitude })
          fetchAddressFromCoordinates(latitude, longitude)
        },
        (error) => {
          console.error("Error getting location:", error)
          setLocationError("Unable to get your location. Please enable location services.")
          setIsLoading(false)
          setUserLocation("Location unavailable")
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      )
    } else {
      setLocationError("Geolocation is not supported by your browser.")
      setIsLoading(false)
      setUserLocation("Location unavailable")
    }
  }, [setIsLoading, setCoordinates, setLocationError, setUserLocation]);

  const fetchAddressFromCoordinates = useCallback(async (latitude: number, longitude: number) => {
    if (!GOOGLE_MAPS_API_KEY) {
      console.error("Google Maps API key is not configured.")
      setLocationError("Google Maps API key is not configured.")
      setUserLocation("API key error.")
      setIsLoading(false)
      return
    }
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`
      )
      const data = await response.json()
      if (data.status === "OK" && data.results && data.results.length > 0) {
        setUserLocation(data.results[0].formatted_address)
        setLocationError("")
      } else {
        setLocationError(`Could not get address. Geocoding: ${data.status}`)
        setUserLocation(`Lat: ${latitude.toFixed(4)}, Lon: ${longitude.toFixed(4)}`)
      }
    } catch (error) {
      console.error("Exception fetching address:", error);
      setLocationError("Exception occurred while fetching address.")
      setUserLocation(`Lat: ${latitude.toFixed(4)}, Lon: ${longitude.toFixed(4)}`)
    }
  }, [setIsLoading, setLocationError, setUserLocation]);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth")
      return
    }
    if (user && !coordinates) { 
      getUserLocation()
    }
  }, [user, loading, router, coordinates, getUserLocation]);

  useEffect(() => {
    if (coordinates && isMapScriptLoaded && !mapRef.current && document.getElementById("map")) {
      const newMapInstance = new google.maps.Map(document.getElementById("map")!, {
        center: { lat: coordinates.latitude, lng: coordinates.longitude },
        zoom: 12,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
      });

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
      setMap(newMapInstance);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current = null;
      }
    };
  }, [coordinates, isMapScriptLoaded]); 

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

  const performStagedSearch = useCallback(async (coords: Coordinates) => {
    if (!map || !isMapScriptLoaded) return;
    
    setIsLoading(true);
        setHospitals([]);
    setFilteredHospitals([]);
    setLocationError("");

    const searchStages = [
      { radius: 1000, keyword: "hospital OR clinic OR urgent care" },
      { radius: 5000, keyword: "hospital OR clinic OR urgent care" },
      { radius: 10000, keyword: "hospital OR clinic" },
      { radius: 25000, keyword: "hospital" }
    ];

    const placesService = new google.maps.places.PlacesService(map);
    const allResults = new Map<string, google.maps.places.PlaceResult>();

    for (const stage of searchStages) {
      const request: google.maps.places.PlaceSearchRequest = {
        location: new google.maps.LatLng(coords.latitude, coords.longitude),
        radius: stage.radius,
        keyword: stage.keyword,
      };

      const nearbySearchPromise = () => new Promise<google.maps.places.PlaceResult[]>((resolve, reject) => {
        placesService.nearbySearch(request, (results, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && results) {
            resolve(results);
          } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
            resolve([]);
          } else {
            reject(status);
          }
        });
      });

      try {
        const results = await nearbySearchPromise();
        results.forEach(place => {
          if (place.place_id && !allResults.has(place.place_id)) {
            allResults.set(place.place_id, place);
          }
        });
        if (allResults.size >= 10) break;
      } catch (status) {
        console.error(`Error fetching hospitals in stage from Google Places:`, status);
        if (allResults.size === 0) {
            setLocationError(`Could not fetch hospitals. Google Places API returned: ${status}`);
        }
      }
    }

    if (allResults.size === 0) {
        setLocationError("No healthcare facilities found matching your criteria.");
        setIsLoading(false);
        return;
    }

    const fetchedHospitals = Array.from(allResults.values()).map((place, index) => {
            const placeLocation = place.geometry?.location;
            let distance = 0;
        if (placeLocation) {
          distance = calculateDistance(coords.latitude, coords.longitude, placeLocation.lat(), placeLocation.lng());
            }

            let availabilityStatus: "open" | "closed" | "unknown" = "unknown";
            if (place.opening_hours) {
          if (typeof place.opening_hours.isOpen === 'function') {
                availabilityStatus = place.opening_hours.isOpen() ? "open" : "closed";
          }
        }
        
        let displayType = "hospital";
            const types = place.types || [];
            if (types.includes("clinic") || types.includes("medical_clinic")) displayType = "clinic";
            if (types.includes("urgent_care_facility")) displayType = "urgent-care";
            if (types.includes("hospital")) displayType = "hospital";

            return {
              id: place.place_id || `hospital-${index}`,
              name: place.name || "Unknown Hospital",
              address: place.vicinity || "Address not available",
          phone_number: place.international_phone_number,
          website: place.website,
          operating_hours: place.opening_hours?.weekday_text?.join(", "),
          rating: place.rating,
          images: place.photos?.map(p => p.getUrl({maxWidth: 400, maxHeight: 300})),
          distance,
              availability: availabilityStatus,
              waitTime: "Varies",
              latitude: placeLocation?.lat(),
              longitude: placeLocation?.lng(),
              type: displayType,
              specialties: types,
              services_offered: types.join(', ')
            };
    });

    fetchedHospitals.sort((a, b) => a.distance - b.distance);
    setHospitals(fetchedHospitals);
    setIsLoading(false);

  }, [map, isMapScriptLoaded, calculateDistance]);

  useEffect(() => {
    if (coordinates && map && isMapScriptLoaded) {
      performStagedSearch(coordinates);
    }
  }, [coordinates, map, isMapScriptLoaded, performStagedSearch]);

  useEffect(() => {
    let newFilteredHospitals = [...hospitals];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      newFilteredHospitals = newFilteredHospitals.filter(
        (hospital) =>
          hospital.name.toLowerCase().includes(term) ||
          hospital.address.toLowerCase().includes(term) ||
          (hospital.specialties || []).some((s) => s.toLowerCase().includes(term))
      );
    }

    if (filterType === "open") {
      newFilteredHospitals = newFilteredHospitals.filter(h => h.availability === "open");
    } else if (filterType === "top_rated") {
      newFilteredHospitals = newFilteredHospitals.filter(h => h.rating && h.rating >= 4.0);
      newFilteredHospitals.sort((a,b) => (b.rating || 0) - (a.rating || 0) || a.distance - b.distance);
    } else if (["hospital", "clinic", "urgent-care"].includes(filterType)) {
       newFilteredHospitals = newFilteredHospitals.filter((hospital) => hospital.type === filterType);
    }
    
    if (filterType !== 'top_rated') {
       newFilteredHospitals.sort((a, b) => a.distance - b.distance);
    }

    setFilteredHospitals(newFilteredHospitals);
  }, [searchTerm, filterType, hospitals]);

  useEffect(() => {
    if (map) {
      markers.forEach(marker => marker.setMap(null));
      
      const newMarkers = filteredHospitals.map(hospital => {
        if (hospital.latitude && hospital.longitude) {
            const marker = new google.maps.Marker({
              position: { lat: hospital.latitude, lng: hospital.longitude },
              map: map,
              title: hospital.name,
              icon: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
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
            return marker;
        }
        return null;
      }).filter((m): m is google.maps.Marker => m !== null);

      setMarkers(newMarkers);
    }
  }, [map, filteredHospitals]);

  const getAvailabilityColor = (availability: string) => {
    switch (availability) {
      case "open": return "bg-green-100 text-green-800";
      case "closed": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  }

  const getTypeLabel = (type: string | undefined) => {
    if (!type) return "Facility";
    switch (type) {
      case "hospital": return "Hospital";
      case "clinic": return "Clinic";
      case "urgent-care": return "Urgent Care";
      default: return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }
  }

  // Add script loading handler
  const handleScriptLoad = () => {
    setIsMapScriptLoaded(true);
  };

  const handleScriptError = (e: Error) => {
    console.error("Failed to load Google Maps script:", e);
    setLocationError("Failed to load Google Maps.");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Finding Nearby Hospitals</h2>
          <p className="text-gray-600">Locating healthcare facilities in your area...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`}
        onLoad={handleScriptLoad}
        onError={handleScriptError}
        strategy="afterInteractive"
      />
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center">
            <Button variant="ghost" onClick={() => router.push("/dashboard")} className="mr-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div className="flex items-center space-x-3">
              <MapPin className="h-6 w-6 text-blue-600" />
              <h1 className="text-xl font-semibold text-gray-900">Find Hospitals</h1>
          </div>
        </div>
      </header>
      
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {locationError && (
          <Alert variant="destructive" className="mb-6">
          <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
          <AlertDescription>{locationError}</AlertDescription>
        </Alert>
      )}

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Navigation className="h-5 w-5 text-blue-600" />
              <span>Your Location</span>
            </CardTitle>
            <CardDescription>{userLocation || "Getting your location..."}</CardDescription>
          </CardHeader>
        </Card>

        <Card className="mb-6 overflow-hidden relative">
          <div id="map" style={{ height: "400px", width: "100%" }} className="rounded-md bg-gray-200" />
          {isLoading && (
            <div className="absolute inset-0 h-full w-full flex flex-col items-center justify-center bg-white/80 z-10">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-lg font-semibold">Loading Map & Hospitals...</p>
              </div>
            )}
        </Card>

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
              <SelectValue placeholder="Filter by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nearest">Nearest</SelectItem>
              <SelectItem value="open">Open Now</SelectItem>
              <SelectItem value="top_rated">Top Rated</SelectItem>
              <SelectItem value="hospital">Hospitals</SelectItem>
              <SelectItem value="clinic">Clinics</SelectItem>
              <SelectItem value="urgent-care">Urgent Care</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="mb-4">
          <p className="text-gray-600">Found {filteredHospitals.length} healthcare facilities near you</p>
        </div>

        <div className="space-y-4">
          {filteredHospitals.map((hospital) => (
            <Card key={hospital.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="hover:text-blue-600 transition-colors">
                      <a href={hospital.website || `https://www.google.com/search?q=${encodeURIComponent(hospital.name)}`} target="_blank" rel="noopener noreferrer">
                          {hospital.name}
                        </a>
                    </CardTitle>
                    <CardDescription className="flex items-center text-sm text-gray-500 mt-1">
                      <MapPin className="h-4 w-4 mr-1.5 flex-shrink-0" /> {hospital.address}
                    </CardDescription>
                  </div>
                  <div className="flex items-center space-x-2 flex-shrink-0">
                     <Badge variant="outline">{getTypeLabel(hospital.type)}</Badge>
                     <Badge className={cn(getAvailabilityColor(hospital.availability))}>{hospital.availability}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-700 mb-4">
                  <div className="flex items-center space-x-2">
                    <Navigation className="h-4 w-4 text-gray-500" />
                    <span>{hospital.distance} miles</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Star className="h-4 w-4 text-yellow-500" />
                    <span>{hospital.rating ? `${hospital.rating.toFixed(1)} stars` : 'No rating'}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Clock className="h-4 w-4 text-gray-500" />
                    <span>Wait: {hospital.waitTime}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Phone className="h-4 w-4 text-gray-500" />
                    <span>{hospital.phone_number || "Not available"}</span>
                  </div>
                </div>

                {hospital.specialties && hospital.specialties.length > 0 && (
                <div className="mb-4">
                    <h4 className="font-medium text-sm text-gray-800 mb-2">Specialties</h4>
                  <div className="flex flex-wrap gap-2">
                      {hospital.specialties.slice(0, 5).map((specialty, index) => (
                        <Badge key={index} variant="secondary">{specialty.replace(/_/g, ' ')}</Badge>
                    ))}
                  </div>
                </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2">
                  <Button asChild className="flex-1">
                    <a href={`tel:${hospital.phone_number}`}><Phone className="h-4 w-4 mr-2" /> Call Now</a>
                  </Button>
                  <Button asChild variant="outline" className="flex-1">
                     <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(hospital.address)}`} target="_blank" rel="noopener noreferrer"><MapPin className="h-4 w-4 mr-2" /> Get Directions</a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {!isLoading && filteredHospitals.length === 0 && (
          <Card className="text-center py-12">
            <CardContent>
              <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Results Found</h3>
              <p className="text-gray-600 mb-4">
                Try adjusting your search terms or filters.
              </p>
              <Button
                onClick={() => {
                  setSearchTerm("")
                  setFilterType("nearest")
                }}
              >
                Clear Filters
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}
