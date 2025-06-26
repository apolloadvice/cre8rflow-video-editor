/**
 * Viral Caption Generation Utility
 * 
 * Provides functions for generating viral-style captions for video content.
 * Used by the viral caption animation system.
 */

const viralCaptions = [
  "Wait for it...",
  "This changes everything",
  "Plot twist incoming",
  "You won't believe this",
  "This is incredible",
  "Mind = blown",
  "Game changer alert",
  "This hits different",
  "Absolutely unreal", 
  "Peak performance",
  "This is why we watch",
  "Legendary moment",
  "Pure chaos energy",
  "This escalated quickly",
  "Unexpected turn",
  "Classic moment",
  "This is peak content",
  "Absolutely iconic",
  "This delivery though",
  "Perfect timing"
];

/**
 * Generate a random viral caption based on index
 * @param index - The index position (cycles through available captions)
 * @returns A viral-style caption string
 */
export const generateRandomCaption = (index: number): string => {
  return viralCaptions[index % viralCaptions.length];
};

/**
 * Generate multiple captions for a sequence
 * @param count - Number of captions to generate
 * @param startIndex - Starting index (optional, defaults to random)
 * @returns Array of caption strings
 */
export const generateCaptionSequence = (count: number, startIndex?: number): string[] => {
  const start = startIndex !== undefined ? startIndex : Math.floor(Math.random() * viralCaptions.length);
  const captions: string[] = [];
  
  for (let i = 0; i < count; i++) {
    captions.push(generateRandomCaption(start + i));
  }
  
  return captions;
};

/**
 * Get a truly random caption (not sequential)
 * @returns A random viral caption
 */
export const getRandomCaption = (): string => {
  const randomIndex = Math.floor(Math.random() * viralCaptions.length);
  return viralCaptions[randomIndex];
};

/**
 * Get all available viral captions
 * @returns Array of all viral caption strings
 */
export const getAllViralCaptions = (): string[] => {
  return [...viralCaptions];
};

/**
 * Get caption count
 * @returns Total number of available captions
 */
export const getViralCaptionCount = (): number => {
  return viralCaptions.length;
}; 