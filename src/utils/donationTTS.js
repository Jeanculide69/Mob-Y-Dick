/**
 * donationTTS — Lecture vocale des dons façon Twitch
 *
 * Utilise l'API Web Speech (window.speechSynthesis) qui est :
 *  - 100% gratuite, native du navigateur
 *  - Disponible sur Chrome, Firefox, Safari, Edge récents
 *  - Multi-langues (on cherche une voix française en priorité)
 *
 * Limitations connues :
 *  - Sur Safari iOS, la première lecture nécessite une interaction
 *    utilisateur (touch). Le LiveRace a déjà un mécanisme "audio unlock"
 *    qu'on suit (audioUnlockedRef), donc une fois qu'un son a été
 *    déclenché par l'user, la TTS peut jouer librement.
 *  - Les voix varient selon l'OS. Sur Windows c'est Microsoft, sur
 *    macOS c'est Apple, sur Android c'est Google. Toutes décentes en
 *    français.
 *
 * Toggle : persisté dans localStorage sous la clé 'myd_donation_tts'.
 * Par défaut : ON.
 */

const STORAGE_KEY = 'myd_donation_tts'

/** Retourne true si la TTS est activée dans les préférences. */
export const isDonationTTSEnabled = () => {
  try {
    const val = localStorage.getItem(STORAGE_KEY)
    // Par défaut on est ON. Le user doit explicitement opt-out.
    return val !== '0' && val !== 'false'
  } catch {
    return true
  }
}

/** Active ou désactive la TTS. Persiste dans localStorage. */
export const setDonationTTSEnabled = (enabled) => {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
  } catch { /* ignore (mode privé) */ }
}

/** Retourne la meilleure voix française disponible, ou null. */
const pickFrenchVoice = () => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null
  // Préférence : fr-FR (France), puis fr-CA (Canada), puis n'importe quoi en français
  return voices.find(v => v.lang === 'fr-FR')
      || voices.find(v => v.lang === 'fr-CA')
      || voices.find(v => v.lang?.startsWith('fr'))
      || null
}

/** Cherche une voix française féminine (Amélie/Marie sur Mac, Hortense/Julie sur
 *  Windows, Audrey/Léa sur Android Google TTS). Fallback : première voix française. */
const pickFrenchFemaleVoice = () => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null
  const voices = window.speechSynthesis.getVoices()
  const frenchVoices = voices.filter(v => v.lang?.startsWith('fr'))
  // Liste large : noms d'OS connus + heuristiques Google ("Female", "Femme")
  const female = frenchVoices.find(v => /(amelie|amélie|marie|hortense|julie|audrey|léa|virginie|female|femme|google français)/i.test(v.name))
  return female || frenchVoices.find(v => v.lang === 'fr-FR') || frenchVoices[0] || null
}

/** Cherche une voix française masculine (Thomas sur Mac, Paul sur Windows). */
const pickFrenchMaleVoice = () => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null
  const voices = window.speechSynthesis.getVoices()
  const frenchVoices = voices.filter(v => v.lang?.startsWith('fr'))
  const male = frenchVoices.find(v => /(paul|thomas|nicolas|claude|bernard|michel)/i.test(v.name))
  return male || frenchVoices[0] || null
}

/** Sanitize le message pour la TTS : retire URL, emoji bruyants, longueur cap. */
const cleanForTTS = (text) => {
  if (!text) return ''
  let cleaned = String(text)
    // URLs : on les lit pas (sinon "h-t-t-p-s-deux-points-slash-slash...")
    .replace(/https?:\/\/\S+/gi, '')
    // Emojis et caractères non-imprimables (la TTS les lit littéralement
    // "smiling face emoji" en anglais sur certains navigateurs, agaçant)
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}]/gu, '')
    // Espaces multiples
    .replace(/\s+/g, ' ')
    .trim()
  // Cap à 250 chars pour éviter qu'un troll envoie War & Peace
  if (cleaned.length > 250) cleaned = cleaned.slice(0, 250) + '… etc'
  return cleaned
}

/**
 * Lit à voix haute un don.
 * @param {object} d - { display_name, amount, message }
 * @param {object} [opts]
 * @param {number} [opts.rate=1.05]    — vitesse (0.5 à 2)
 * @param {number} [opts.pitch=1]      — hauteur (0 à 2)
 * @param {number} [opts.volume=0.85]  — volume (0 à 1)
 * @param {boolean} [opts.force=false] — ignore le toggle utilisateur
 */
export const speakDonation = (d, opts = {}) => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  if (!opts.force && !isDonationTTSEnabled()) return
  if (!d) return

  const name = (d.display_name || 'Quelqu\'un').trim().slice(0, 40)
  const amount = Number(d.amount || 0)
  const message = cleanForTTS(d.message)

  // Construction de la phrase, ton "présentatrice live" :
  //   "Rider44 vient d'offrir 5 euros, et dit : Allez les gars !"
  // (verbe "offrir" cohérent avec les produits "Offrir une bière / le mélange /
  //  l'huile / un pneu" — plus de "donner" qui rappelait la cagnotte).
  let phrase
  if (amount >= 1) {
    const euros = Number.isInteger(amount) ? `${amount}` : amount.toFixed(2).replace('.', ',')
    phrase = `${name} vient d'offrir ${euros} euros`
    if (message) phrase += `, et dit : ${message}`
  } else {
    phrase = `${name} envoie un message`
    if (message) phrase += ` : ${message}`
  }

  // Cancel ce qui était en cours (anti-empilage si plusieurs messages rapprochés)
  try { window.speechSynthesis.cancel() } catch { /* ignore */ }

  const utterance = new SpeechSynthesisUtterance(phrase)
  utterance.lang = 'fr-FR'
  utterance.rate = opts.rate ?? 1.05
  // Pitch légèrement remonté pour renforcer la couleur féminine, surtout
  // utile sur les OS où aucune voix féminine n'est installée (le pitch
  // s'applique à la voix par défaut).
  utterance.pitch = opts.pitch ?? 1.15
  utterance.volume = opts.volume ?? 0.85

  // Voix féminine en priorité (cohérent avec l'ancienne expérience SuperChat
  // façon Twitch). Fallback sur la première voix française dispo si l'OS
  // n'en a pas (sera juste neutre).
  const frenchVoice = pickFrenchFemaleVoice() || pickFrenchVoice()
  if (frenchVoice) utterance.voice = frenchVoice

  try { window.speechSynthesis.speak(utterance) }
  catch (e) { console.warn('[TTS] speak failed', e) }
}

/**
 * Lit à voix haute une annonce (voix masculine, grave).
 * @param {string} text - Le texte de l'annonce
 */
export const speakAnnouncement = (text) => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  if (!text) return

  const cleaned = cleanForTTS(text)
  if (!cleaned) return

  try { window.speechSynthesis.cancel() } catch { /* ignore */ }

  const utterance = new SpeechSynthesisUtterance(`Nouvelle annonce organisateur : ${cleaned}`)
  utterance.lang = 'fr-FR'
  utterance.rate = 0.95 // Un peu plus lent, plus officiel
  utterance.pitch = 0.6 // Pitch plus bas pour simuler une voix d'homme même sur la voix par défaut
  utterance.volume = 1.0

  const maleVoice = pickFrenchMaleVoice()
  if (maleVoice) utterance.voice = maleVoice

  try { window.speechSynthesis.speak(utterance) }
  catch (e) { console.warn('[TTS] speak failed', e) }
}

/**
 * Préchargement des voix (Chrome charge async la première fois).
 * À appeler une fois au mount de LiveRace pour que la 1re TTS soit nickel.
 */
export const warmUpTTS = () => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  // Trigger le chargement des voix
  window.speechSynthesis.getVoices()
  // Sur Chrome, l'événement voiceschanged se fire quand la liste est prête
  if (typeof window.speechSynthesis.addEventListener === 'function') {
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      // Rien à faire, juste forcer le caching
      window.speechSynthesis.getVoices()
    }, { once: true })
  }
}
