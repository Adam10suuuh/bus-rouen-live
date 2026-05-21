import { NextResponse } from "next/server";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import JSZip from "jszip";

const ASTUCE_GTFS_URL =
  "https://api.mrn.cityway.fr/dataflow/offre-tc/download?dataFormat=gtfs&dataProfil=ASTUCE&provider=ASTUCE";
const ASTUCE_VEHICLE_POSITION_FEEDS = [
  {
    id: "tcar",
    name: "Transdev Rouen",
    url: "https://api.mrn.cityway.fr/dataflow/vehicle-tc-tr/download?dataFormat=gtfs-rt&provider=TCAR",
  },
  {
    id: "tni",
    name: "TNI",
    url: "https://api.mrn.cityway.fr/dataflow/vehicule-tc-tr/download?dataFormat=gtfs-rt&provider=TNI",
  },
] as const;

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type FeedConfig = (typeof ASTUCE_VEHICLE_POSITION_FEEDS)[number];
type FeedMessage = GtfsRealtimeBindings.transit_realtime.IFeedMessage;
type FeedEntity = GtfsRealtimeBindings.transit_realtime.IFeedEntity;
type VehiclePosition =
  GtfsRealtimeBindings.transit_realtime.IVehiclePosition;

type CsvRow = Record<string, string>;
type RouteMetadata = {
  shortName: string;
  longName: string;
  type: "bus" | "teor" | "metro" | "tram" | "ter";
};

type NormalizedVehicle = {
  id: string;
  feedId: FeedConfig["id"];
  feedName: FeedConfig["name"];
  routeId: string;
  routeTechnicalId: string;
  routeType: RouteMetadata["type"];
  routeLongName: string;
  direction: string;
  label: string;
  tripId: string | null;
  currentStopSequence: number | null;
  latitude: number;
  longitude: number;
  bearing: number;
  status: string;
  occupancyStatus: string | null;
  stopId: string | null;
  timestamp: number | null;
};

function cleanRouteId(routeId?: string) {
  return routeId?.replace(/^[A-Z]+:/, "") ?? "Inconnue";
}

function parseCsv(content: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      value += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }

      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  const [headers = [], ...dataRows] = rows.filter((item) =>
    item.some((cell) => cell.trim().length > 0),
  );
  const cleanHeaders = headers.map((header) =>
    header.trim().replace(/^\uFEFF/, ""),
  );

  return dataRows.map((dataRow) =>
    Object.fromEntries(
      cleanHeaders.map((header, index) => [header, dataRow[index] ?? ""]),
    ),
  );
}

function cleanRouteName(routeName: string) {
  return routeName.replace(/^0+/, "") || routeName;
}

function getRouteType(shortName: string, routeType: string): RouteMetadata["type"] {
  if (shortName === "Metro" || shortName === "Métro" || routeType === "1") {
    return "metro";
  }

  if (/^T\d+$/i.test(shortName)) {
    return "teor";
  }

  if (routeType === "0") {
    return "tram";
  }

  if (routeType === "2") {
    return "ter";
  }

  return "bus";
}

async function getRouteMetadata() {
  const response = await fetch(ASTUCE_GTFS_URL, {
    cache: "no-store",
  });

  if (!response.ok) {
    return new Map<string, RouteMetadata>();
  }

  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const routesFile = zip.file("routes.txt");

  if (!routesFile) {
    return new Map<string, RouteMetadata>();
  }

  return new Map(
    parseCsv(await routesFile.async("string")).map((route) => {
      const shortName = cleanRouteName(
        route.route_short_name || route.route_long_name || cleanRouteId(route.route_id),
      );

      return [
        route.route_id,
        {
          shortName,
          longName: route.route_long_name,
          type: getRouteType(shortName, route.route_type),
        },
      ];
    }),
  );
}

function getDirection(vehicle: VehiclePosition, metadata?: RouteMetadata) {
  const label = vehicle.vehicle?.label?.trim();

  if (label) {
    return label;
  }

  if (vehicle.trip?.directionId === 0 || vehicle.trip?.directionId === 1) {
    const directionLabel =
      vehicle.trip.directionId === 0 ? "aller" : "retour";

    return metadata?.longName
      ? `${metadata.longName} (${directionLabel})`
      : `Direction ${vehicle.trip.directionId}`;
  }

  return "Direction non renseignee";
}

function getVehicleStatus(status: VehiclePosition["currentStatus"]) {
  const statusLabels: Record<string, string> = {
    "0": "INCOMING_AT",
    "1": "STOPPED_AT",
    "2": "IN_TRANSIT_TO",
  };

  return status === null || status === undefined
    ? "IN_TRANSIT"
    : (statusLabels[String(status)] ?? String(status));
}

function getOccupancyStatus(status: VehiclePosition["occupancyStatus"]) {
  const occupancyLabels: Record<string, string> = {
    "0": "EMPTY",
    "1": "MANY_SEATS_AVAILABLE",
    "2": "FEW_SEATS_AVAILABLE",
    "3": "STANDING_ROOM_ONLY",
    "4": "CRUSHED_STANDING_ROOM_ONLY",
    "5": "FULL",
    "6": "NOT_ACCEPTING_PASSENGERS",
  };

  return status === null || status === undefined
    ? null
    : (occupancyLabels[String(status)] ?? String(status));
}

function normalizeVehicle(
  entity: FeedEntity,
  feed: FeedConfig,
  routesById: Map<string, RouteMetadata>,
): NormalizedVehicle | null {
  const vehicle = entity.vehicle;
  const position = vehicle?.position;

  if (!vehicle || !position?.latitude || !position.longitude) {
    return null;
  }

  const technicalRouteId = vehicle.trip?.routeId ?? undefined;
  const metadata = technicalRouteId
    ? routesById.get(technicalRouteId)
    : undefined;
  const routeId = metadata?.shortName ?? cleanRouteId(technicalRouteId);

  return {
    id: `${feed.id}:${entity.id ?? vehicle.vehicle?.id ?? crypto.randomUUID()}`,
    feedId: feed.id,
    feedName: feed.name,
    routeId,
    routeTechnicalId: technicalRouteId ?? "Inconnue",
    routeType: metadata?.type ?? "bus",
    routeLongName: metadata?.longName ?? "",
    direction: getDirection(vehicle, metadata),
    label: vehicle.vehicle?.id ?? vehicle.vehicle?.label ?? "Vehicule Astuce",
    tripId: vehicle.trip?.tripId ?? null,
    currentStopSequence: vehicle.currentStopSequence ?? null,
    latitude: position.latitude,
    longitude: position.longitude,
    bearing: position.bearing ?? 0,
    status: getVehicleStatus(vehicle.currentStatus),
    occupancyStatus: getOccupancyStatus(vehicle.occupancyStatus),
    stopId: vehicle.stopId ?? null,
    timestamp:
      typeof vehicle.timestamp === "number"
        ? vehicle.timestamp
        : Number(vehicle.timestamp ?? 0) || null,
  };
}

async function fetchVehicleFeed(
  feed: FeedConfig,
  routesById: Map<string, RouteMetadata>,
) {
  const response = await fetch(feed.url, {
    cache: "no-store",
    headers: {
      Accept: "application/x-protobuf, application/octet-stream",
    },
  });

  if (!response.ok) {
    throw new Error(`${feed.name}: HTTP ${response.status}`);
  }

  const buffer = new Uint8Array(await response.arrayBuffer());

  if (buffer.length === 0) {
    return [];
  }

  const message = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
    buffer,
  ) as FeedMessage;

  return (message.entity ?? [])
    .map((entity) => {
      return normalizeVehicle(entity, feed, routesById);
    })
    .filter((vehicle): vehicle is NormalizedVehicle => vehicle !== null);
}

export async function GET() {
  const routesById = await getRouteMetadata();
  const results = await Promise.allSettled(
    ASTUCE_VEHICLE_POSITION_FEEDS.map((feed) =>
      fetchVehicleFeed(feed, routesById),
    ),
  );

  const vehicles = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );

  const errors = results.flatMap((result, index) =>
    result.status === "rejected"
      ? [
          {
            feed: ASTUCE_VEHICLE_POSITION_FEEDS[index].name,
            message:
              result.reason instanceof Error
                ? result.reason.message
                : "Erreur inconnue",
          },
        ]
      : [],
  );

  if (vehicles.length === 0 && errors.length > 0) {
    return NextResponse.json(
      {
        error: "Aucun flux Vehicle Positions Astuce disponible.",
        errors,
        vehicles: [],
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    sources: ASTUCE_VEHICLE_POSITION_FEEDS.map(({ name, url }) => ({
      name,
      url,
    })),
    updatedAt: new Date().toISOString(),
    count: vehicles.length,
    errors,
    vehicles,
  });
}
