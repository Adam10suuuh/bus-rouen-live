import { RouenMapClient } from "./components/RouenMapClient";

export default function Home() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Temps reel Astuce</p>
          <h1>Bus Rouen Live</h1>
        </div>
        <nav className="topnav" aria-label="Pages utiles">
          <a href="/a-propos">A propos</a>
          <a href="/aide">Aide</a>
          <a href="/confidentialite">Confidentialite</a>
        </nav>
        <span className="status">Bus et arrets Astuce</span>
      </header>
      <section className="map-panel">
        <RouenMapClient />
      </section>
    </main>
  );
}
