"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, Tooltip, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { COMMUNITY, MAP } from "@/lib/constants";
import type { MapPlace, RegionDensity } from "@/lib/types";

interface DensityMapViewProps {
  densities: RegionDensity[];
  places: MapPlace[];
}

type PlottableDensity = RegionDensity & { lat: number; lng: number };

function hasCoords(density: RegionDensity): density is PlottableDensity {
  return density.lat !== null && density.lng !== null;
}

/** MapView.tsx(보드 상세 지도)의 buildMarkerIcon과 같은 스타일 언어(금색 =
 *  임계값 이상)를 개별 장소 마커에도 그대로 씀 - 두 지도에서 "이 장소는 인기
 *  있다"는 신호가 다르게 보이면 헷갈리므로 의도적으로 통일. */
function buildPlaceMarkerIcon(count: number, gold: boolean) {
  const dotColor = gold ? "#eab308" : "#f97316";
  const badge = `<div style="position:absolute;top:-9px;left:14px;background:${gold ? "#eab308" : "#57534e"};color:white;font-size:10px;font-weight:600;line-height:1;padding:2px 5px;border-radius:9999px;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,0.35);">🔥 ${count}</div>`;
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

/** MapContainer 안에서만 쓸 수 있는 훅(useMapEvents)을 담는 자식 컴포넌트 -
 *  화면에는 아무것도 안 그리고 줌 변화만 부모 상태로 끌어올린다. */
function ZoomWatcher({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  const map = useMapEvents({
    zoomend: () => onZoomChange(map.getZoom()),
  });
  useEffect(() => {
    onZoomChange(map.getZoom());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 시 초기 줌 한 번만 보고하면 됨
  }, []);
  return null;
}

export default function DensityMapView({ densities, places }: DensityMapViewProps) {
  const router = useRouter();
  const [zoom, setZoom] = useState<number>(MAP.fallbackZoom);

  const plottableDensities = densities.filter(hasCoords);
  const maxCount = Math.max(1, ...plottableDensities.map((d) => d.totalSaveCount));

  function bubbleRadius(count: number) {
    const ratio = Math.sqrt(count / maxCount);
    return MAP.bubbleMinRadius + (MAP.bubbleMaxRadius - MAP.bubbleMinRadius) * ratio;
  }

  function bubbleOpacity(count: number) {
    return 0.25 + 0.55 * (count / maxCount);
  }

  const bounds: [number, number][] = plottableDensities.map((d) => [d.lat, d.lng]);
  const showPlaces = zoom >= MAP.placeZoomThreshold;

  if (plottableDensities.length === 0 && places.length === 0) {
    return (
      <div className="flex h-[28rem] items-center justify-center rounded-2xl border border-dashed border-stone-200 text-sm text-stone-400">
        아직 지도에 표시할 찜 데이터가 없어요
      </div>
    );
  }

  return (
    <MapContainer
      {...(bounds.length > 0
        ? { bounds, boundsOptions: { padding: [24, 24] as [number, number] } }
        : { center: MAP.fallbackCenter, zoom: MAP.fallbackZoom })}
      scrollWheelZoom
      className="h-[28rem] w-full rounded-2xl"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ZoomWatcher onZoomChange={setZoom} />

      {!showPlaces &&
        plottableDensities.map((density) => (
          <CircleMarker
            key={density.region}
            center={[density.lat, density.lng]}
            radius={bubbleRadius(density.totalSaveCount)}
            pathOptions={{
              color: "#ea580c",
              weight: 1,
              fillColor: "#f97316",
              fillOpacity: bubbleOpacity(density.totalSaveCount),
            }}
            eventHandlers={{
              click: () => router.push(`/rankings?region=${encodeURIComponent(density.region)}`),
            }}
          >
            <Tooltip direction="top" offset={[0, -bubbleRadius(density.totalSaveCount)]}>
              {density.region} · 🔥 {density.totalSaveCount}
            </Tooltip>
          </CircleMarker>
        ))}

      {showPlaces &&
        places.map((place) => {
          const gold = place.saveCount >= COMMUNITY.goldThreshold;
          return (
            <Marker
              key={place.id}
              position={[place.lat, place.lng]}
              icon={buildPlaceMarkerIcon(place.saveCount, gold)}
            >
              <Popup>
                <p className="font-medium">{place.placeName}</p>
                <p className={`text-xs font-semibold ${gold ? "text-amber-500" : "text-stone-500"}`}>
                  🔥 {place.saveCount}
                </p>
                {place.address && <p className="text-xs text-stone-500">{place.address}</p>}
                {place.region && (
                  <button
                    type="button"
                    onClick={() => router.push(`/rankings?region=${encodeURIComponent(place.region as string)}`)}
                    className="mt-1 text-xs font-medium text-accent hover:underline"
                  >
                    {place.region} 랭킹 보기
                  </button>
                )}
              </Popup>
            </Marker>
          );
        })}
    </MapContainer>
  );
}
