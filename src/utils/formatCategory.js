// Abréviation des noms de catégorie pour les affichages compacts (badges,
// onglets, podiums). Toujours utiliser `title={name}` à côté du résultat
// pour que le nom complet reste accessible au survol.
//
// Heuristique : retire les "mots structurels" courants ("cadre en V serie A
// 50cc" → "V A 50cc"). Si rien à retirer ou résultat vide, retourne le nom
// complet inchangé.

const STOP_WORDS = new Set([
  'en', 'de', 'du', 'la', 'le', 'les', 'et', 'à', 'a',
  'serie', 'série', 'series',
  'type', 'classe', 'classes', 'categorie', 'catégorie', 'cat',
  'cadre', 'châssis', 'chassis',
])

export function formatCategoryShort(name, { maxLength = 14 } = {}) {
  if (!name || typeof name !== 'string') return name || ''
  const trimmed = name.trim()
  if (trimmed.length <= maxLength) return trimmed

  const tokens = trimmed.split(/\s+/)
  const kept = tokens.filter(tok => !STOP_WORDS.has(tok.toLowerCase()))
  if (kept.length === 0) return trimmed

  const short = kept.join(' ')
  return short.length < trimmed.length ? short : trimmed
}
