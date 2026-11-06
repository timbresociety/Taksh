// The id a made world or style carries. Kept apart from made.js so light modules (the Arkiv board) can
// accept made ids without loading the stage.
export const MADE_ID = /^made-(world|style)-[a-z0-9-]{1,32}-[a-z0-9]{4,8}$/;
export const isMadeId = (kind, value) => MADE_ID.test(value ?? "") && value.startsWith(`made-${kind}-`);
