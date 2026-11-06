// Privy imports Solana helpers we never call (0G sign-in is EVM only). next.config.mjs aliases them here.
export function getTransferSolInstruction() {
  throw new Error("Solana is not supported in Taksh.");
}
