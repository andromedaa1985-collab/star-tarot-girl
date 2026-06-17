export const DEEPSEEK_TEXT_MODEL = 'deepseek-v4-pro';
export const DEEPSEEK_TAROT_FAST_MODEL = 'deepseek-v4-flash';
export const DEEPSEEK_TAROT_DEEP_MODEL = 'deepseek-v4-pro';

export const DEEPSEEK_MAX_TOKENS = {
  tarotDaily: 760,
  tarotGeneral: 460,
  dailyDeep: 1400,
  guardianLetter: 360,
  guardianChat: 420,
  diaryReview: 760,
  baziCalculation: 1400,
  baziChat: 900,
  simulator: 1100,
} as const;
