export default function PrivacyPage() {
  return (
    <main className="public-page">
      <a className="back-link" href="/">
        Retour a la carte
      </a>
      <section className="public-card">
        <p className="eyebrow">Confidentialite</p>
        <h1>Vos donnees restent locales</h1>
        <p>
          La position sert uniquement a calculer les arrets proches dans
          l'application. Elle reste sur l'appareil et n'est pas envoyee a un
          compte utilisateur.
        </p>
        <p>
          Les favoris Maison, Ecole, Travail, lignes et arrets favoris sont
          stockes dans le localStorage du navigateur. Ils peuvent etre supprimes
          en vidant les donnees du site dans le navigateur.
        </p>
        <p>
          Bus Rouen Live appelle uniquement les routes de l'application qui
          recuperent les donnees ouvertes necessaires aux vehicules, arrets et
          perturbations.
        </p>
      </section>
    </main>
  );
}
