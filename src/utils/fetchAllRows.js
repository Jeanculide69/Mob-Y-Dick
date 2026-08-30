// Pagination des selects Supabase.
//
// PostgREST plafonne CHAQUE réponse à 1000 lignes (db-max-rows, valeur par
// défaut Supabase, non désactivable côté client). Une seule course dépasse
// déjà ce seuil sur race_laps (>1000 passages), et le championnat cumule
// plusieurs manches : sans pagination, le select renvoie silencieusement les
// 1000 premières lignes et les totaux de tours sont faux.
//
// `buildQuery` doit renvoyer une NOUVELLE query à chaque appel (les query
// builders supabase-js ne sont pas réutilisables) et inclure un tri
// déterministe sur une colonne unique — sinon deux pages peuvent se
// chevaucher ou sauter des lignes.

const DEFAULT_PAGE_SIZE = 1000

export async function fetchAllRows(buildQuery, { pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < pageSize) break
  }
  return rows
}
