"use client";

import { useEffect, useRef, useState } from "react";
import { BODIES, CLOTH_COLOURS, HAIR, HAIR_COLOURS, SKIN_TONES, STYLES, WORLDS } from "@/lib/spec/contract";
import { createStage } from "@/lib/stage/stage";
import { templateInfo } from "@/lib/templates";

const HAIR_LABELS = { "simple-parted": "Parted", long: "Long", buns: "Buns", buzzed: "Buzzed", "buzzed-female": "Cropped", none: "None" };

export function Controls({ spec }) {
  const template = templateInfo(spec.template);
  // Mirror Match and the circuit show their move on screen, so ten or more rows would only get in the
  // way. Last Line's nine zones each need their own move, so nine still fit.
  const shown = template.actions.length > 9 ? template.actions.slice(0, 3) : template.actions;
  // A game played with hand cursors says what the hands do, since its swipes only stand in for a key.
  const body = (action) => template.handCursors?.controls?.[action.id] ?? [...new Set(template.bindings.filter((binding) => binding.action === action.id).map((binding) => binding.exercise))].join(" or ");
  return (
    <table className="controls" data-testid="controls">
      <thead>
        <tr>
          <th scope="col">Your body</th>
          <th scope="col">Does</th>
          <th scope="col">Key</th>
        </tr>
      </thead>
      <tbody>
        {shown.map((action) => (
          <tr key={action.id}>
            <td>{body(action)}</td>
            <td>{action.label}</td>
            <td>
              <kbd>{action.keyLabel}</kbd>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// 640x360, the gallery card's shape, cut from the middle of the preview.
function snapshot(canvas) {
  const out = document.createElement("canvas");
  out.width = 640;
  out.height = 360;
  const scale = Math.min(canvas.width / 640, canvas.height / 360);
  const [w, h] = [640 * scale, 360 * scale];
  out.getContext("2d").drawImage(canvas, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h, 0, 0, 640, 360);
  return out.toDataURL("image/webp", 0.8);
}

// onCover gets a snapshot once the scene has run a second. It's the cover a published game gets.
function LivePreview({ spec, onCover }) {
  const host = useRef(null);
  const [ready, setReady] = useState(false);
  const cover = useRef(onCover);
  cover.current = onCover;

  useEffect(() => {
    let alive = true;
    let stage = null;
    let raf = 0;
    createStage(host.current, spec, { preview: true }).then((made) => {
      if (!alive) {
        made.dispose();
        return;
      }
      stage = made;
      setReady(true);
      let last = performance.now();
      let frames = 0;
      const frame = (now) => {
        stage.frame(null, Math.min(50, now - last));
        last = now;
        // Read in the same task as the render, before WebGL clears the buffer.
        const canvas = host.current?.querySelector("canvas");
        if (++frames === 60 && cover.current && canvas) cover.current(snapshot(canvas));
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    });
    const onResize = () => stage?.resize();
    window.addEventListener("resize", onResize);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      stage?.dispose();
    };
  }, [spec]);

  return <div ref={host} className="look__canvas" data-ready={ready} data-testid="preview" role="img" aria-label={`Preview of your character in ${spec.skin.world}`} />;
}

function Choices({ legend, items, value, onChange, thumb }) {
  return (
    <fieldset className="choices" data-thumbs={Boolean(thumb)}>
      <legend>{legend}</legend>
      <div>
        {items.map((item) => (
          <label key={item.id}>
            <input type="radio" name={legend} value={item.id} checked={value === item.id} onChange={() => onChange(item.id)} />
            {thumb && <img src={thumb(item.id)} alt="" width="160" height="90" loading="lazy" />}
            <span>{item.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Swatches({ legend, colours, value, onChange }) {
  return (
    <fieldset className="swatches">
      <legend>{legend}</legend>
      <div>
        {colours.map((colour) => (
          <label key={colour} style={{ "--swatch": colour }}>
            <input type="radio" name={legend} value={colour} checked={value === colour} onChange={() => onChange(colour)} aria-label={`${legend} ${colour}`} />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function BriefStage({ game, onChangeSkin, onPlay, onBack, onCover }) {
  const { spec } = game;
  const template = templateInfo(spec.template);
  const [who, setWho] = useState("hero");
  const { skin } = spec;
  const person = skin[who];
  const clothed = BODIES.find((body) => body.id === person.body).clothed;
  const setPerson = (change) => onChangeSkin({ [who]: { ...person, ...change } });

  return (
    <main className="look">
      <section className="look__stage">
        <LivePreview key={JSON.stringify(skin) + who} spec={who === "rival" ? { ...spec, skin: { ...skin, hero: skin.rival } } : spec} onCover={who === "hero" ? onCover : undefined} />
      </section>

      <section className="look__panel">
        <h1 data-testid="game-title">{spec.title}</h1>
        <p className="brief__objective">{spec.objective}</p>
        <div className="answers">
          <button type="button" className="button button--go" onClick={() => onPlay("camera")}>
            Play with camera
          </button>
          <button type="button" className="button" onClick={() => onPlay("keyboard")}>
            Play with keyboard
          </button>
        </div>

        <Choices legend="World" items={WORLDS} value={skin.world} onChange={(world) => onChangeSkin({ world })} thumb={(id) => `/previews/world-${id}.webp`} />
        <Choices legend="Art style" items={STYLES} value={skin.style} onChange={(style) => onChangeSkin({ style })} thumb={(id) => `/previews/style-${id}.webp`} />

        {template.rival && (
          <div className="who" role="group" aria-label="Who to dress">
            <button type="button" className="chip" aria-pressed={who === "hero"} onClick={() => setWho("hero")}>You</button>
            <button type="button" className="chip" aria-pressed={who === "rival"} onClick={() => setWho("rival")}>Your rival</button>
          </div>
        )}
        <Choices legend="Character" items={BODIES} value={person.body} onChange={(body) => setPerson({ body })} />
        <Choices legend="Hair" items={HAIR.map((id) => ({ id, label: HAIR_LABELS[id] }))} value={person.hair} onChange={(hair) => setPerson({ hair })} />
        <div className="swatch-row">
          <Swatches legend="Skin" colours={SKIN_TONES} value={person.skinTone} onChange={(skinTone) => setPerson({ skinTone })} />
          <Swatches legend="Hair colour" colours={HAIR_COLOURS} value={person.hairColour} onChange={(hairColour) => setPerson({ hairColour })} />
          {clothed && (
            <>
              <Swatches legend="Top" colours={CLOTH_COLOURS} value={person.top} onChange={(top) => setPerson({ top })} />
              <Swatches legend="Shorts" colours={CLOTH_COLOURS} value={person.bottom} onChange={(bottom) => setPerson({ bottom })} />
              <Swatches legend="Shoes" colours={CLOTH_COLOURS} value={person.shoes} onChange={(shoes) => setPerson({ shoes })} />
            </>
          )}
        </div>

        <Controls spec={spec} />
        <button type="button" className="text-button" onClick={onBack}>
          Back to all games
        </button>
      </section>
    </main>
  );
}
