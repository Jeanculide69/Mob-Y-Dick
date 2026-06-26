/**
 * Attend un nombre donné de millisecondes.
 * @param {number} ms Millisecondes à attendre
 * @returns {Promise<void>}
 */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Exécute une requête fetch avec un mécanisme de retry exponentiel.
 * @param {string} url URL de la requête
 * @param {Object} fetchOptions Options de fetch (méthode, headers, body)
 * @param {number} [maxAttempts=2] Nombre maximum d'essais pour ce modèle
 * @returns {Promise<Response>} La réponse HTTP
 */
async function fetchWithRetry(url, fetchOptions, maxAttempts = 2) {
  let delay = 1000;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, fetchOptions);
      if (response.ok) {
        return response;
      }
      
      if (response.status === 429 || response.status === 500 || response.status === 503) {
        if (attempt === maxAttempts) {
          throw new Error(`HTTP ${response.status}: ${response.statusText || 'Error'}`);
        }
        // Si quota dépassé (429), le retry immédiat a peu de chances de réussir.
        // On lève l'erreur pour forcer la bascule plus rapidement vers le modèle de secours,
        // mais pour d'autres statuts (500/503), on peut retenter.
        if (response.status === 429) {
          throw new Error(`HTTP 429: Rate limit exceeded`);
        }
      } else {
        // Erreurs non récupérables (ex: 400 Bad Request, 403 Forbidden) -> on lève immédiatement
        throw new Error(`HTTP ${response.status}: ${response.statusText || 'Bad Request'}`);
      }
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      console.warn(`[Gemini API] Tentative ${attempt} échouée: ${error.message}. Réessai dans ${delay}ms...`);
      await wait(delay);
      delay *= 2;
    }
  }
}

/**
 * Appelle l'API Gemini de manière résiliente avec fallback automatique.
 * @param {Array} contents Contenu de la requête (structure Gemini avec parts, text/inlineData)
 * @param {string} apiKey Clé API Gemini
 * @param {Object} [generationConfig={}] Configuration optionnelle de génération
 * @returns {Promise<Object>} Réponse JSON décodée de l'API
 */
export const generateGeminiContent = async (contents, apiKey, generationConfig = {}) => {
  const models = ['gemini-2.5-flash', 'gemini-1.5-flash'];
  let lastError = null;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const isFallback = i > 0;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const requestBody = {
      contents,
      generationConfig
    };

    try {
      if (isFallback) {
        console.warn(`[Gemini API] Bascule sur le modèle de secours : ${model}`);
      }
      
      const response = await fetchWithRetry(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      return await response.json();
    } catch (error) {
      lastError = error;
      console.error(`[Gemini API] Erreur rencontrée avec le modèle ${model}:`, error);

      // Critères de bascule : Erreur réseau ou erreurs de quota/service (429, 500, 503)
      const isFallbackTrigger =
        error.message.includes('429') ||
        error.message.includes('500') ||
        error.message.includes('503') ||
        !error.message.includes('HTTP'); // Erreur réseau (ex: TypeError: Failed to fetch)

      if (!isFallback && isFallbackTrigger) {
        console.warn(`[Gemini API] Modèle principal ${model} indisponible (${error.message}). Passage au modèle de secours...`);
        continue;
      }

      // Si c'est une erreur 400 (mauvais prompt), 403 (clé invalide), ou si on a déjà échoué sur le modèle de secours.
      throw error;
    }
  }

  throw lastError || new Error("Échec de l'appel Gemini API");
};
