import Link from "next/link";
import { arkivMessage, listGames } from "@/lib/arkiv/store";
import { WORLDS } from "@/lib/spec/contract";
import { templateInfo } from "@/lib/templates";
import { SWARM_REF, swarmUrl } from "@/lib/swarm/bee";

export const dynamic = "force-dynamic";
export const metadata = { title: "Others' games" };

// Both filters are indexed columns, so each chip is one more eq() in the Arkiv query.
const href = (filters) => {
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  return params.size ? `/games?${params}` : "/games";
};

const worldName = (id) => WORLDS.find((world) => world.id === id)?.label ?? id;

// Read straight from Arkiv on every request. Nothing about these games lives in this app. Chips are
// offered only for games and worlds someone has shared, so no filter leads to an empty page.
export default async function Page({ searchParams }) {
  const { template, world } = await searchParams;
  const filter = templateInfo(template) ? template : undefined;
  const place = WORLDS.some((w) => w.id === world) ? world : undefined;
  let all = null;
  let listing = null;
  let failure = null;
  try {
    all = await listGames({});
    listing = filter || place ? await listGames({ template: filter, world: place }) : all;
  } catch (error) {
    console.error("Arkiv gallery read failed:", error.shortMessage ?? error.message);
    failure = arkivMessage(error, "shared games are unavailable right now. Games on the main page still play");
  }
  const shared = (key) => [...new Set((all?.games ?? []).map((game) => game[key]))];
  const games = shared("template").filter((id) => templateInfo(id));
  const worlds = shared("world").filter((id) => WORLDS.some((w) => w.id === id));

  return (
    <main className="shelf-page explore">
      <Link className="explore__back" href="/">Back to Taksh</Link>
      <section className="shelf" aria-labelledby="gallery-title">
        <h1 id="gallery-title">Others&apos; games</h1>
        <p className="explore__lead">Games other players made and shared. Open one to play it.</p>
        {games.length > 1 && (
          <nav className="explore__filters" aria-label="Game">
            <Link className="chip" href={href({ world: place })} aria-pressed={!filter}>All games</Link>
            {games.map((id) => (
              <Link key={id} className="chip" href={href({ template: id, world: place })} aria-pressed={filter === id}>{templateInfo(id).name}</Link>
            ))}
          </nav>
        )}
        {worlds.length > 1 && (
          <nav className="explore__filters" aria-label="World">
            <Link className="chip" href={href({ template: filter })} aria-pressed={!place}>All worlds</Link>
            {worlds.map((id) => (
              <Link key={id} className="chip" href={href({ template: filter, world: id })} aria-pressed={place === id}>{worldName(id)}</Link>
            ))}
          </nav>
        )}
        {failure && <p className="error" role="alert">{failure}</p>}
        {listing?.games.length === 0 && (
          <p className="explore__empty">
            Nothing shared {filter || place ? "with these filters" : "yet"}. Play a game and press Publish on the result screen to share yours.
          </p>
        )}
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
                    <span>{worldName(game.world)}</span>
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
