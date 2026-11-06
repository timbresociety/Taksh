import Link from "next/link";
import { listGames } from "@/lib/arkiv/store";
import { TEMPLATES, templateInfo } from "@/lib/templates";
import { SWARM_REF, swarmUrl } from "@/lib/swarm/bee";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shared games" };

// Read straight from Arkiv on every request. Nothing about these games lives in this app.
export default async function Page({ searchParams }) {
  const { template } = await searchParams;
  const filter = templateInfo(template) ? template : undefined;
  let listing = null;
  try {
    listing = await listGames({ template: filter });
  } catch (error) {
    console.error("Arkiv gallery read failed:", error.shortMessage ?? error.message);
  }

  return (
    <main className="shelf-page">
      <header className="court__mark">
        <Link href="/">Taksh</Link>
      </header>
      <section className="shelf" aria-labelledby="gallery-title">
        <h2 id="gallery-title">Shared games{listing ? ` (${listing.count})` : ""}</h2>
        <p className="examples">
          <Link className="chip" href="/games" aria-pressed={!filter}>All</Link>
          {TEMPLATES.map((t) => (
            <Link key={t.id} className="chip" href={`/games?template=${t.id}`} aria-pressed={filter === t.id}>{t.name}</Link>
          ))}
        </p>
        {!listing && <p className="error" role="alert">Arkiv did not respond, so shared games are unavailable right now. Games on the main page still play.</p>}
        {listing?.games.length === 0 && <p>No games shared here yet. Play one and press Publish on the result screen.</p>}
        {listing?.games.length > 0 && (
          <ul data-testid="gallery">
            {listing.games.map((game) => (
              <li key={game.key}>
                <Link className="game-card" href={`/games/${game.key}`} data-template={game.template}>
                  {/* A cover captured when the game was published, read from Swarm. Older games show the template's. */}
                  <img src={SWARM_REF.test(game.swarmRef ?? "") ? swarmUrl(game.swarmRef, "cover.webp") : `/previews/game-${game.template}.webp`} alt="" width="640" height="360" loading="lazy" />
                  <span className="game-card__name">{game.title}</span>
                  <span className="game-card__pitch">by {game.author}</span>
                  <span className="game-card__facts">
                    <span>{templateInfo(game.template)?.name ?? game.template}</span>
                    <span>{game.world}</span>
                    <span>{game.style}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
