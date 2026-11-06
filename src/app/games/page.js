import Link from "next/link";
import { arkivMessage, listGames } from "@/lib/arkiv/store";
import { WORLDS } from "@/lib/spec/contract";
import { TEMPLATES, templateInfo } from "@/lib/templates";
import { SWARM_REF, swarmUrl } from "@/lib/swarm/bee";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shared games" };

// Both filters are indexed columns, so each chip is one more eq() in the Arkiv query.
const href = (filters) => {
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  return params.size ? `/games?${params}` : "/games";
};

// Read straight from Arkiv on every request. Nothing about these games lives in this app.
export default async function Page({ searchParams }) {
  const { template, world } = await searchParams;
  const filter = templateInfo(template) ? template : undefined;
  const place = WORLDS.some((w) => w.id === world) ? world : undefined;
  let listing = null;
  let failure = null;
  try {
    listing = await listGames({ template: filter, world: place });
  } catch (error) {
    console.error("Arkiv gallery read failed:", error.shortMessage ?? error.message);
    failure = arkivMessage(error, "shared games are unavailable right now. Games on the main page still play");
  }

  return (
    <main className="shelf-page">
      <header className="court__mark">
        <Link href="/">Taksh</Link>
      </header>
      <section className="shelf" aria-labelledby="gallery-title">
        <h2 id="gallery-title">Shared games{listing ? ` (${listing.count})` : ""}</h2>
        <p className="examples" aria-label="Game">
          <Link className="chip" href={href({ world: place })} aria-pressed={!filter}>All games</Link>
          {TEMPLATES.map((t) => (
            <Link key={t.id} className="chip" href={href({ template: t.id, world: place })} aria-pressed={filter === t.id}>{t.name}</Link>
          ))}
        </p>
        <p className="examples" aria-label="World">
          <Link className="chip" href={href({ template: filter })} aria-pressed={!place}>All worlds</Link>
          {WORLDS.map((w) => (
            <Link key={w.id} className="chip" href={href({ template: filter, world: w.id })} aria-pressed={place === w.id}>{w.label}</Link>
          ))}
        </p>
        {failure && <p className="error" role="alert">{failure}</p>}
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
                    {/* Games are stored for Arkiv's longest lifetime, about six months. Past that the link stops working. */}
                    <span>{game.daysLeft} days left</span>
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
