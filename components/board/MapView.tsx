"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { COMMUNITY } from "@/lib/constants";
import type { Entry } from "@/lib/types";

/** 찜 횟수 뱃지("🔥 N")를 마커 오른쪽 위에 얹어서 그린다 - 임계값 이상이면
 *  마커 자체도 금색으로 바꿔서 지도에서 인기 장소가 한눈에 띄게 한다. */
function buildMarkerIcon(count: number, gold: boolean) {
  const dotColor = gold ? "#eab308" : "#f97316";
  const badge =
    count > 0
      ? `<div style="position:absolute;top:-9px;left:14px;background:${gold ? "#eab308" : "#57534e"};color:white;font-size:10px;font-weight:600;line-height:1;padding:2px 5px;border-radius:9999px;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,0.35);">🔥 ${count}</div>`
      : "";
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:14px;height:14px;">
      <div style="width:14px;height:14px;border-radius:9999px;background:${dotColor};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>
      ${badge}
    </div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

interface MapViewProps {
  entries: Entry[];
  /** canonicalId -> 커뮤니티 찜 횟수. 없는(매칭 안 된) 장소는 0으로 취급해서 뱃지를 숨긴다. */
  saveCounts: Record<string, number>;
}

type EntryWithCoords = Entry & { lat: number; lng: number };

function hasCoords(entry: Entry): entry is EntryWithCoords {
  return typeof entry.lat === "number" && typeof entry.lng === "number";
}

export default function MapView({ entries, saveCounts }: MapViewProps) {
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
      {withCoords.map((entry) => {
        const count = entry.canonicalId ? (saveCounts[entry.canonicalId] ?? 0) : 0;
        const gold = count >= COMMUNITY.goldThreshold;
        return (
          <Marker key={entry.id} position={[entry.lat, entry.lng]} icon={buildMarkerIcon(count, gold)}>
            <Popup>
              <p className="font-medium">{entry.placeName}</p>
              {count > 0 && (
                <p className={`text-xs font-semibold ${gold ? "text-amber-500" : "text-stone-500"}`}>🔥 {count}</p>
              )}
              {entry.address && <p className="text-xs text-stone-500">{entry.address}</p>}
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
