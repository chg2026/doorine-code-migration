const url = process.env.SUPABASE_DB_URL || "";
try {
  const u = new URL(url);
  console.log("[check-supabase-host] host:", u.hostname, "port:", u.port, "user:", u.username);
} catch (e) {
  console.error("[check-supabase-host] invalid URL:", e.message);
  process.exit(1);
}
