export default function AboutPage() {
  return (
    <main className="public-page">
      <a className="back-link" href="/">
        Retour a la carte
      </a>
      <section className="public-card">
        <p className="eyebrow">Application non officielle</p>
        <h1>A propos de Bus Rouen Live</h1>
        <p>
          Bus Rouen Live aide a consulter les vehicules, arrets, lignes et
          perturbations du reseau Astuce autour de Rouen.
        </p>
        <p>
          L'application n'est pas editee par le reseau Astuce, la Metropole Rouen
          Normandie ou un transporteur. Les informations affichees proviennent
          des donnees ouvertes disponibles publiquement, notamment les flux GTFS
          et GTFS-RT quand ils sont accessibles.
        </p>
        <p>
          Les horaires temps reel peuvent etre incomplets ou indisponibles. En cas
          de doute, verifie toujours l'information officielle avant un trajet
          important.
        </p>
      </section>
    </main>
  );
}
