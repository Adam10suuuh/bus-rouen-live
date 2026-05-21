import { NextResponse } from "next/server";
import JSZip from "jszip";

const ASTUCE_GTFS_URL =
  "https://api.mrn.cityway.fr/dataflow/offre-tc/download?dataFormat=gtfs&dataProfil=ASTUCE&provider=ASTUCE";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type CsvRow = Record<string, string>;

type Stop = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  lines: StopLine[];
};

type StopLine = {
  id: string;
  name: string;
  type: "bus" | "teor" | "metro" | "tram" | "ter";
};

type StopsPayload = {
  source: string;
  updatedAt: string;
  count: number;
  lines: string[];
  stops: Stop[];
};

let stopsCache: Promise<StopsPayload> | null = null;

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

function getRouteType(routeName: string, routeType: string): StopLine["type"] {
  if (routeName === "Metro" || routeName === "Métro" || routeType === "1") {
    return "metro";
  }

  if (/^T\d+$/i.test(routeName)) {
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

function sortLineNames(lines: string[]) {
  return [...lines].sort((left, right) =>
    left.localeCompare(right, "fr", { numeric: true, sensitivity: "base" }),
  );
}

function sortLines(lines: StopLine[]) {
  return [...lines].sort((left, right) =>
    left.name.localeCompare(right.name, "fr", {
      numeric: true,
      sensitivity: "base",
    }),
  );
}

async function readGtfsFile(zip: JSZip, filename: string) {
  const file = zip.file(filename);

  if (!file) {
    throw new Error(`${filename} est absent du GTFS Astuce.`);
  }

  return file.async("string");
}

function parseStopTimes(content: string) {
  const rows: Array<{ tripId: string; stopId: string }> = [];
  const lines = content.split(/\r?\n/);
  const headers = lines[0]
    ?.replace(/^\uFEFF/, "")
    .split(",")
    .map((header) => header.trim());
  const tripIdIndex = headers.indexOf("trip_id");
  const stopIdIndex = headers.indexOf("stop_id");

  if (tripIdIndex < 0 || stopIdIndex < 0) {
    return rows;
  }

  for (const line of lines.slice(1)) {
    if (!line) {
      continue;
    }

    const columns = line.split(",");
    const tripId = columns[tripIdIndex];
    const stopId = columns[stopIdIndex];

    if (tripId && stopId) {
      rows.push({ tripId, stopId });
    }
  }

  return rows;
}

async function buildStopsPayload(): Promise<StopsPayload> {
  const response = await fetch(ASTUCE_GTFS_URL, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Impossible de recuperer le GTFS officiel Astuce.");
  }

  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const [stopsContent, routesContent, tripsContent, stopTimesContent] =
    await Promise.all([
      readGtfsFile(zip, "stops.txt"),
      readGtfsFile(zip, "routes.txt"),
      readGtfsFile(zip, "trips.txt"),
      readGtfsFile(zip, "stop_times.txt"),
    ]);

  const routesById = new Map(
    parseCsv(routesContent).map((route) => {
      const name = cleanRouteName(route.route_short_name || route.route_long_name);

      return [
        route.route_id,
        {
          id: route.route_id,
          name,
          type: getRouteType(name, route.route_type),
        },
      ];
    }),
  );

  const routeIdByTripId = new Map(
    parseCsv(tripsContent).map((trip) => [trip.trip_id, trip.route_id]),
  );

  const stopsRows = parseCsv(stopsContent);
  const parentStopIdByStopId = new Map(
    stopsRows.map((stop) => [
      stop.stop_id,
      stop.parent_station || stop.stop_id,
    ]),
  );
  const linesByStopId = new Map<string, Map<string, StopLine>>();

  for (const stopTime of parseStopTimes(stopTimesContent)) {
    const routeId = routeIdByTripId.get(stopTime.tripId);
    const route = routeId ? routesById.get(routeId) : null;
    const stopIds = [
      stopTime.stopId,
      parentStopIdByStopId.get(stopTime.stopId),
    ].filter(Boolean) as string[];

    if (!route) {
      continue;
    }

    for (const stopId of stopIds) {
      const lines = linesByStopId.get(stopId) ?? new Map<string, StopLine>();
      lines.set(route.name, route);
      linesByStopId.set(stopId, lines);
    }
  }

  const stops: Stop[] = stopsRows
    .map((stop) => {
      const latitude = Number(stop.stop_lat);
      const longitude = Number(stop.stop_lon);

      if (!stop.stop_id || !stop.stop_name || !latitude || !longitude) {
        return null;
      }

      return {
        id: stop.stop_id,
        name: stop.stop_name,
        latitude,
        longitude,
        lines: sortLines(Array.from(linesByStopId.get(stop.stop_id)?.values() ?? [])),
      };
    })
    .filter((stop): stop is Stop => stop !== null);

  const lines = sortLineNames(
    Array.from(new Set(stops.flatMap((stop) => stop.lines.map((line) => line.name)))),
  );

  return {
    source: ASTUCE_GTFS_URL,
    updatedAt: new Date().toISOString(),
    count: stops.length,
    lines,
    stops,
  };
}

export async function GET() {
  stopsCache ??= buildStopsPayload().catch((error) => {
    stopsCache = null;
    throw error;
  });

  try {
    return NextResponse.json(await stopsCache);
  } catch {
    return NextResponse.json(
      { error: "Impossible de preparer les arrets Astuce." },
      { status: 502 },
    );
  }
}
