"use client";

import { divIcon } from "leaflet";
import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";

const rouenCenter = { latitude: 49.4432, longitude: 1.0993 };
const refreshIntervalMs = 30_000;
const visibleStopsLimit = 900;
const defaultHome = {
  latitude: 49.4429,
  longitude: 1.0885,
  label: "Rouen centre",
};
const defaultFavorites: Favorites = {
  places: {
    home: defaultHome,
    school: null,
    work: null,
  },
  stopIds: [],
  lines: [],
};
const placeLabels: Record<PlaceKey, string> = {
  home: "Maison",
  school: "Ecole",
  work: "Travail",
};

type LineType = "bus" | "teor" | "metro" | "tram" | "ter";
type Theme = "light" | "dark";
type PlaceKey = "home" | "school" | "work";

type Position = {
  latitude: number;
  longitude: number;
};

type FavoritePlace = Position & {
  label: string;
};

type Favorites = {
  places: Record<PlaceKey, FavoritePlace | null>;
  stopIds: string[];
  lines: string[];
};

type TripPlan = {
  destination: Stop | null;
  nearestStart: Stop | null;
  line: string | null;
  walkMinutes: number | null;
  fastest: string;
  lessWalking: string;
  fewerTransfers: string;
  transfers: string[];
};

type NearbyRecommendation = Stop & {
  distance: number;
  nextVehicle: Vehicle | null;
  walkMinutes: number;
  waitMinutes: number | null;
  sentence: string;
};

type StopPassage = {
  id: string;
  line: string;
  direction: string;
  minutes: number;
  vehicle: Vehicle;
};

type ActiveNavigation = {
  id: string;
  recommendation: NearbyRecommendation;
  startedAt: number;
  following: boolean;
};

type AlertLevel = "info" | "warning" | "critical";

type SmartAlert = {
  id: string;
  title: string;
  message: string;
  level: AlertLevel;
  timestamp: number;
};

type AlertPreferences = {
  enabled: boolean;
};

type Vehicle = {
  id: string;
  feedName: string;
  routeId: string;
  routeTechnicalId: string;
  routeType: LineType;
  routeLongName: string;
  direction: string;
  label: string;
  tripId: string | null;
  currentStopSequence: number | null;
  stopId: string | null;
  latitude: number;
  longitude: number;
  bearing: number;
  status: string;
  timestamp: number | null;
};

type StopLine = {
  id: string;
  name: string;
  type: LineType;
};

type Stop = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  lines: StopLine[];
};

type Disruption = {
  id: string;
  title: string;
  description: string;
  effect: string;
  cause: string;
  url: string;
  lines: string[];
};

type VehiclesResponse = {
  count: number;
  updatedAt: string;
  errors?: { feed: string; message: string }[];
  vehicles: Vehicle[];
};

type StopsResponse = {
  count: number;
  lines: string[];
  updatedAt: string;
  stops: Stop[];
};

type DisruptionsResponse = {
  count: number;
  updatedAt: string;
  disruptions: Disruption[];
};

type TripDetails = {
  tripId: string;
  routeId: string;
  headsign: string;
  directionId: string | null;
  shape: Position[];
  stops: Array<
    Position & {
      id: string;
      name: string;
      sequence: number;
      arrivalTime: string;
    }
  >;
  delay: {
    available: false;
    label: string;
  };
};

export function RouenMap() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [disruptions, setDisruptions] = useState<Disruption[]>([]);
  const [lines, setLines] = useState<string[]>([]);
  const [selectedLine, setSelectedLine] = useState("");
  const [search, setSearch] = useState("");
  const [tripQuery, setTripQuery] = useState("");
  const [schoolMode, setSchoolMode] = useState(false);
  const [activeNavigation, setActiveNavigation] = useState<ActiveNavigation | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [vehicleError, setVehicleError] = useState<string | null>(null);
  const [stopsError, setStopsError] = useState<string | null>(null);
  const [disruptionError, setDisruptionError] = useState<string | null>(null);
  const [userPosition, setUserPosition] = useState<Position | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [homePosition, setHomePosition] = useState<Position>(getInitialHome);
  const [homeMessage, setHomeMessage] = useState(getInitialHomeMessage);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [followedVehicleId, setFollowedVehicleId] = useState<string | null>(null);
  const [tripDetails, setTripDetails] = useState<TripDetails | null>(null);
  const [tripDetailsError, setTripDetailsError] = useState<string | null>(null);
  const [isTripDetailsLoading, setIsTripDetailsLoading] = useState(false);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [favorites, setFavorites] = useState<Favorites>(getInitialFavorites);
  const [alertPreferences, setAlertPreferences] =
    useState<AlertPreferences>(getInitialAlertPreferences);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(true);
  const [clockTick, setClockTick] = useState(() => Date.now());
  const [mapTarget, setMapTarget] = useState({
    latitude: rouenCenter.latitude,
    longitude: rouenCenter.longitude,
    zoom: 13,
    id: 0,
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("bus-rouen-theme", theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem("bus-rouen-favorites", JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    window.localStorage.setItem(
      "bus-rouen-alert-preferences",
      JSON.stringify(alertPreferences),
    );
  }, [alertPreferences]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setClockTick(Date.now()), 1_000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationDenied(false);
        setUserPosition({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => {
        setLocationDenied(true);
        setUserPosition(null);
      },
      { enableHighAccuracy: false, maximumAge: 120_000, timeout: 6_000 },
    );
  }, []);

  const selectedVehicle = useMemo(() => {
    return vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null;
  }, [selectedVehicleId, vehicles]);
  const activeVehicle = activeNavigation?.recommendation.nextVehicle
    ? vehicles.find(
        (vehicle) => vehicle.id === activeNavigation.recommendation.nextVehicle?.id,
      ) ?? activeNavigation.recommendation.nextVehicle
    : null;
  const selectedTripId = selectedVehicle?.tripId ?? null;
  const hasSelectedVehicle = Boolean(selectedVehicleId);

  useEffect(() => {
    let isMounted = true;

    async function loadTripDetails() {
      if (!selectedTripId) {
        setTripDetails(null);
        setTripDetailsError(
          hasSelectedVehicle ? "Itineraire non disponible pour ce vehicule." : null,
        );
        setIsTripDetailsLoading(false);
        return;
      }

      try {
        setIsTripDetailsLoading(true);
        setTripDetails(null);
        const response = await fetch(
          `/api/trip-details?tripId=${encodeURIComponent(selectedTripId)}`,
        );

        if (!response.ok) {
          throw new Error("Details du trajet indisponibles");
        }

        const data = (await response.json()) as TripDetails;

        if (isMounted) {
          setTripDetails(data);
          setTripDetailsError(null);
          setIsTripDetailsLoading(false);
        }
      } catch (error) {
        if (isMounted) {
          setTripDetails(null);
          setIsTripDetailsLoading(false);
          setTripDetailsError(
            error instanceof Error
              ? error.message
              : "Details du trajet indisponibles",
          );
        }
      }
    }

    loadTripDetails();

    return () => {
      isMounted = false;
    };
  }, [selectedTripId, hasSelectedVehicle]);

  useEffect(() => {
    let isMounted = true;

    async function loadStops() {
      try {
        const response = await fetch("/api/stops");

        if (!response.ok) {
          throw new Error("Arrets Astuce indisponibles");
        }

        const data = (await response.json()) as StopsResponse;

        if (isMounted) {
          setStops(data.stops);
          setLines(data.lines);
          setStopsError(null);
        }
      } catch (loadError) {
        if (isMounted) {
          setStopsError(
            loadError instanceof Error
              ? loadError.message
              : "Erreur de chargement des arrets",
          );
        }
      }
    }

    loadStops();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadDisruptions() {
      try {
        const response = await fetch("/api/disruptions", { cache: "no-store" });

        if (!response.ok) {
          throw new Error("Perturbations indisponibles");
        }

        const data = (await response.json()) as DisruptionsResponse;

        if (isMounted) {
          setDisruptions(data.disruptions);
          setDisruptionError(null);
        }
      } catch (loadError) {
        if (isMounted) {
          setDisruptionError(
            loadError instanceof Error
              ? loadError.message
              : "Erreur de chargement des perturbations",
          );
        }
      }
    }

    loadDisruptions();
    const intervalId = window.setInterval(loadDisruptions, 60_000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadVehicles() {
      try {
        const response = await fetch("/api/vehicles", { cache: "no-store" });

        if (!response.ok) {
          throw new Error("Flux Astuce indisponible");
        }

        const data = (await response.json()) as VehiclesResponse;

        if (isMounted) {
          setVehicles(data.vehicles);
          setLastUpdate(data.updatedAt);
          setVehicleError(
            data.errors?.length
              ? `Flux partiel: ${data.errors.map((item) => item.feed).join(", ")}`
              : null,
          );
        }
      } catch (loadError) {
        if (isMounted) {
          setVehicles([]);
          setVehicleError(
            loadError instanceof Error
              ? loadError.message
              : "Erreur de chargement",
          );
        }
      }
    }

    loadVehicles();
    const intervalId = window.setInterval(loadVehicles, refreshIntervalMs);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const referencePosition = userPosition ?? rouenCenter;
  const normalizedSearch = normalizeText(search);

  const filteredStops = useMemo(() => {
    return stops
      .filter((stop) => {
        const matchesLine =
          !selectedLine || stop.lines.some((line) => line.name === selectedLine);
        const matchesSearch =
          !normalizedSearch ||
          normalizeText(stop.name).includes(normalizedSearch);

        return matchesLine && matchesSearch;
      })
      .slice(0, visibleStopsLimit);
  }, [normalizedSearch, selectedLine, stops]);

  const favoriteStops = useMemo(() => {
    const stopById = new Map(stops.map((stop) => [stop.id, stop]));

    return favorites.stopIds
      .map((stopId) => stopById.get(stopId))
      .filter((stop): stop is Stop => Boolean(stop));
  }, [favorites.stopIds, stops]);

  const searchResults = useMemo(() => {
    if (!normalizedSearch) {
      return [];
    }

    return stops
      .filter((stop) => normalizeText(stop.name).includes(normalizedSearch))
      .slice(0, 5);
  }, [normalizedSearch, stops]);

  const filteredVehicles = useMemo(() => {
    if (!selectedLine) {
      return vehicles;
    }

    return vehicles.filter((vehicle) => vehicle.routeId === selectedLine);
  }, [selectedLine, vehicles]);

  const vehiclesInRouenArea = useMemo(
    () => filteredVehicles.filter(isInRouenArea),
    [filteredVehicles],
  );

  const nearestStops = useMemo(() => {
    return stops
      .filter((stop) => !selectedLine || stop.lines.some((line) => line.name === selectedLine))
      .map((stop) => ({
        ...stop,
        distance: getDistanceMeters(referencePosition, stop),
        nextPassages: buildStopPassages(stop, vehiclesInRouenArea),
      }))
      .sort((left, right) => left.distance - right.distance)
      .slice(0, 4);
  }, [referencePosition, selectedLine, stops, vehiclesInRouenArea]);

  const nearbyRecommendations = useMemo(() => {
    return buildNearbyRecommendations({
      hasPrecisePosition: Boolean(userPosition),
      referencePosition,
      stops,
      vehicles: vehiclesInRouenArea,
    });
  }, [referencePosition, stops, userPosition, vehiclesInRouenArea]);

  const nextVehicles = useMemo(() => {
    return vehiclesInRouenArea
      .map((vehicle) => ({
        ...vehicle,
        distance: getDistanceMeters(referencePosition, vehicle),
      }))
      .sort((left, right) => left.distance - right.distance)
      .slice(0, 4);
  }, [referencePosition, vehiclesInRouenArea]);

  const nextUsefulPassage = nearbyRecommendations.find(
    (recommendation) => recommendation.nextVehicle && recommendation.waitMinutes !== null,
  );

  const favoritePassages = useMemo(() => {
    return buildFavoritePassages({
      favoriteLines: favorites.lines,
      favoriteStops,
      referencePosition,
      vehicles: vehiclesInRouenArea,
    });
  }, [favoriteStops, favorites.lines, referencePosition, vehiclesInRouenArea]);

  const tripPlan = useMemo(() => {
    return buildTripPlan({
      query: schoolMode ? "Ecole" : tripQuery,
      referencePosition,
      schoolPlace: favorites.places.school,
      stops,
      vehicles: vehiclesInRouenArea,
    });
  }, [favorites.places.school, referencePosition, schoolMode, stops, tripQuery, vehiclesInRouenArea]);

  const smartAlerts = useMemo(() => {
    return alertPreferences.enabled
      ? buildSmartAlerts({
          disruptions,
          favoriteLines: favorites.lines,
          favoritePassages,
          lastUpdate,
          selectedVehicle,
          tripDetails,
          vehicleError,
          vehicles,
        })
      : [];
  }, [
    alertPreferences.enabled,
    disruptions,
    favoritePassages,
    favorites.lines,
    lastUpdate,
    selectedVehicle,
    tripDetails,
    vehicleError,
    vehicles,
  ]);
  const importantAlertCount = smartAlerts.filter(
    (alert) => alert.level !== "info",
  ).length;

  const importantDisruptions = useMemo(() => {
    if (!selectedLine) {
      return disruptions.slice(0, 3);
    }

    return disruptions
      .filter((disruption) => disruption.lines.includes(selectedLine))
      .slice(0, 3);
  }, [disruptions, selectedLine]);

  const lastUpdateLabel = getRelativeUpdateLabel(lastUpdate, clockTick);
  const astuceStatus =
    vehicleError && vehicles.length === 0 ? "indisponible" : "OK";
  const selectedNextStop = selectedVehicle
    ? getNextStop(selectedVehicle, tripDetails)
    : null;
  const selectedVehicleUpdateLabel = selectedVehicle?.timestamp
    ? getRelativeUpdateLabel(
        new Date(selectedVehicle.timestamp * 1_000).toISOString(),
        clockTick,
      )
    : "non disponible";

  const vehicleVisibilityMessage = getVehicleVisibilityMessage({
    selectedLine,
    totalVehicles: vehicles.length,
    filteredVehicles: filteredVehicles.length,
    visibleVehicles: vehiclesInRouenArea.length,
    vehicleError,
  });

  function focusPosition(position: Position, zoom = 16) {
    setMapTarget((target) => ({
      latitude: position.latitude,
      longitude: position.longitude,
      zoom,
      id: target.id + 1,
    }));
  }

  function focusAroundMe() {
    if (!navigator.geolocation) {
      focusPosition(referencePosition, 15);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextPosition = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setUserPosition(nextPosition);
        focusPosition(nextPosition, 16);
      },
      () => focusPosition(referencePosition, 15),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 8_000 },
    );
  }

  function selectVehicle(vehicle: Vehicle) {
    setSelectedVehicleId(vehicle.id);
    setFollowedVehicleId(vehicle.id);
    focusPosition(vehicle, 16);
  }

  function startNavigation(recommendation: NearbyRecommendation) {
    setActiveNavigation({
      id: `${recommendation.id}-${Date.now()}`,
      recommendation,
      startedAt: Date.now(),
      following: true,
    });

    if (recommendation.nextVehicle) {
      selectVehicle(recommendation.nextVehicle);
      return;
    }

    focusPosition(recommendation, 16);
  }

  function bringMeHome() {
    focusPosition(homePosition, 15);
    setHomeMessage(
      homePosition === defaultHome
        ? "Maison non configuree, centrage sur Rouen"
        : "Retour maison",
    );
  }

  function saveCurrentAsHome() {
    const nextHome = userPosition ?? rouenCenter;
    window.localStorage.setItem("bus-rouen-home", JSON.stringify(nextHome));
    setHomePosition(nextHome);
    setHomeMessage(
      userPosition
        ? "Position actuelle enregistree"
        : "Rouen centre enregistre",
    );
  }

  function savePlace(place: PlaceKey) {
    const nextPlace = {
      ...(userPosition ?? rouenCenter),
      label: placeLabels[place],
    };

    setFavorites((current) => ({
      ...current,
      places: {
        ...current.places,
        [place]: nextPlace,
      },
    }));

    if (place === "home") {
      setHomePosition(nextPlace);
      setHomeMessage("Maison enregistree");
      window.localStorage.setItem("bus-rouen-home", JSON.stringify(nextPlace));
    }
  }

  function toggleFavoriteStop(stopId: string) {
    setFavorites((current) => ({
      ...current,
      stopIds: toggleValue(current.stopIds, stopId),
    }));
  }

  function toggleFavoriteLine(line: string) {
    setFavorites((current) => ({
      ...current,
      lines: toggleValue(current.lines, line),
    }));
  }

  return (
    <div className="map-wrap" data-sheet={sheetExpanded ? "open" : "peek"}>
      <aside className="home-panel" aria-label="Accueil Bus Rouen Live">
        <button
          className="sheet-handle"
          type="button"
          onClick={() => setSheetExpanded((expanded) => !expanded)}
          aria-label={
            sheetExpanded ? "Reduire le panneau" : "Ouvrir le panneau"
          }
        />
        <div className="home-hero">
          <div className="hero-row">
            <span className="control-kicker">Maintenant</span>
            <div className="hero-actions">
              <button
                className="notification-button"
                type="button"
                onClick={() => setAlertsOpen((open) => !open)}
                aria-label="Centre d'alertes"
              >
                !
                {importantAlertCount > 0 ? (
                  <span>{importantAlertCount}</span>
                ) : null}
              </button>
              <span className="live-pill">Live</span>
              <button
                className="theme-toggle"
                type="button"
                onClick={() =>
                  setTheme((currentTheme) =>
                    currentTheme === "light" ? "dark" : "light",
                  )
                }
              >
                {theme === "light" ? "Sombre" : "Clair"}
              </button>
            </div>
          </div>
          <h2>Bus Rouen Live</h2>
          <p>Mis a jour {lastUpdateLabel}</p>
          <div className="status-strip" aria-label="Etat du flux Astuce">
            <span>
              <strong>{vehicles.length}</strong>
              vehicules en ligne
            </span>
            <span className={`feed-state feed-${astuceStatus}`}>
              Flux Astuce {astuceStatus}
            </span>
          </div>
          <div className="public-dashboard" aria-label="Accueil rapide">
            <article className="public-tile tile-primary">
              <span>Prochain bus utile</span>
              <strong>
                {nextUsefulPassage?.nextVehicle
                  ? `${nextUsefulPassage.nextVehicle.routeId} dans ${nextUsefulPassage.waitMinutes} min`
                  : "non disponible"}
              </strong>
              <small>
                {nextUsefulPassage
                  ? `${nextUsefulPassage.name} - ${nextUsefulPassage.nextVehicle?.direction ?? ""}`
                  : "Active ta position ou ajoute des favoris."}
              </small>
            </article>
            <article className="public-tile">
              <span>Arrets proches</span>
              <strong>{nearbyRecommendations.length}</strong>
              <small>
                {locationDenied
                  ? "Position refusee"
                  : nearbyRecommendations[0]?.name ?? "Aucune donnee trouvee"}
              </small>
            </article>
            <article className="public-tile">
              <span>Trajets favoris</span>
              <strong>{favoritePassages.length}</strong>
              <small>
                {favoritePassages[0]
                  ? `${favoritePassages[0].vehicle.routeId} vers ${favoritePassages[0].destination}`
                  : "Aucun favori configure"}
              </small>
            </article>
            <article className="public-tile">
              <span>Perturbations</span>
              <strong>{importantDisruptions.length}</strong>
              <small>
                {disruptionError
                  ? "Flux indisponible"
                  : importantDisruptions[0]?.title ?? "Aucune importante"}
              </small>
            </article>
          </div>
        </div>

        <div className="quick-search">
          <label className="field">
            <span>Recherche rapide</span>
            <div className="search-shell">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Jaures, Theatre des Arts..."
                type="search"
              />
            </div>
          </label>
          {searchResults.length > 0 ? (
            <div className="search-results">
              {searchResults.map((stop) => (
                <button
                  key={stop.id}
                  type="button"
                  onClick={() => focusPosition(stop)}
                >
                  {stop.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="home-actions">
          <button className="home-button" type="button" onClick={bringMeHome}>
            Me ramener chez moi
          </button>
          <button className="ghost-button" type="button" onClick={focusAroundMe}>
            Autour de moi
          </button>
          <button className="ghost-button" type="button" onClick={saveCurrentAsHome}>
            Definir maison
          </button>
        </div>
        <p className="home-note">{homeMessage}</p>

        <section className="home-section now-section">
          <div className="section-title">
            <h3>Autour de moi maintenant</h3>
            <span>{nearbyRecommendations.length}</span>
          </div>
          {locationDenied ? (
            <p className="empty-state">
              Active ta position pour voir les arrets proches.
            </p>
          ) : null}
          {!locationDenied &&
            nearbyRecommendations.map((recommendation) => (
              <article className="now-card" key={recommendation.id}>
                <div>
                  <strong>{recommendation.name}</strong>
                  <span>{recommendation.lines.map((line) => line.name).slice(0, 5).join(", ")}</span>
                </div>
                <p>{recommendation.sentence}</p>
                <div className="now-actions">
                  <button type="button" onClick={() => focusPosition(recommendation)}>
                    Voir sur la carte
                  </button>
                  <button
                    type="button"
                    onClick={() => startNavigation(recommendation)}
                  >
                    Demarrer le trajet
                  </button>
                </div>
              </article>
            ))}
        </section>

        <section className="favorites-strip" aria-label="Favoris rapides">
          {(Object.keys(placeLabels) as PlaceKey[]).map((place) => {
            const favoritePlace = favorites.places[place];

            return (
              <button
                key={place}
                type="button"
                onClick={() =>
                  favoritePlace ? focusPosition(favoritePlace, 15) : savePlace(place)
                }
              >
                <strong>{placeLabels[place]}</strong>
                <span>{favoritePlace ? "Y aller" : "Ajouter"}</span>
              </button>
            );
          })}
        </section>

        <label className="field">
          <span>Filtrer par ligne</span>
          <select
            value={selectedLine}
            onChange={(event) => setSelectedLine(event.target.value)}
          >
            <option value="">Toutes les lignes</option>
            {lines.map((line) => (
              <option key={line} value={line}>
                {line}
              </option>
            ))}
          </select>
          {selectedLine ? (
            <button
              className="inline-favorite"
              type="button"
              onClick={() => toggleFavoriteLine(selectedLine)}
            >
              {favorites.lines.includes(selectedLine)
                ? "Retirer cette ligne des favoris"
                : "Ajouter cette ligne aux favoris"}
            </button>
          ) : null}
        </label>

        <section className="home-section">
          <div className="section-title">
            <h3>Prochains passages favoris</h3>
            <span>{favoritePassages.length}</span>
          </div>
          {favoritePassages.map((passage) => (
            <button
              className="list-row"
              key={passage.id}
              type="button"
              onClick={() => focusPosition(passage.vehicle)}
            >
              <span>
                <strong>
                  {passage.vehicle.routeId} vers {passage.destination}
                </strong>
                <small>{passage.context}</small>
              </span>
              <b>{passage.minutes} min</b>
            </button>
          ))}
          {favoritePassages.length === 0 ? (
            <p className="empty-state">
              Ajoute une ligne ou un arret favori pour voir les prochains passages.
            </p>
          ) : null}
        </section>

        <section className="home-section assistant-card">
          <div className="section-title">
            <h3>Assistant trajet</h3>
            <span>simple</span>
          </div>
          <label className="field">
            <span>Ou veux-tu aller ?</span>
            <div className="search-shell">
              <input
                value={tripQuery}
                onChange={(event) => {
                  setTripQuery(event.target.value);
                  setSchoolMode(false);
                }}
                placeholder="Je veux aller a Saint-Sever"
                type="search"
              />
            </div>
          </label>
          <button
            className="inline-favorite"
            type="button"
            onClick={() => setSchoolMode((enabled) => !enabled)}
          >
            {schoolMode ? "Mode scolaire actif" : "Mode scolaire Maison -> Ecole"}
          </button>
          {tripPlan ? (
            <div className="trip-plan">
              <div>
                <strong>Arret le plus proche</strong>
                <span>{tripPlan.nearestStart?.name ?? "non disponible"}</span>
              </div>
              <div>
                <strong>Ligne a prendre</strong>
                <span>{tripPlan.line ?? "non disponible"}</span>
              </div>
              <div>
                <strong>Temps de marche</strong>
                <span>
                  {tripPlan.walkMinutes !== null
                    ? `${tripPlan.walkMinutes} min`
                    : "non disponible"}
                </span>
              </div>
              <div>
                <strong>Correspondances possibles</strong>
                <span>
                  {tripPlan.transfers.length
                    ? tripPlan.transfers.join(", ")
                    : "non disponible"}
                </span>
              </div>
              <div>
                <strong>Trajet le plus rapide</strong>
                <span>{tripPlan.fastest}</span>
              </div>
              <div>
                <strong>Moins de marche</strong>
                <span>{tripPlan.lessWalking}</span>
              </div>
              <div>
                <strong>Moins de correspondances</strong>
                <span>{tripPlan.fewerTransfers}</span>
              </div>
            </div>
          ) : (
            <p className="empty-state">
              Ecris une destination, par exemple Saint-Sever.
            </p>
          )}
        </section>

        <section className="home-section">
          <div className="section-title">
            <h3>Centre d'alertes</h3>
            <span>{smartAlerts.length}</span>
          </div>
          <button
            className="inline-favorite"
            type="button"
            onClick={() =>
              setAlertPreferences((current) => ({
                enabled: !current.enabled,
              }))
            }
          >
            {alertPreferences.enabled ? "Desactiver les alertes" : "Activer les alertes"}
          </button>
          {alertsOpen || smartAlerts.length > 0 ? (
            <div className="alerts-list">
              {smartAlerts.map((alert) => (
                <article className={`smart-alert alert-${alert.level}`} key={alert.id}>
                  <strong>{alert.title}</strong>
                  <span>{alert.message}</span>
                  <small>{getRelativeUpdateLabel(new Date(alert.timestamp).toISOString(), clockTick)}</small>
                </article>
              ))}
              {smartAlerts.length === 0 ? (
                <p className="empty-state">
                  Aucune alerte recente ou alertes desactivees.
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="home-section">
          <div className="section-title">
            <h3>Favoris</h3>
            <span>
              {favorites.stopIds.length} arrets - {favorites.lines.length} lignes
            </span>
          </div>
          {favoriteStops.map((stop) => (
            <button
              className="list-row"
              key={stop.id}
              type="button"
              onClick={() => focusPosition(stop)}
            >
              <span>
                <strong>{stop.name}</strong>
                <small>{stop.lines.map((line) => line.name).slice(0, 6).join(", ")}</small>
              </span>
              <b>Favori</b>
            </button>
          ))}
          {favorites.lines.length ? (
            <div className="favorite-lines">
              {favorites.lines.map((line) => (
                <button key={line} type="button" onClick={() => setSelectedLine(line)}>
                  {line}
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section className="home-section">
          <div className="section-title">
            <h3>Arrets les plus proches</h3>
            <span>{stops.length} charges</span>
          </div>
          {stopsError ? <p className="empty-state">{stopsError}</p> : null}
          {nearestStops.map((stop) => (
            <button
              className="list-row"
              key={stop.id}
              type="button"
              onClick={() => focusPosition(stop)}
            >
              <span>
                <strong>{stop.name}</strong>
                <small>{formatStopPassages(stop.nextPassages, stop.lines)}</small>
              </span>
              <b>{formatDistance(stop.distance)}</b>
              <em
                className="row-action"
                onClick={(event) => {
                  event.stopPropagation();
                  toggleFavoriteStop(stop.id);
                }}
              >
                {favorites.stopIds.includes(stop.id) ? "Favori" : "Ajouter"}
              </em>
            </button>
          ))}
          {!stopsError && nearestStops.length === 0 ? (
            <p className="empty-state">Aucune donnee trouvee pour les arrets proches.</p>
          ) : null}
        </section>

        <section className="home-section">
          <div className="section-title">
            <h3>Prochains bus</h3>
            <span>{vehicles.length} live</span>
          </div>
          {nextVehicles.map((vehicle) => (
            <button
              className="list-row"
              key={vehicle.id}
              type="button"
              onClick={() => focusPosition(vehicle)}
            >
              <span>
                <strong>{vehicle.routeId} - {getLineModeLabel(vehicle.routeType)}</strong>
                <small>{vehicle.direction}</small>
              </span>
              <b>{formatDistance(vehicle.distance)}</b>
            </button>
          ))}
          {nextVehicles.length === 0 ? (
            <p className="empty-state">
              {vehicleError
                ? "Flux temps reel indisponible."
                : "Aucune donnee trouvee pour les prochains bus."}
            </p>
          ) : null}
        </section>

        <section className="home-section">
          <div className="section-title">
            <h3>Perturbations importantes</h3>
            <span>{disruptions.length}</span>
          </div>
          {disruptionError ? <p className="empty-state">{disruptionError}</p> : null}
          {importantDisruptions.map((disruption) => (
            <article className="disruption-card" key={disruption.id}>
              <strong>{disruption.title}</strong>
              <small>{disruption.lines.length ? disruption.lines.join(", ") : "Reseau"}</small>
            </article>
          ))}
          {!disruptionError && importantDisruptions.length === 0 ? (
            <p className="empty-state">Aucune perturbation majeure affichee.</p>
          ) : null}
        </section>

        {selectedVehicle ? (
          <VehicleFollowCard
            vehicle={selectedVehicle}
            tripDetails={tripDetails}
            tripDetailsError={tripDetailsError}
            isTripDetailsLoading={isTripDetailsLoading}
            isFollowing={followedVehicleId === selectedVehicle.id}
            onFollow={() => setFollowedVehicleId(selectedVehicle.id)}
            onStopFollow={() => setFollowedVehicleId(null)}
            onClose={() => {
              setSelectedVehicleId(null);
              setFollowedVehicleId(null);
              setTripDetails(null);
            }}
          />
        ) : null}

        {activeNavigation ? (
          <NavigationCard
            navigation={activeNavigation}
            vehicle={activeVehicle}
            tripDetails={tripDetails}
            onFollow={() =>
              setActiveNavigation((current) =>
                current ? { ...current, following: true } : current,
              )
            }
            onStop={() => setActiveNavigation(null)}
          />
        ) : null}

        {vehicleVisibilityMessage ? (
          <div className="map-alert" role="status">
            {vehicleVisibilityMessage}
          </div>
        ) : null}
      </aside>

      <div className="map-floating-controls" aria-label="Commandes carte">
        <button type="button" onClick={focusAroundMe} aria-label="Ma position">
          <span>GPS</span>
        </button>
        <button type="button" onClick={() => focusPosition(rouenCenter, 13)}>
          Rouen
        </button>
        <button
          type="button"
          onClick={() => {
            setSheetExpanded(true);
            setSelectedLine("");
          }}
        >
          Lignes
        </button>
        <button
          type="button"
          onClick={() =>
            setTheme((currentTheme) =>
              currentTheme === "light" ? "dark" : "light",
            )
          }
        >
          {theme === "light" ? "Nuit" : "Jour"}
        </button>
      </div>

      <div className="map-legend" aria-label="Legende de la carte">
        <span><i className="legend-bus" />Bus</span>
        <span><i className="legend-teor" />TEOR</span>
        <span><i className="legend-metro" />Metro</span>
        <span><i className="legend-stop" />Arret</span>
      </div>

      {selectedVehicle ? (
        <aside className="vehicle-mini-card" aria-label="Bus selectionne">
          <span className={`mini-route mini-${selectedVehicle.routeType}`}>
            {selectedVehicle.routeId}
          </span>
          <div>
            <strong>{getLineModeLabel(selectedVehicle.routeType)} {selectedVehicle.routeId}</strong>
            <p>{selectedVehicle.direction}</p>
            <small>
              Prochain arret: {selectedNextStop?.name ?? selectedVehicle.stopId ?? "non disponible"}
            </small>
            <small>Derniere mise a jour: {selectedVehicleUpdateLabel}</small>
          </div>
          <button
            type="button"
            onClick={() =>
              followedVehicleId === selectedVehicle.id
                ? setFollowedVehicleId(null)
                : setFollowedVehicleId(selectedVehicle.id)
            }
          >
            {followedVehicleId === selectedVehicle.id ? "Suivi GPS actif" : "Suivre"}
          </button>
        </aside>
      ) : null}

      <MapContainer
        center={[rouenCenter.latitude, rouenCenter.longitude]}
        zoom={13}
        scrollWheelZoom
        className="map"
        aria-label="Carte OpenStreetMap centree sur Rouen"
      >
        <MapRecenter target={mapTarget} />
        <MapFollow
          vehicle={
            activeNavigation?.following
              ? activeVehicle
              : vehicles.find((vehicle) => vehicle.id === followedVehicleId) ?? null
          }
        />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        {selectedVehicle && tripDetails?.shape.length ? (
          <Polyline
            positions={tripDetails.shape.map((point) => [
              point.latitude,
              point.longitude,
            ])}
            pathOptions={{
              color: getRouteColor(selectedVehicle.routeType),
              opacity: 0.82,
              weight: 6,
            }}
          />
        ) : null}
        {filteredStops.map((stop) => (
          <Marker
            key={stop.id}
            position={[stop.latitude, stop.longitude]}
            icon={createStopIcon(getStopType(stop), stop.lines.length)}
            zIndexOffset={100}
          >
            <Popup>
              <strong>{stop.name}</strong>
              <br />
              Lignes:{" "}
              {stop.lines.length
                ? stop.lines.map((line) => line.name).join(", ")
                : "Non renseigne"}
              <br />
              Prochains passages:{" "}
              {formatStopPassages(buildStopPassages(stop, vehiclesInRouenArea), stop.lines)}
            </Popup>
          </Marker>
        ))}
        {vehiclesInRouenArea.map((vehicle) => (
          <Marker
            key={vehicle.id}
            position={[vehicle.latitude, vehicle.longitude]}
            icon={createVehicleIcon(vehicle, followedVehicleId === vehicle.id)}
            zIndexOffset={1_000}
            eventHandlers={{
              click: () => selectVehicle(vehicle),
            }}
          >
            <Popup>
              <strong>
                {getLineModeLabel(vehicle.routeType)} {vehicle.routeId}
              </strong>
              <br />
              Direction: {vehicle.direction}
              <br />
              Vehicule: {vehicle.label}
              <br />
              Exploitant: {vehicle.feedName}
              <br />
              Statut: {formatStatus(vehicle.status)}
              <br />
              Derniere mise a jour:{" "}
              {vehicle.timestamp
                ? getRelativeUpdateLabel(
                    new Date(vehicle.timestamp * 1_000).toISOString(),
                    clockTick,
                  )
                : "non disponible"}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

function VehicleFollowCard({
  vehicle,
  tripDetails,
  tripDetailsError,
  isTripDetailsLoading,
  isFollowing,
  onFollow,
  onStopFollow,
  onClose,
}: {
  vehicle: Vehicle;
  tripDetails: TripDetails | null;
  tripDetailsError: string | null;
  isTripDetailsLoading: boolean;
  isFollowing: boolean;
  onFollow: () => void;
  onStopFollow: () => void;
  onClose: () => void;
}) {
  const nextStop = getNextStop(vehicle, tripDetails);
  const upcomingStops = getUpcomingStops(vehicle, tripDetails).slice(0, 4);

  return (
    <section className="follow-card" aria-label="Suivi du bus selectionne">
      <div className="follow-head">
        <span className={`follow-badge follow-${vehicle.routeType}`}>
          {vehicle.routeId}
        </span>
        <div>
          <h3>{getLineModeLabel(vehicle.routeType)} {vehicle.routeId}</h3>
          <p>{vehicle.direction}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer le suivi">
          x
        </button>
      </div>

      <dl className="follow-grid">
        <div>
          <dt>Prochain arret</dt>
          <dd>{nextStop?.name ?? vehicle.stopId ?? "Non renseigne"}</dd>
        </div>
        <div>
          <dt>Retard</dt>
          <dd>{tripDetails?.delay.label ?? "Retard non disponible"}</dd>
        </div>
        <div>
          <dt>Vehicule</dt>
          <dd>{vehicle.label}</dd>
        </div>
        <div>
          <dt>Trajet</dt>
          <dd>{tripDetails?.stops.length ?? 0} arrets</dd>
        </div>
      </dl>

      <div className="follow-actions">
        <button type="button" onClick={isFollowing ? onStopFollow : onFollow}>
          {isFollowing ? "Suivi actif" : "Suivre en direct"}
        </button>
        <span>{formatStatus(vehicle.status)}</span>
      </div>

      {tripDetailsError ? (
        <p className="empty-state">{tripDetailsError}</p>
      ) : null}

      {isTripDetailsLoading ? (
        <p className="empty-state">Chargement de l&apos;itineraire...</p>
      ) : null}

      {upcomingStops.length ? (
        <ol className="route-list">
          {upcomingStops.map((stop) => (
            <li key={`${stop.id}-${stop.sequence}`}>
              <span>{stop.name}</span>
              <small>{stop.arrivalTime}</small>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function NavigationCard({
  navigation,
  vehicle,
  tripDetails,
  onFollow,
  onStop,
}: {
  navigation: ActiveNavigation;
  vehicle: Vehicle | null;
  tripDetails: TripDetails | null;
  onFollow: () => void;
  onStop: () => void;
}) {
  const recommendation = navigation.recommendation;
  const upcomingStops = vehicle ? getUpcomingStops(vehicle, tripDetails) : [];
  const dropOffStop = upcomingStops[upcomingStops.length - 1] ?? null;
  const progress = getNavigationProgress(navigation, recommendation, vehicle);

  return (
    <section className="navigation-card" aria-label="Navigation etape par etape">
      <div className="section-title">
        <h3>Navigation</h3>
        <span>{progress}%</span>
      </div>
      <div className="progress-track" aria-label="Progression du trajet">
        <span style={{ width: `${progress}%` }} />
      </div>
      <ol className="navigation-steps">
        <li>
          <strong>Marche jusqu'a l'arret</strong>
          <span>
            {recommendation.walkMinutes
              ? `${recommendation.walkMinutes} min vers ${recommendation.name}`
              : "non disponible"}
          </span>
        </li>
        <li>
          <strong>Ligne a prendre</strong>
          <span>{vehicle?.routeId ?? recommendation.lines[0]?.name ?? "non disponible"}</span>
        </li>
        <li>
          <strong>Direction</strong>
          <span>{vehicle?.direction ?? "non disponible"}</span>
        </li>
        <li>
          <strong>Nombre d'arrets</strong>
          <span>{upcomingStops.length || "non disponible"}</span>
        </li>
        <li>
          <strong>Arret de descente</strong>
          <span>{dropOffStop?.name ?? "non disponible"}</span>
        </li>
        <li>
          <strong>Marche finale</strong>
          <span>non disponible</span>
        </li>
      </ol>
      <p className="smart-alert">
        {upcomingStops.length >= 2
          ? `Descends dans 2 arrets : ${upcomingStops[1].name}`
          : "Descends dans 2 arrets : non disponible"}
      </p>
      <div className="follow-actions">
        <button type="button" onClick={onFollow}>
          Suivre ce trajet
        </button>
        <button type="button" onClick={onStop}>
          Arreter
        </button>
      </div>
    </section>
  );
}

function getNextStop(vehicle: Vehicle, tripDetails: TripDetails | null) {
  if (!tripDetails) {
    return null;
  }

  if (vehicle.stopId) {
    const stopById = tripDetails.stops.find((stop) => stop.id === vehicle.stopId);

    if (stopById) {
      return stopById;
    }
  }

  if (vehicle.currentStopSequence !== null) {
    return (
      tripDetails.stops.find(
        (stop) => stop.sequence >= Number(vehicle.currentStopSequence),
      ) ?? null
    );
  }

  return null;
}

function getUpcomingStops(vehicle: Vehicle, tripDetails: TripDetails | null) {
  if (!tripDetails) {
    return [];
  }

  const nextStop = getNextStop(vehicle, tripDetails);

  if (!nextStop) {
    return tripDetails.stops.slice(0, 4);
  }

  return tripDetails.stops.filter((stop) => stop.sequence >= nextStop.sequence);
}

function getNavigationProgress(
  navigation: ActiveNavigation,
  recommendation: NearbyRecommendation,
  vehicle: Vehicle | null,
) {
  if (!vehicle) {
    return Math.min(
      30,
      Math.round(((Date.now() - navigation.startedAt) / 60_000) * 10),
    );
  }

  if (vehicle.stopId === recommendation.id) {
    return 70;
  }

  return Math.min(
    85,
    Math.max(35, 35 + Math.round(((Date.now() - navigation.startedAt) / 60_000) * 8)),
  );
}

function MapRecenter({
  target,
}: {
  target: Position & { zoom: number; id: number };
}) {
  const map = useMap();

  useEffect(() => {
    map.setView([target.latitude, target.longitude], target.zoom, {
      animate: true,
    });
  }, [map, target]);

  return null;
}

function getInitialTheme(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }

  const savedTheme = window.localStorage.getItem("bus-rouen-theme");

  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function getInitialFavorites(): Favorites {
  if (typeof window === "undefined") {
    return defaultFavorites;
  }

  const savedFavorites = window.localStorage.getItem("bus-rouen-favorites");

  if (!savedFavorites) {
    return defaultFavorites;
  }

  try {
    const parsed = JSON.parse(savedFavorites) as Partial<Favorites>;

    return {
      places: {
        ...defaultFavorites.places,
        ...(parsed.places ?? {}),
      },
      stopIds: Array.isArray(parsed.stopIds) ? parsed.stopIds : [],
      lines: Array.isArray(parsed.lines) ? parsed.lines : [],
    };
  } catch {
    window.localStorage.removeItem("bus-rouen-favorites");
    return defaultFavorites;
  }
}

function getInitialAlertPreferences(): AlertPreferences {
  if (typeof window === "undefined") {
    return { enabled: true };
  }

  const savedPreferences = window.localStorage.getItem(
    "bus-rouen-alert-preferences",
  );

  if (!savedPreferences) {
    return { enabled: true };
  }

  try {
    const parsed = JSON.parse(savedPreferences) as Partial<AlertPreferences>;

    return {
      enabled: parsed.enabled ?? true,
    };
  } catch {
    window.localStorage.removeItem("bus-rouen-alert-preferences");
    return { enabled: true };
  }
}

function MapFollow({ vehicle }: { vehicle: Vehicle | null }) {
  const map = useMap();

  useEffect(() => {
    if (vehicle) {
      map.panTo([vehicle.latitude, vehicle.longitude], { animate: true });
    }
  }, [map, vehicle]);

  return null;
}

function getInitialHome() {
  if (typeof window === "undefined") {
    return defaultHome;
  }

  const savedHome = window.localStorage.getItem("bus-rouen-home");

  if (!savedHome) {
    return defaultHome;
  }

  try {
    return JSON.parse(savedHome) as Position;
  } catch {
    window.localStorage.removeItem("bus-rouen-home");
    return defaultHome;
  }
}

function getInitialHomeMessage() {
  if (
    typeof window !== "undefined" &&
    window.localStorage.getItem("bus-rouen-home")
  ) {
    return "Maison enregistree";
  }

  return "Maison: Rouen centre";
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getDistanceMeters(from: Position, to: Position) {
  const earthRadius = 6_371_000;
  const fromLat = toRadians(from.latitude);
  const toLat = toRadians(to.latitude);
  const latDelta = toRadians(to.latitude - from.latitude);
  const lonDelta = toRadians(to.longitude - from.longitude);
  const haversine =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(fromLat) *
      Math.cos(toLat) *
      Math.sin(lonDelta / 2) *
      Math.sin(lonDelta / 2);

  return (
    earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function formatDistance(distance: number) {
  return distance >= 1_000
    ? `${(distance / 1_000).toFixed(1)} km`
    : `${Math.round(distance)} m`;
}

function toggleValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function buildFavoritePassages({
  favoriteLines,
  favoriteStops,
  referencePosition,
  vehicles,
}: {
  favoriteLines: string[];
  favoriteStops: Stop[];
  referencePosition: Position;
  vehicles: Vehicle[];
}) {
  const favoriteStopLines = new Set(
    favoriteStops.flatMap((stop) => stop.lines.map((line) => line.name)),
  );
  const allFavoriteLines = new Set([...favoriteLines, ...favoriteStopLines]);

  return vehicles
    .filter((vehicle) => allFavoriteLines.has(vehicle.routeId))
    .map((vehicle) => {
      const nearestFavoriteStop = favoriteStops
        .filter((stop) =>
          stop.lines.some((line) => line.name === vehicle.routeId),
        )
        .map((stop) => ({
          ...stop,
          distance: getDistanceMeters(vehicle, stop),
        }))
        .sort((left, right) => left.distance - right.distance)[0];
      const distance = nearestFavoriteStop
        ? nearestFavoriteStop.distance
        : getDistanceMeters(referencePosition, vehicle);

      return {
        id: `${vehicle.id}-${nearestFavoriteStop?.id ?? vehicle.routeId}`,
        vehicle,
        destination: getDirectionLabel(vehicle.direction),
        context: nearestFavoriteStop
          ? `Proche de ${nearestFavoriteStop.name}`
          : "Ligne favorite",
        minutes: estimateMinutes(distance),
        sortDistance: distance,
      };
    })
    .sort((left, right) => left.minutes - right.minutes || left.sortDistance - right.sortDistance)
    .slice(0, 5);
}

function buildStopPassages(
  stop: Stop,
  vehicles: Vehicle[],
  limit = 3,
): StopPassage[] {
  const stopLines = new Set(stop.lines.map((line) => line.name));

  return vehicles
    .filter((vehicle) => stopLines.has(vehicle.routeId))
    .map((vehicle) => ({
      id: `${stop.id}-${vehicle.id}`,
      line: vehicle.routeId,
      direction: getDirectionLabel(vehicle.direction),
      minutes: estimateMinutes(getDistanceMeters(vehicle, stop)),
      vehicle,
    }))
    .sort((left, right) => left.minutes - right.minutes)
    .slice(0, limit);
}

function formatStopPassages(passages: StopPassage[], lines: StopLine[]) {
  if (passages.length) {
    return passages
      .map((passage) => `${passage.line} ${passage.minutes} min`)
      .join(" - ");
  }

  if (lines.length) {
    return `${lines.map((line) => line.name).slice(0, 6).join(", ")} - prochains passages non disponibles`;
  }

  return "Aucune donnee trouvee";
}

function buildNearbyRecommendations({
  hasPrecisePosition,
  referencePosition,
  stops,
  vehicles,
}: {
  hasPrecisePosition: boolean;
  referencePosition: Position;
  stops: Stop[];
  vehicles: Vehicle[];
}): NearbyRecommendation[] {
  if (!hasPrecisePosition) {
    return [];
  }

  return stops
    .map((stop) => {
      const distance = getDistanceMeters(referencePosition, stop);
      const nextVehicle =
        vehicles
          .filter((vehicle) =>
            stop.lines.some((line) => line.name === vehicle.routeId),
          )
          .map((vehicle) => ({
            ...vehicle,
            distance: getDistanceMeters(vehicle, stop),
          }))
          .sort((left, right) => left.distance - right.distance)[0] ?? null;
      const walkMinutes = Math.max(1, Math.round(distance / 80));
      const waitMinutes = nextVehicle
        ? estimateMinutes(getDistanceMeters(nextVehicle, stop))
        : null;
      const line = nextVehicle?.routeId ?? stop.lines[0]?.name ?? "ligne";
      const waitLabel = waitMinutes !== null ? `${waitMinutes} min` : "non disponible";

      return {
        ...stop,
        distance,
        nextVehicle,
        walkMinutes,
        waitMinutes,
        sentence: `Marche ${walkMinutes} min jusqu'a l'arret ${stop.name}, prends le ${line} dans ${waitLabel}.`,
      };
    })
    .sort((left, right) => left.distance - right.distance)
    .slice(0, 5);
}

function estimateMinutes(distanceMeters: number) {
  return Math.max(1, Math.round(distanceMeters / 320));
}

function getDirectionLabel(direction: string) {
  const parts = direction.split("<>");
  const lastPart = parts[parts.length - 1];

  return lastPart?.replace(/\(.+\)/, "").trim() || direction;
}

function buildTripPlan({
  query,
  referencePosition,
  schoolPlace,
  stops,
  vehicles,
}: {
  query: string;
  referencePosition: Position;
  schoolPlace: FavoritePlace | null;
  stops: Stop[];
  vehicles: Vehicle[];
}): TripPlan | null {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) {
    return null;
  }

  const destination =
    schoolPlace && normalizedQuery === "ecole"
      ? findNearestStop(schoolPlace, stops)
      : stops.find((stop) => normalizeText(stop.name).includes(normalizedQuery)) ??
        stops.find((stop) =>
          stop.lines.some((line) => normalizeText(line.name).includes(normalizedQuery)),
        ) ??
        null;

  const nearestStart = findNearestStop(referencePosition, stops);
  const sharedLine =
    nearestStart && destination
      ? nearestStart.lines.find((line) =>
          destination.lines.some((destinationLine) => destinationLine.name === line.name),
        )?.name ?? null
      : null;
  const liveLine =
    sharedLine ??
    destination?.lines.find((line) =>
      vehicles.some((vehicle) => vehicle.routeId === line.name),
    )?.name ??
    destination?.lines[0]?.name ??
    null;
  const walkMinutes = nearestStart
    ? Math.max(1, Math.round(getDistanceMeters(referencePosition, nearestStart) / 80))
    : null;
  const transfers =
    nearestStart && destination
      ? nearestStart.lines
          .filter((line) =>
            destination.lines.some((destinationLine) => destinationLine.name !== line.name),
          )
          .map((line) => line.name)
          .slice(0, 4)
      : [];
  const baseLabel =
    destination && liveLine
      ? `${liveLine} vers ${destination.name}`
      : "non disponible";

  return {
    destination,
    nearestStart,
    line: liveLine,
    walkMinutes,
    transfers,
    fastest: baseLabel,
    lessWalking: nearestStart
      ? `Depuis ${nearestStart.name}`
      : "non disponible",
    fewerTransfers: sharedLine
      ? `${sharedLine} direct`
      : "non disponible",
  };
}

function findNearestStop(position: Position, stops: Stop[]) {
  return (
    stops
      .map((stop) => ({
        ...stop,
        distance: getDistanceMeters(position, stop),
      }))
      .sort((left, right) => left.distance - right.distance)[0] ?? null
  );
}

function buildSmartAlerts({
  disruptions,
  favoriteLines,
  favoritePassages,
  lastUpdate,
  selectedVehicle,
  tripDetails,
  vehicleError,
  vehicles,
}: {
  disruptions: Disruption[];
  favoriteLines: string[];
  favoritePassages: ReturnType<typeof buildFavoritePassages>;
  lastUpdate: string | null;
  selectedVehicle: Vehicle | null;
  tripDetails: TripDetails | null;
  vehicleError: string | null;
  vehicles: Vehicle[];
}): SmartAlert[] {
  const now = Date.now();
  const alerts: SmartAlert[] = [];
  const nextFavorite = favoritePassages[0];

  if (nextFavorite && nextFavorite.minutes <= 5) {
    alerts.push({
      id: "favorite-bus-arriving",
      title: "Ton bus arrive dans 5 minutes",
      message: `${nextFavorite.vehicle.routeId} vers ${nextFavorite.destination} arrive dans ${nextFavorite.minutes} min.`,
      level: nextFavorite.minutes <= 2 ? "critical" : "warning",
      timestamp: now,
    });
  } else {
    alerts.push({
      id: "favorite-bus-arriving-unavailable",
      title: "Ton bus arrive dans 5 minutes",
      message: "non disponible",
      level: "info",
      timestamp: now,
    });
  }

  if (nextFavorite && nextFavorite.minutes <= 2) {
    alerts.push({
      id: "leave-now",
      title: "Pars maintenant",
      message: `${nextFavorite.vehicle.routeId} est proche. ${nextFavorite.context}.`,
      level: "critical",
      timestamp: now,
    });
  } else {
    alerts.push({
      id: "leave-now-unavailable",
      title: "Pars maintenant",
      message: "non disponible",
      level: "info",
      timestamp: now,
    });
  }

  const upcomingStops = selectedVehicle
    ? getUpcomingStops(selectedVehicle, tripDetails)
    : [];
  if (upcomingStops.length >= 2) {
    alerts.push({
      id: "get-off-two-stops",
      title: "Descends dans 2 arrets",
      message: upcomingStops[1]?.name ?? "non disponible",
      level: "warning",
      timestamp: now,
    });
  } else {
    alerts.push({
      id: "get-off-two-stops-unavailable",
      title: "Descends dans 2 arrets",
      message: "non disponible",
      level: "info",
      timestamp: now,
    });
  }

  const disruptedFavorite = disruptions.find((disruption) =>
    disruption.lines.some((line) => favoriteLines.includes(line)),
  );
  if (disruptedFavorite) {
    alerts.push({
      id: `favorite-disruption-${disruptedFavorite.id}`,
      title: "Perturbation sur ta ligne favorite",
      message: disruptedFavorite.title,
      level: "critical",
      timestamp: now,
    });
  }

  if (vehicleError || (!lastUpdate && vehicles.length === 0)) {
    alerts.push({
      id: "realtime-feed-unavailable",
      title: "Flux temps reel indisponible",
      message: vehicleError ?? "Aucun vehicule temps reel recu.",
      level: "critical",
      timestamp: now,
    });
  }

  const staleMinutes = getStaleVehicleMinutes(vehicles, now);
  if (staleMinutes !== null && staleMinutes >= 3) {
    alerts.push({
      id: "vehicle-stuck",
      title: `Ton bus semble bloque depuis ${staleMinutes} minutes`,
      message: "La derniere position temps reel recue n'a pas evolue recemment.",
      level: "warning",
      timestamp: now,
    });
  } else {
    alerts.push({
      id: "vehicle-stuck-unavailable",
      title: "Ton bus semble bloque depuis X minutes",
      message: "non disponible",
      level: "info",
      timestamp: now,
    });
  }

  return alerts;
}

function getStaleVehicleMinutes(vehicles: Vehicle[], now: number) {
  const newestTimestamp = vehicles.reduce<number | null>((newest, vehicle) => {
    if (typeof vehicle.timestamp !== "number") {
      return newest;
    }

    return newest === null ? vehicle.timestamp : Math.max(newest, vehicle.timestamp);
  }, null);

  if (newestTimestamp === null) {
    return null;
  }

  return Math.max(0, Math.round((now - newestTimestamp * 1_000) / 60_000));
}

function getRelativeUpdateLabel(updatedAt: string | null, now: number) {
  if (!updatedAt) {
    return "en attente";
  }

  const seconds = Math.max(
    0,
    Math.round((now - new Date(updatedAt).getTime()) / 1_000),
  );

  if (seconds < 5) {
    return "a l'instant";
  }

  if (seconds < 60) {
    return `il y a ${seconds} secondes`;
  }

  const minutes = Math.round(seconds / 60);

  return `il y a ${minutes} min`;
}

function isInRouenArea(vehicle: Vehicle) {
  return (
    vehicle.latitude >= 49.2 &&
    vehicle.latitude <= 49.65 &&
    vehicle.longitude >= 0.75 &&
    vehicle.longitude <= 1.45
  );
}

function getVehicleVisibilityMessage({
  selectedLine,
  totalVehicles,
  filteredVehicles,
  visibleVehicles,
  vehicleError,
}: {
  selectedLine: string;
  totalVehicles: number;
  filteredVehicles: number;
  visibleVehicles: number;
  vehicleError: string | null;
}) {
  if (vehicleError && totalVehicles === 0) {
    return "Donnees recues mais hors zone / ligne non selectionnee / flux indisponible";
  }

  if (totalVehicles > 0 && selectedLine && filteredVehicles === 0) {
    return "Donnees recues mais ligne non selectionnee";
  }

  if (filteredVehicles > 0 && visibleVehicles === 0) {
    return "Donnees recues mais hors zone";
  }

  return vehicleError;
}

function getStopType(stop: Stop): LineType {
  if (stop.lines.some((line) => line.type === "metro")) {
    return "metro";
  }

  if (stop.lines.some((line) => line.type === "teor" || line.type === "tram")) {
    return "teor";
  }

  if (stop.lines.some((line) => line.type === "ter")) {
    return "ter";
  }

  return "bus";
}

function createStopIcon(type: LineType, lineCount: number) {
  const symbol = type === "metro" ? "M" : type === "teor" ? "T" : "S";

  return divIcon({
    className: `stop-marker stop-${type}`,
    html: `<span>${symbol || lineCount || ""}</span>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10],
  });
}

function createVehicleIcon(vehicle: Vehicle, isFollowed: boolean) {
  const route = vehicle.routeId.replace(/[<>&"]/g, "");
  const typeLabel =
    vehicle.routeType === "metro"
      ? "M"
      : vehicle.routeType === "teor" || vehicle.routeType === "tram"
        ? "T"
        : vehicle.routeType === "ter"
          ? "TER"
          : "";

  return divIcon({
    className: `vehicle-marker vehicle-${vehicle.routeType}${isFollowed ? " vehicle-followed" : ""}`,
    html: `<span><em style="transform: rotate(${vehicle.bearing}deg)">${typeLabel || "BUS"}</em><b>${route}</b></span>`,
    iconSize: [70, 42],
    iconAnchor: [35, 21],
    popupAnchor: [0, -20],
  });
}

function getRouteColor(type: LineType) {
  const colors: Record<LineType, string> = {
    bus: "#ff7a1a",
    teor: "#7653f5",
    metro: "#e03131",
    tram: "#7653f5",
    ter: "#334155",
  };

  return colors[type];
}

function getLineModeLabel(type: LineType) {
  const labels: Record<LineType, string> = {
    bus: "Bus",
    teor: "TEOR",
    metro: "Metro",
    tram: "Tram",
    ter: "TER",
  };

  return labels[type];
}

function formatStatus(status: string) {
  const labels: Record<string, string> = {
    INCOMING_AT: "arrive a l'arret",
    STOPPED_AT: "a l'arret",
    IN_TRANSIT_TO: "en trajet",
    IN_TRANSIT: "en trajet",
  };

  return labels[status] ?? status;
}
