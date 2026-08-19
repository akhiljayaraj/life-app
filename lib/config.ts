export const LOCAL_USER_ID = "00000000-0000-0000-0000-000000000001";

export function getVaultPath(): string {
  const p = process.env.VAULT_PATH;
  if (!p) throw new Error("VAULT_PATH is not set (see .env.example)");
  return p;
}
