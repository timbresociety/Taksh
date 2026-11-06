// The single source of truth for what a game can contain. A game is a template plus a skin and
// bounded tuning. The validator, session and generator prompts are all derived from this file.
import { POSES } from "../motion/poses.js";
import { TEMPLATES } from "../templates/index.js";

export const SPEC_VERSION = 2;

export const WORLDS = [
  { id: "downtown", label: "Downtown", blurb: "city blocks in bright daylight" },
  { id: "forest", label: "Wild Forest", blurb: "tall trees, rocks and flowers" },
  { id: "station", label: "Orbital Station", blurb: "metal decks and sci-fi crates" },
  { id: "moon", label: "Moon Base", blurb: "grey rock under a black sky" },
  { id: "village", label: "Old Village", blurb: "timber houses and cobbles" },
  { id: "sunset", label: "Sunset Park", blurb: "warm evening light through the trees" },
  { id: "mumbai", label: "Mumbai Street", blurb: "autos, taxis, potholes and vada pav on a hazy day" },
  { id: "marine_drive", label: "Marine Drive", blurb: "the evening sea-front, its lamps and the sands of Chowpatty" },
  { id: "diwali", label: "Diwali Night", blurb: "diyas, rangoli, lanterns and fireworks" },
];

export const STYLES = [
  { id: "bright", label: "Bright", blurb: "glossy, saturated, sunlit 3D" },
  { id: "toon", label: "Toon", blurb: "flat cel shading with ink outlines" },
  { id: "neon", label: "Neon", blurb: "dark scene with glowing edges" },
  { id: "pixel", label: "Pixel", blurb: "chunky low-resolution retro pixels" },
  { id: "comic", label: "Comic", blurb: "halftone dots and heavy ink" },
  { id: "clay", label: "Clay", blurb: "soft matte handmade models" },
];

export const BODIES = [
  { id: "athlete-female", label: "Athlete, female", clothed: true },
  { id: "athlete-male", label: "Athlete, male", clothed: true },
  { id: "ranger-female", label: "Ranger, female" },
  { id: "ranger-male", label: "Ranger, male" },
  { id: "peasant-female", label: "Villager, female" },
  { id: "peasant-male", label: "Villager, male" },
  { id: "dabbawala", label: "Dabbawala" },
  { id: "fisherman", label: "Koli fisherman" },
];

export const HAIR = ["simple-parted", "long", "buns", "buzzed", "buzzed-female", "none"];
export const SKIN_TONES = ["#f2c9a5", "#d9a074", "#a86e4a", "#6e4630"];
export const HAIR_COLOURS = ["#16100c", "#2b1c14", "#5d3a1e", "#c8742b", "#e6c27a", "#9aa0a6", "#d94f8a"];
export const CLOTH_COLOURS = ["#ff4f6d", "#2f6bff", "#21c48d", "#ffd23f", "#8b5cf6", "#f5f7fb", "#1f2a55", "#141a33"];

export const GESTURES = [
  { id: "step_left", label: "Step left", cue: "Step your whole body to your left" },
  { id: "step_right", label: "Step right", cue: "Step your whole body to your right" },
  { id: "jump", label: "Jump", cue: "Jump with both feet" },
  { id: "high_knee", label: "High knee", cue: "Drive one knee up to hip height" },
  { id: "squat_down", label: "Squat", cue: "Bend your knees and sink your hips" },
  { id: "squat_up", label: "Stand up", cue: "Stand tall out of your squat", hidden: true },
  { id: "lean_left", label: "Lean left", cue: "Keep your feet still and tilt your upper body to your left" },
  { id: "lean_right", label: "Lean right", cue: "Keep your feet still and tilt your upper body to your right" },
  { id: "punch_left", label: "Left punch", cue: "Fist by your chin, then punch out and slightly to your left" },
  { id: "punch_right", label: "Right punch", cue: "Fist by your chin, then punch out and slightly to your right" },
  { id: "hook_left", label: "Left hook", cue: "Lift your left elbow out to the side, then swing that fist across your chest" },
  { id: "hook_right", label: "Right hook", cue: "Lift your right elbow out to the side, then swing that fist across your chest" },
  { id: "uppercut_left", label: "Left uppercut", cue: "Dip your left fist to your waist, then drive it straight up to your chin" },
  { id: "uppercut_right", label: "Right uppercut", cue: "Dip your right fist to your waist, then drive it straight up to your chin" },
  { id: "guard", label: "Guard", cue: "Bring both fists up to your chin" },
  { id: "swing_left", label: "Swing left", cue: "Swipe one hand quickly across your body, moving to your left" },
  { id: "swing_right", label: "Swing right", cue: "Swipe one hand quickly across your body, moving to your right" },
  { id: "reach_up_left", label: "Left hand up", cue: "Reach your left hand high above your head, straight up or out on a diagonal" },
  { id: "reach_up_right", label: "Right hand up", cue: "Reach your right hand high above your head, straight up or out on a diagonal" },
  { id: "hands_up", label: "Both hands up", cue: "Throw both hands above your head" },
  { id: "lift_left", label: "Left leg lift", cue: "Lift your left leg, other foot on the floor" },
  { id: "lift_right", label: "Right leg lift", cue: "Lift your right leg, other foot on the floor" },
  { id: "slash_left", label: "Slash left", cue: "Swipe a hand fast across your body, moving to your left" },
  { id: "slash_right", label: "Slash right", cue: "Swipe a hand fast across your body, moving to your right" },
  { id: "slash_up", label: "Slash up", cue: "Swipe a hand fast from your waist to above your head" },
  { id: "slash_down", label: "Slash down", cue: "Swipe a hand fast from above your head to your waist" },
  { id: "run_step", label: "Run on the spot", cue: "Run on the spot with quick feet" },
  { id: "flap", label: "Flap", cue: "Lift both arms, then beat them down" },
  { id: "hand_left", label: "Left hand out", cue: "Push your left arm straight out sideways, level with your shoulder" },
  { id: "hand_right", label: "Right hand out", cue: "Push your right arm straight out sideways, level with your shoulder" },
  { id: "kick_left", label: "Left kick", cue: "Swing your left leg out sideways, with your foot off the floor" },
  { id: "kick_right", label: "Right kick", cue: "Swing your right leg out sideways, with your foot off the floor" },
  { id: "burpee", label: "Burpee", cue: "Drop your hands to the floor, then stand back up" },
  { id: "guard_end", label: "Drop guard", cue: "Lower your fists from your chin", hidden: true },
  { id: "jumping_jack", label: "Jumping jack", cue: "Jump your feet wide as both hands go above your head" },
  { id: "step_jack", label: "Step jack", cue: "Step one foot out as both hands rise, with no jump" },
  { id: "squat_jump", label: "Squat jump", cue: "Squat, then jump straight up out of it" },
  { id: "bounce", label: "Rope skip", cue: "Bounce on both feet, just off the floor, as if skipping rope" },
  { id: "arm_pump", label: "Arm pump", cue: "Pump your arms fast, one hand up as the other goes down" },
  { id: "butt_kick_left", label: "Left butt kick", cue: "Flick your left heel up behind you, knee pointing down" },
  { id: "butt_kick_right", label: "Right butt kick", cue: "Flick your right heel up behind you, knee pointing down" },
  { id: "lunge", label: "Lunge", cue: "Step one foot back and sink your hips" },
  { id: "side_lunge_left", label: "Left side lunge", cue: "Step wide to your left and sink onto that leg" },
  { id: "side_lunge_right", label: "Right side lunge", cue: "Step wide to your right and sink onto that leg" },
  { id: "skater_left", label: "Skate left", cue: "Hop to your left, landing on your left foot with the other foot off the floor" },
  { id: "skater_right", label: "Skate right", cue: "Hop to your right, landing on your right foot with the other foot off the floor" },
  { id: "toe_touch", label: "Toe touch", cue: "Keep your legs straight and reach both hands past your knees" },
  { id: "windmill_left", label: "Windmill left", cue: "Reach your right hand down to your left foot" },
  { id: "windmill_right", label: "Windmill right", cue: "Reach your left hand down to your right foot" },
  { id: "cross_crunch_left", label: "Left cross crunch", cue: "Bring your left knee up to meet your right elbow" },
  { id: "cross_crunch_right", label: "Right cross crunch", cue: "Bring your right knee up to meet your left elbow" },
  { id: "twist_left", label: "Twist left", cue: "Keep your hips still and turn your chest to your left" },
  { id: "twist_right", label: "Twist right", cue: "Keep your hips still and turn your chest to your right" },
  { id: "curl_left", label: "Left curl", cue: "Keep your left elbow down and bring that hand up to your shoulder" },
  { id: "curl_right", label: "Right curl", cue: "Keep your right elbow down and bring that hand up to your shoulder" },
  { id: "wood_chop", label: "Wood chop", cue: "Hold your hands together above your head, then chop them down fast" },
  ...POSES.map((pose) => ({ id: `pose_${pose.id}`, label: pose.label, cue: `Hold ${pose.label}`, hidden: true })),
];

const gestureById = new Map(GESTURES.map((gesture) => [gesture.id, gesture]));
export const gestureInfo = (id) => gestureById.get(id);

const list = (items) => items.map((item) => item.id).join(", ");

// Injected into the generator prompts, so prompts can never drift out of step with the runtime.
export function contractText() {
  const templates = TEMPLATES.map((template) => {
    const tuning = Object.entries(template.tuning)
      .map(([key, field]) => `    ${key}: ${field.label}, ${field.min} to ${field.max}${field.unit ? ` ${field.unit}` : ""}, default ${field.default}, ${field.higherIsHarder ? "higher is harder" : "higher is easier"}`)
      .join("\n");
    const moves = [...new Set(template.bindings.map((binding) => binding.exercise))].join(", ");
    return `- ${template.id} (${template.name}): ${template.pitch}\n  Player moves: ${moves}\n  Tuning:\n${tuning}`;
  }).join("\n");
  return [
    `specVersion is ${SPEC_VERSION}.`,
    `Templates:\n${templates}`,
    `Worlds: ${WORLDS.map((world) => `${world.id} (${world.blurb})`).join("; ")}`,
    `Art styles: ${STYLES.map((style) => `${style.id} (${style.blurb})`).join("; ")}`,
    `Character bodies: ${list(BODIES)}. Hair: ${HAIR.join(", ")}. Clothing colours apply to athlete bodies only.`,
    `Colours are #rrggbb strings. Skin tones: ${SKIN_TONES.join(", ")}.`,
    `Tuning is a list of { key, value } pairs for the chosen template, inside the ranges above. Leave out any key to use its default.`,
  ].join("\n\n");
}

const text = { type: "string" };
const colour = { type: "string" };
const object = (properties) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const character = object({
  body: { type: "string", enum: BODIES.map((body) => body.id) },
  hair: { type: "string", enum: HAIR },
  skinTone: colour,
  hairColour: colour,
  top: colour,
  bottom: colour,
  shoes: colour,
});

export const GAME_SPEC_SCHEMA = object({
  specVersion: { type: "integer" },
  template: { type: "string", enum: TEMPLATES.map((template) => template.id) },
  title: text,
  objective: text,
  seed: { type: "integer" },
  skin: object({
    world: { type: "string", enum: WORLDS.map((world) => world.id) },
    style: { type: "string", enum: STYLES.map((style) => style.id) },
    hero: character,
    rival: character,
  }),
  tuning: { type: "array", items: object({ key: text, value: { type: "number" } }) },
});

export const DEFAULT_HERO = { body: "athlete-female", hair: "buns", skinTone: SKIN_TONES[1], hairColour: "#2b1c14", top: "#ff4f6d", bottom: "#1f2a55", shoes: "#f5f7fb" };
export const DEFAULT_RIVAL = { body: "athlete-male", hair: "buzzed", skinTone: SKIN_TONES[2], hairColour: "#16100c", top: "#2f6bff", bottom: "#141a33", shoes: "#ffd23f" };
