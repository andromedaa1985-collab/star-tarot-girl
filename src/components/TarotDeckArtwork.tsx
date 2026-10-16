import { useId } from 'react';
import { TAROT_CARDS, TAROT_CARD_BACK, resolveTarotArtwork } from '../lib/tarotDeck';

/** A static display of the actual deck; no separate decorative bitmap variants. */
export default function TarotDeckArtwork({ className }: { className?: string }) {
  const id = `tarot-atmosphere-${useId().replace(/:/g, '')}`;
  const paint = (name: string) => `url(#${id}-${name})`;
  return <svg aria-hidden="true" focusable="false" className={className} viewBox="0 0 500 300" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id={`${id}-edge`} x1="0" y1="0" x2="150" y2="226" gradientUnits="userSpaceOnUse"><stop stopColor="#F2F7FB" stopOpacity=".8" /><stop offset=".5" stopColor="#8AA4B6" stopOpacity=".15" /><stop offset="1" stopColor="#CBD9E0" stopOpacity=".6" /></linearGradient>
      <linearGradient id={`${id}-reflection`} x1="0" y1="0" x2="150" y2="226" gradientUnits="userSpaceOnUse"><stop stopColor="white" stopOpacity=".13" /><stop offset=".5" stopColor="white" stopOpacity="0" /></linearGradient>
      <radialGradient id={`${id}-ground`}><stop stopColor="#03080C" stopOpacity=".7" /><stop offset="1" stopColor="#03080C" stopOpacity="0" /></radialGradient>
      <filter id={`${id}-shadow`} x="-40%" y="-30%" width="180%" height="180%"><feDropShadow dx="4" dy="12" stdDeviation="9" floodColor="#020509" floodOpacity=".5" /></filter>
      <clipPath id={`${id}-back-clip`}><rect width="138" height="210" rx="15" /></clipPath>
      <clipPath id={`${id}-front-clip`}><rect width="152" height="228" rx="16" /></clipPath>
    </defs>
    <ellipse cx="244" cy="268" rx="175" ry="27" fill={paint('ground')} />
    <g transform="translate(100 57) rotate(-21 69 105)" filter={paint('shadow')}>
      <image href={resolveTarotArtwork(TAROT_CARD_BACK, 640)} width="138" height="210" preserveAspectRatio="xMidYMid slice" clipPath={paint('back-clip')} />
      <rect x=".5" y=".5" width="137" height="209" rx="15" stroke={paint('edge')} />
    </g>
    <g transform="translate(264 48) rotate(17 69 105)" filter={paint('shadow')}>
      <image href={resolveTarotArtwork(TAROT_CARDS[8].image, 640)} width="138" height="210" preserveAspectRatio="xMidYMid slice" clipPath={paint('back-clip')} />
      <rect x=".5" y=".5" width="137" height="209" rx="15" stroke={paint('edge')} />
    </g>
    <g transform="translate(168 22) rotate(-6 76 114)" filter={paint('shadow')}>
      <image href={resolveTarotArtwork(TAROT_CARDS[17].image, 640)} width="152" height="228" preserveAspectRatio="xMidYMid slice" clipPath={paint('front-clip')} />
      <rect width="152" height="228" rx="16" fill={paint('reflection')} />
      <rect x=".5" y=".5" width="151" height="227" rx="16" stroke={paint('edge')} />
    </g>
  </svg>;
}
