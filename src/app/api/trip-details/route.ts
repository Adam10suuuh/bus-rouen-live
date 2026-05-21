import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";

const ASTUCE_GTFS_URL =
  "https://api.mrn.cityway.fr/dataflow/offre-tc/download?dataFormat=gtfs&dataProfil=ASTUCE&provider=ASTUCE";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type CsvRow = Record<string, string>;

type TripDetailsPayload = {
  tripId: string;
  routeId: string;
  headsign: string;
  directionId: string | null;
  shape: Array<{ latitude: number; longitude: number }>;
  stops: Array<{
    id: string;
    name: string;
    sequence: number;
    latitude: number;
    longitude: number;
    arrivalTime: string;
  }>;
  delay: {
    available: false;
    label: string;
  };
};

let gtfsZipCache: Promise<JSZip> | null = null;
const tripDetailsCache = new Map<string, Promise<TripDetailsPayload>>();

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

async function getGtfsZip() {
  gtfsZipCache ??= fetch(ASTUCE_GTFS_URL, { cache: "no-store" })
    .then((response) => {
      if (!response.ok) {
        throw new Error("GTFS Astuce indisponible.");
      }

      return response.arrayBuffer();
    })
    .then((buffer) => JSZip.loadAsync(buffer))
    .catch((error) => {
      gtfsZipCache = null;
      throw error;
    });

  return gtfsZipCache;
}

async function readGtfsFile(zip: JSZip, filename: string) {
  const file = zip.file(filename);

  if (!file) {
    throw new Error(`${filename} est absent du GTFS Astuce.`);
  }

  return file.async("string");
}

function parseTargetRows(
  content: string,
  targetColumn: string,
  targetValue: string,
) {
  const lines = content.split(/\r?\n/);
  const headers = lines[0]
    ?.replace(/^\uFEFF/, "")
    .split(",")
    .map((header) => header.trim());
  const targetIndex = headers.indexOf(targetColumn);

  if (targetIndex < 0) {
    return [];
  }

  return lines
    .slice(1)
    .filter((line) => line.split(",")[targetIndex] === targetValue)
    .join("\n");
}

async function buildTripDetails(tripId: string): Promise<TripDetailsPayload> {
  const zip = await getGtfsZip();
  const [tripsContent, stopsContent, stopTimesContent] = await Promise.all([
    readGtfsFile(zip, "trips.txt"),
    readGtfsFile(zip, "stops.txt"),
    readGtfsFile(zip, "stop_times.txt"),
  ]);
  const trip = parseCsv(
    `${tripsContent.split(/\r?\n/)[0]}\n${parseTargetRows(
      tripsContent,
      "trip_id",
      tripId,
    )}`,
  )[0];

  if (!trip) {
    throw new Error("Trajet introuvable dans le GTFS Astuce.");
  }

  const stopRows = parseCsv(stopsContent);
  const stopsById = new Map(stopRows.map((stop) => [stop.stop_id, stop]));
  const stopTimes = parseCsv(
    `${stopTimesContent.split(/\r?\n/)[0]}\n${parseTargetRows(
      stopTimesContent,
      "trip_id",
      tripId,
    )}`,
  );
  const stops = stopTimes
    .map((stopTime) => {
      const stop = stopsById.get(stopTime.stop_id);
      const latitude = Number(stop?.stop_lat);
      const longitude = Number(stop?.stop_lon);

      if (!stop || !latitude || !longitude) {
        return null;
      }

      return {
        id: stopTime.stop_id,
        name: stop.stop_name,
        sequence: Number(stopTime.stop_sequence),
        latitude,
        longitude,
        arrivalTime: stopTime.arrival_time,
      };
    })
    .filter((stop): stop is NonNullable<typeof stop> => stop !== null)
    .sort((left, right) => left.sequence - right.sequence);

  const shape = await getShape(zip, trip.shape_id, stops);

  return {
    tripId,
    routeId: trip.route_id,
    headsign: trip.trip_headsign,
    directionId: trip.direction_id || null,
    shape,
    stops,
    delay: {
      available: false,
      label: "Retard non disponible",
    },
  };
}

async function getShape(
  zip: JSZip,
  shapeId: string,
  fallbackStops: TripDetailsPayload["stops"],
) {
  if (!shapeId) {
    return fallbackStops.map((stop) => ({
      latitude: stop.latitude,
      longitude: stop.longitude,
    }));
  }

  try {
    const shapesContent = await readGtfsFile(zip, "shapes.txt");
    const shapeRows = parseCsv(
      `${shapesContent.split(/\r?\n/)[0]}\n${parseTargetRows(
        shapesContent,
        "shape_id",
        shapeId,
      )}`,
    );

    const shape = shapeRows
      .map((point) => ({
        latitude: Number(point.shape_pt_lat),
        longitude: Number(point.shape_pt_lon),
        sequence: Number(point.shape_pt_sequence),
      }))
      .filter((point) => point.latitude && point.longitude)
      .sort((left, right) => left.sequence - right.sequence)
      .map(({ latitude, longitude }) => ({ latitude, longitude }));

    return shape.length
      ? shape
      : fallbackStops.map((stop) => ({
          latitude: stop.latitude,
          longitude: stop.longitude,
        }));
  } catch {
    return fallbackStops.map((stop) => ({
      latitude: stop.latitude,
      longitude: stop.longitude,
    }));
  }
}

export async function GET(request: NextRequest) {
  const tripId = request.nextUrl.searchParams.get("tripId");

  if (!tripId) {
    return NextResponse.json({ error: "tripId requis." }, { status: 400 });
  }

  const promise =
    tripDetailsCache.get(tripId) ??
    buildTripDetails(tripId).catch((error) => {
      tripDetailsCache.delete(tripId);
      throw error;
    });
  tripDetailsCache.set(tripId, promise);

  try {
    return NextResponse.json(await promise);
  } catch {
    return NextResponse.json(
      { error: "Impossible de recuperer les details du trajet." },
      { status: 502 },
    );
  }
}
