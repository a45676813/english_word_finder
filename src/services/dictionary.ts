export interface DictionaryEntry {
  phonetics: {
    text?: string;
    audio?: string;
  }[];
}

export async function getDictionaryData(word: string): Promise<DictionaryEntry | null> {
  const cacheKey = `dict_data_${word.toLowerCase().trim()}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {
      localStorage.removeItem(cacheKey);
    }
  }

  try {
    const response = await fetch(`/api/dictionary?word=${encodeURIComponent(word)}`);
    if (!response.ok) return null;
    const data = await response.json();
    const result = data[0];
    localStorage.setItem(cacheKey, JSON.stringify(result));
    return result;
  } catch (error) {
    console.error("Error fetching dictionary data:", error);
    return null;
  }
}
