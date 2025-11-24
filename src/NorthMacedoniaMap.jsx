// src/NorthMacedoniaMap.jsx
import React from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { CITIES_WITH_COORDS } from "./mkCities";

// Fix for default marker paths in many bundlers
const DefaultIcon = L.icon({
  iconUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

function ClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      if (!onMapClick) return;
      onMapClick(e.latlng);
    },
  });
  return null;
}

export default function NorthMacedoniaMap({ selectedCity, onSelectCity }) {
  const defaultCenter = [41.6, 21.7]; // roughly center of MK
  const zoom = 8;

  const handleMapClick = (latlng) => {
    if (!onSelectCity) return;

    // Pick nearest city to where they clicked
    let nearest = null;
    let bestDist = Infinity;

    CITIES_WITH_COORDS.forEach((c) => {
      const dLat = c.lat - latlng.lat;
      const dLng = c.lng - latlng.lng;
      const dist = dLat * dLat + dLng * dLng;
      if (dist < bestDist) {
        bestDist = dist;
        nearest = c;
      }
    });

    if (nearest) onSelectCity(nearest.name);
  };

  return (
    <div style={{ width: "100%", height: "350px" }}>
      <MapContainer
        center={defaultCenter}
        zoom={zoom}
        style={{ width: "100%", height: "100%", borderRadius: 12, overflow: "hidden" }}
        scrollWheelZoom={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />

        <ClickHandler onMapClick={handleMapClick} />

        {CITIES_WITH_COORDS.map((city) => (
          <Marker
            key={city.name}
            position={[city.lat, city.lng]}
            eventHandlers={{
              click: () => onSelectCity && onSelectCity(city.name),
            }}
          >
            <Popup>
              <strong>{city.name}</strong>
              <br />
              Click to use this city
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
