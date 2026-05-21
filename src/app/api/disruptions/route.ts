import { NextResponse } from "next/server";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";

const ASTUCE_SERVICE_ALERTS_URL =
  "https://hexatransit.fr/datasets/services_rt/astuce/service_alerts.pb";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type FeedMessage = GtfsRealtimeBindings.transit_realtime.IFeedMessage;
type FeedEntity = GtfsRealtimeBindings.transit_realtime.IFeedEntity;
type Alert = GtfsRealtimeBindings.transit_realtime.IAlert;
type Translation = GtfsRealtimeBindings.transit_realtime.ITranslatedString;

function getText(translated?: Translation | null) {
  return (
    translated?.translation?.find((item) => item.language === "fr")?.text ??
    translated?.translation?.[0]?.text ??
    ""
  );
}

function cleanRouteId(routeId?: string | null) {
  return routeId?.replace(/^[A-Z]+:/, "").replace(/^0+/, "") || null;
}

function getLines(alert: Alert) {
  const lines = new Set<string>();

  for (const entity of alert.informedEntity ?? []) {
    const route = cleanRouteId(entity.routeId);

    if (route) {
      lines.add(route);
    }
  }

  return Array.from(lines).sort((left, right) =>
    left.localeCompare(right, "fr", { numeric: true, sensitivity: "base" }),
  );
}

function normalizeAlert(entity: FeedEntity) {
  const alert = entity.alert;

  if (!alert) {
    return null;
  }

  return {
    id: entity.id ?? crypto.randomUUID(),
    title: getText(alert.headerText) || "Perturbation Astuce",
    description: getText(alert.descriptionText),
    effect: String(alert.effect ?? "UNKNOWN_EFFECT"),
    cause: String(alert.cause ?? "UNKNOWN_CAUSE"),
    url: getText(alert.url),
    lines: getLines(alert),
  };
}

export async function GET() {
  const response = await fetch(ASTUCE_SERVICE_ALERTS_URL, {
    cache: "no-store",
    headers: {
      Accept: "application/x-protobuf, application/octet-stream",
    },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: "Impossible de recuperer les perturbations Astuce." },
      { status: 502 },
    );
  }

  const buffer = new Uint8Array(await response.arrayBuffer());
  const message = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
    buffer,
  ) as FeedMessage;
  const disruptions = (message.entity ?? [])
    .map(normalizeAlert)
    .filter((alert): alert is NonNullable<ReturnType<typeof normalizeAlert>> =>
      Boolean(alert),
    )
    .slice(0, 8);

  return NextResponse.json({
    source: ASTUCE_SERVICE_ALERTS_URL,
    updatedAt: new Date().toISOString(),
    count: disruptions.length,
    disruptions,
  });
}
