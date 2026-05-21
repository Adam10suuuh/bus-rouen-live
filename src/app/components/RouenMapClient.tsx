"use client";

import dynamic from "next/dynamic";

const RouenMap = dynamic(
  () => import("./RouenMap").then((module) => module.RouenMap),
  {
    ssr: false,
    loading: () => (
      <div className="map-loading" role="status">
        Chargement de la carte...
      </div>
    ),
  },
);

export function RouenMapClient() {
  return <RouenMap />;
}
