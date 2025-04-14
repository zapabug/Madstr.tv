/**
 * Shuffles an array in place using the Fisher-Yates (aka Knuth) algorithm.
 * Then returns a new array (copy) with the shuffled items.
 * @param array The array to shuffle.
 * @returns A new array containing the shuffled elements.
 */
export function shuffleArray<T>(array: T[]): T[] {
  // Create a copy to avoid modifying the original array directly if passed by reference elsewhere
  const shuffled = [...array];
  let currentIndex = shuffled.length;
  let randomIndex;

  // While there remain elements to shuffle.
  while (currentIndex !== 0) {
    // Pick a remaining element.
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [shuffled[currentIndex], shuffled[randomIndex]] = [
      shuffled[randomIndex], shuffled[currentIndex]];
  }

  return shuffled;
} 