"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import type { Entry } from "@/lib/types";

// 기본 마커 아이콘(마커 스프라이트 경로 문제로 깨지는 것 방지) - 자체 SVG divIcon 사용
const markerIcon = L.divIcon({
  className: "",
  html: '<div style="width:14px;height:14px;border-radius:9999px;background:#f97316;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

interface MapViewProps {
  entries: Entry[];
}

type EntryWithCoords = Entry & { lat: number; lng: number };

function hasCoords(entry: Entry): entry is EntryWithCoords {
  return typeof entry.lat === "number" && typeof entry.lng === "number";
}

export default function MapView({ entries }: MapViewProps) {
  const withCoords = entries.filter(hasCoords);

  if (withCoords.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center rounded-2xl border border-dashed border-stone-200 text-sm text-stone-400">
        아직 지도에 표시할 위치 정보가 없어요
      </div>
    );
  }

  const center: [number, number] = [withCoords[0].lat, withCoords[0].lng];

  return (
    <MapContainer center={center} zoom={13} scrollWheelZoom={false} className="h-80 w-full rounded-2xl">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {withCoords.map((entry) => (
        <Marker key={entry.id} position={[entry.lat, entry.lng]} icon={markerIcon}>
          <Popup>
            <p className="font-medium">{entry.placeName}</p>
            {entry.address && <p className="text-xs text-stone-500">{entry.address}</p>}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
