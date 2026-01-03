import React, { useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { Link } from "react-router-dom";
import { CITIES_WITH_COORDS } from "./mkCities";

// Fix for default marker paths
const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

export default function ListingsMap({ listings = [], t }) {
  const defaultCenter = [41.6, 21.7];
  const zoom = 8;

  const markers = useMemo(() => {
    return listings.map((l) => {
      // 1. Try exact coords
      if (l.locationData?.lat && l.locationData?.lng) {
        return { ...l, lat: l.locationData.lat, lng: l.locationData.lng };
      }
      
      // 2. Try city lookup
      const city = l.locationCity || l.location;
      const found = CITIES_WITH_COORDS.find(
        (c) => c.name.toLowerCase() === (city || "").toLowerCase()
      );

      if (found) {
        // Add random jitter so they don't stack perfectly
        // +/- 0.005 is roughly 500m
        const jitterLat = (Math.random() - 0.5) * 0.01;
        const jitterLng = (Math.random() - 0.5) * 0.01;
        return {
          ...l,
          lat: found.lat + jitterLat,
          lng: found.lng + jitterLng,
        };
      }

      return null;
    }).filter(Boolean);
  }, [listings]);

  return (
    <div style={{ width: "100%", height: "500px", borderRadius: "12px", overflow: "hidden" }}>
      <MapContainer
        center={defaultCenter}
        zoom={zoom}
        style={{ width: "100%", height: "100%" }}
        scrollWheelZoom={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />

        {markers.map((l) => (
          <Marker key={l.id} position={[l.lat, l.lng]}>
            <Popup>
              <div style={{ minWidth: "200px" }}>
                {l.imagePreview && (
                  <div style={{ 
                    width: "100%", 
                    height: "100px", 
                    backgroundImage: `url(${l.imagePreview})`, 
                    backgroundSize: "cover", 
                    backgroundPosition: "center",
                    marginBottom: "8px",
                    borderRadius: "4px"
                  }} />
                )}
                <h3 style={{ margin: "0 0 4px 0", fontSize: "16px" }}>
                  <Link to={`/listing/${l.id}`} style={{ textDecoration: "none", color: "#2563eb" }}>
                    {l.name}
                  </Link>
                </h3>
                <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>
                  {l.category} • {l.location}
                </div>
                {l.offerprice && (
                  <div style={{ fontWeight: "bold", color: "#10b981" }}>
                    {l.offerprice}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
