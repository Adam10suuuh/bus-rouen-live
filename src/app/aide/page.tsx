export default function HelpPage() {
  return (
    <main className="public-page">
      <a className="back-link" href="/">
        Retour a la carte
      </a>
      <section className="public-card">
        <p className="eyebrow">Aide</p>
        <h1>Utiliser Bus Rouen Live</h1>
        <div className="help-grid">
          <article>
            <h2>Carte</h2>
            <p>
              Deplace la carte pour explorer Rouen. Clique sur un vehicule pour
              voir sa ligne, sa direction et son suivi.
            </p>
          </article>
          <article>
            <h2>Favoris</h2>
            <p>
              Ajoute tes lignes ou arrets favoris depuis le filtre ou la liste
              des arrets proches. Ils servent a afficher les prochains passages
              utiles des l'ouverture.
            </p>
          </article>
          <article>
            <h2>Suivre un bus</h2>
            <p>
              Clique sur un bus, puis utilise le bouton de suivi. Si l'itineraire
              est disponible, l'application affiche les prochains arrets et le
              trace.
            </p>
          </article>
          <article>
            <h2>Installation</h2>
            <p>
              Sur mobile, ouvre le menu du navigateur puis choisis Ajouter a
              l'ecran d'accueil quand l'option est proposee.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
