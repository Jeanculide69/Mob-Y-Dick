// discordAlert — alertes Discord côté navigateur
//
// La majorité des alertes (nouveaux users, commandes, achats, messages…) part
// directement de Postgres via des triggers (migration v39). Côté front on ne
// gère QUE ce qui n'est pas un événement DB : les connexions échouées à
// répétition.
//
// Tout passe par l'edge function `discord-alert` (le webhook reste secret,
// jamais exposé dans le bundle client). Appels fire-and-forget : une alerte
// ne doit jamais bloquer ni casser l'expérience utilisateur.

import { supabase } from '../supabaseClient';

const STORE_KEY = 'myd_failed_logins_v1';
const THRESHOLD = 3;                 // échecs avant de déclencher une alerte
const WINDOW_MS = 10 * 60 * 1000;    // fenêtre de comptage (10 min)
const THROTTLE_MS = 10 * 60 * 1000;  // 1 alerte max / 10 min / email
const PURGE_MS = 24 * 60 * 60 * 1000; // purge des entrées de + de 24 h

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeStore(store) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* localStorage indisponible (navigation privée…) : on ignore */
  }
}

/**
 * Envoie un événement custom à l'edge function discord-alert.
 * Fire-and-forget : n'attend rien, n'émet aucune erreur visible.
 */
export async function notifyDiscord(event, data = {}) {
  if (!supabase) return;
  try {
    await supabase.functions.invoke('discord-alert', { body: { event, ...data } });
  } catch {
    /* on n'interrompt jamais l'UX pour une alerte ratée */
  }
}

/** Remet à zéro le compteur d'échecs après une connexion réussie. */
export function resetFailedLogins(email) {
  const key = (email || '').trim().toLowerCase();
  if (!key) return;
  const store = readStore();
  if (store[key]) {
    delete store[key];
    writeStore(store);
  }
}

/**
 * Enregistre une tentative de connexion échouée. Déclenche une alerte Discord
 * dès THRESHOLD échecs dans la fenêtre, puis throttle pour ne pas spammer.
 */
export function recordFailedLogin(email, reason) {
  const key = (email || '').trim().toLowerCase();
  if (!key) return;

  const now = Date.now();
  const store = readStore();
  let entry = store[key];

  // Repart de zéro si la 1re tentative date d'avant la fenêtre courante
  if (!entry || now - (entry.firstAt || 0) > WINDOW_MS) {
    entry = { count: 0, firstAt: now, lastAlertAt: 0 };
  }
  entry.count += 1;
  entry.lastAt = now;

  const reached = entry.count >= THRESHOLD;
  const notThrottled = now - (entry.lastAlertAt || 0) > THROTTLE_MS;

  if (reached && notThrottled) {
    entry.lastAlertAt = now;
    notifyDiscord('auth_failed', {
      email: key,
      attempts: entry.count,
      reason: reason || 'identifiants invalides',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    });
    // On redémarre le comptage : il faudra THRESHOLD nouveaux échecs
    entry.count = 0;
    entry.firstAt = now;
  }

  store[key] = entry;

  // Purge légère des vieilles entrées pour ne pas faire grossir le storage
  for (const k of Object.keys(store)) {
    if (now - (store[k].lastAt || 0) > PURGE_MS) delete store[k];
  }
  writeStore(store);
}
