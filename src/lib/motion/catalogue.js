// Every clip in the character's recorded library, and the input that plays it. A game built on these
// can always show the player's move on the character. A test holds this to the real files, so a clip
// can't go unaccounted for. Moves with no recording are posed in stage/coach.js.
export const CURSOR = "cursor";

export const RECORDED_MOVES = {
  run_step: ["Walk_Loop", "Walk_Formal_Loop", "Walk_Carry_Loop", "Jog_Fwd_Loop", "Sprint_Loop", "Zombie_Walk_Fwd_Loop", "Push_Loop"],
  arm_pump: ["Swim_Fwd_Loop", "Swim_Idle_Loop", "ClimbUp_1m"],
  bounce: ["Dance_Loop"],
  jump: ["Jump_Start", "Jump_Loop", "Jump_Land"],
  squat_jump: ["NinjaJump_Start", "NinjaJump_Idle_Loop", "NinjaJump_Land"],
  squat_down: ["Crouch_Idle_Loop", "Crouch_Fwd_Loop", "Sitting_Enter", "Sitting_Idle_Loop", "Sitting_Exit", "Slide_Start", "Slide_Loop", "Slide_Exit", "Roll"],
  lunge: ["Fixing_Kneeling"],
  toe_touch: ["PickUp_Table", "Farm_Harvest", "Farm_PlantSeed"],
  step_left: ["Sword_Dash"],
  step_right: ["Shield_Dash"],
  lean_left: ["Driving_Loop"],
  lean_right: ["Idle_Rail_Loop"],
  punch_left: ["Punch_Jab"],
  punch_right: ["Punch_Cross"],
  hook_right: ["Melee_Hook", "Melee_Hook_Rec"],
  guard: ["Sword_Idle", "Sword_Block", "Idle_Shield_Loop", "Idle_Shield_Break", "Shield_OneShot"],
  slash_left: ["Sword_Regular_A", "Sword_Regular_A_Rec"],
  slash_right: ["Sword_Regular_B", "Sword_Regular_B_Rec"],
  slash_up: ["Sword_Regular_C"],
  slash_down: ["Sword_Attack", "Sword_Regular_Combo", "Sword_Heavy_Combo", "Zombie_Scratch", "OverhandThrow"],
  wood_chop: ["TreeChopping_Loop"],
  reach_up_left: ["Idle_Lantern_Loop"],
  reach_up_right: ["Idle_Torch_Loop", "Idle_Rail_Call"],
  hands_up: ["Chest_Open"],
  hand_right: ["Interact", "Farm_Watering"],
  curl_right: ["Consume", "Idle_TalkingPhone_Loop"],
  [CURSOR]: ["Pistol_Idle_Loop", "Pistol_Aim_Up", "Pistol_Aim_Neutral", "Pistol_Aim_Down", "Pistol_Shoot", "Pistol_Reload", "Spell_Simple_Enter", "Spell_Simple_Idle_Loop", "Spell_Simple_Shoot", "Spell_Simple_Exit"],
};

// What the character does on its own: standing about, and answering what happens to it.
export const REACTION_CLIPS = ["Idle_Loop", "Idle_Talking_Loop", "Sitting_Talking_Loop", "Idle_FoldArms_Loop", "Zombie_Idle_Loop", "Hit_Chest", "Hit_Head", "Hit_Knockback", "Death01", "LayToIdle", "Yes", "Idle_No_Loop"];

// The moves that can honestly be done fast. Only these feed a game's speed, and every other move is a
// single press however quickly it is repeated.
export const SPEED_INPUTS = {
  legs: { label: "Legs", moves: ["run_step", "bounce"] },
  flap: { label: "Flapping arms", moves: ["flap"] },
  arms: { label: "Pumping arms", moves: ["arm_pump"] },
};

// Common home cardio that a camera in front of the player cannot read: on the floor the body is end-on
// to the lens and the feet leave the frame. Left out on purpose, rather than read badly.
export const FLOOR_MOVES = ["mountain climbers", "plank jacks", "push-ups", "sit-ups", "bear crawl", "inchworm"];
