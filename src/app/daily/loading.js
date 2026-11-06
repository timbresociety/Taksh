// The first visit of a UTC day waits for 0G to make the game, about half a minute. Day boards use it too.
export default function Loading() {
  return (
    <main className="shelf-page">
      <section className="pitch pitch--question" role="status">
        <h2>Reading the daily challenge from Arkiv</h2>
        <p>If nobody has played yet today, 0G is making the game now. That takes about half a minute, once a day.</p>
      </section>
    </main>
  );
}
