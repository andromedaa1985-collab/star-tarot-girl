import { useId } from 'react';

/** Decorative, static artwork; every definition is scoped to this instance. */
export default function TarotAtmosphere({ className }: { className?: string }) {
  const id = `tarot-atmosphere-${useId().replace(/:/g, '')}`;
  const paint = (name: string) => `url(#${id}-${name})`;

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      viewBox="0 0 500 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={`${id}-glass`} x1="16" y1="0" x2="142" y2="226" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E9E9E3" stopOpacity=".34" />
          <stop offset=".24" stopColor="#A9B6BC" stopOpacity=".13" />
          <stop offset=".6" stopColor="#313A43" stopOpacity=".56" />
          <stop offset="1" stopColor="#D6B9A9" stopOpacity=".22" />
        </linearGradient>
        <linearGradient id={`${id}-edge`} x1="8" y1="0" x2="136" y2="226" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" stopOpacity=".86" />
          <stop offset=".34" stopColor="#C4D5E1" stopOpacity=".26" />
          <stop offset=".69" stopColor="#E3D4C9" stopOpacity=".12" />
          <stop offset="1" stopColor="#E5C4B2" stopOpacity=".68" />
        </linearGradient>
        <linearGradient id={`${id}-silver`} x1="47" y1="64" x2="105" y2="145" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FBF9F1" />
          <stop offset=".38" stopColor="#CDD8DC" />
          <stop offset=".7" stopColor="#8F9FA8" />
          <stop offset="1" stopColor="#E6CFC0" />
        </linearGradient>
        <linearGradient id={`${id}-reflection`} x1="0" y1="0" x2="120" y2="226" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" stopOpacity=".16" />
          <stop offset=".45" stopColor="white" stopOpacity="0" />
          <stop offset="1" stopColor="white" stopOpacity=".015" />
        </linearGradient>
        <linearGradient id={`${id}-back`} x1="10" y1="0" x2="130" y2="212" gradientUnits="userSpaceOnUse">
          <stop stopColor="#B9C6CE" stopOpacity=".2" />
          <stop offset=".5" stopColor="#5D6C77" stopOpacity=".12" />
          <stop offset="1" stopColor="#84919C" stopOpacity=".22" />
        </linearGradient>
        <radialGradient id={`${id}-blue`}>
          <stop stopColor="#A8C6DB" stopOpacity=".21" />
          <stop offset="1" stopColor="#A8C6DB" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-peach`}>
          <stop stopColor="#E9BA9C" stopOpacity=".22" />
          <stop offset="1" stopColor="#E9BA9C" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-ground`}>
          <stop stopColor="#090E13" stopOpacity=".52" />
          <stop offset="1" stopColor="#090E13" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}-shadow`} x="-35%" y="-25%" width="180%" height="170%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="4" dy="12" stdDeviation="10" floodColor="#080C11" floodOpacity=".35" />
        </filter>
        <mask id={`${id}-crescent`} maskUnits="userSpaceOnUse" x="38" y="65" width="78" height="78">
          <circle cx="76" cy="104" r="36" fill="white" />
          <circle cx="91" cy="91" r="34" fill="black" />
        </mask>
        <clipPath id={`${id}-card-clip`}>
          <rect width="152" height="226" rx="18" />
        </clipPath>
      </defs>

      <ellipse cx="240" cy="267" rx="164" ry="26" fill={paint('ground')} />
      <ellipse cx="168" cy="149" rx="115" ry="125" fill={paint('blue')} />
      <ellipse cx="313" cy="181" rx="111" ry="109" fill={paint('peach')} />

      {/* Rear cards give the composition its physical depth without extra UI. */}
      <g transform="translate(100 57) rotate(-21 69 105)" filter={paint('shadow')}>
        <rect width="138" height="210" rx="17" fill="#26323C" fillOpacity=".68" />
        <rect width="138" height="210" rx="17" fill={paint('back')} stroke={paint('edge')} strokeWidth=".8" />
        <rect x="9" y="9" width="120" height="192" rx="11" stroke="#CAD8DF" strokeOpacity=".19" strokeWidth=".7" />
        <path d="M24 105H114M69 60V150" stroke="#CEDDE4" strokeOpacity=".18" strokeWidth=".6" />
        <circle cx="69" cy="105" r="35" stroke="#D3E0E5" strokeOpacity=".27" strokeWidth=".8" />
        <ellipse cx="69" cy="105" rx="19" ry="51" transform="rotate(-33 69 105)" stroke="#D3E0E5" strokeOpacity=".28" strokeWidth=".7" />
        <circle cx="69" cy="105" r="3.5" fill="#D6E5EB" fillOpacity=".72" />
        <circle cx="69" cy="35" r="2" stroke="#D3E0E5" strokeOpacity=".45" strokeWidth=".8" />
        <path d="M58 176H80M64 182H74" stroke="#D3E0E5" strokeOpacity=".3" strokeWidth=".8" strokeLinecap="round" />
      </g>

      <g transform="translate(264 48) rotate(17 69 105)" filter={paint('shadow')}>
        <rect width="138" height="210" rx="17" fill="#3D3839" fillOpacity=".64" />
        <rect width="138" height="210" rx="17" fill={paint('glass')} stroke={paint('edge')} strokeWidth=".8" />
        <rect x="9" y="9" width="120" height="192" rx="11" stroke="#E2D0C5" strokeOpacity=".22" strokeWidth=".7" />
        <circle cx="69" cy="104" r="34" stroke="#E3D3C8" strokeOpacity=".29" strokeWidth=".7" />
        <circle cx="69" cy="104" r="23" stroke="#E3D3C8" strokeOpacity=".2" strokeWidth=".7" />
        <path d="M69 53V67M69 141V155M18 104H32M106 104H120M33 68L43 78M95 130L105 140M33 140L43 130M95 78L105 68" stroke="#E9D8CC" strokeOpacity=".31" strokeWidth=".8" strokeLinecap="round" />
        <circle cx="69" cy="104" r="11" fill="#E3C9B6" fillOpacity=".16" stroke="#E9D8CC" strokeOpacity=".42" strokeWidth=".8" />
        <circle cx="69" cy="35" r="2" stroke="#E9D8CC" strokeOpacity=".45" strokeWidth=".8" />
        <path d="M58 176H80M64 182H74" stroke="#E9D8CC" strokeOpacity=".3" strokeWidth=".8" strokeLinecap="round" />
      </g>

      <g transform="translate(168 22) rotate(-6 76 113)" filter={paint('shadow')}>
        <rect x="1.5" y="2.5" width="152" height="226" rx="18" fill="#829099" fillOpacity=".26" />
        <rect width="152" height="226" rx="18" fill="#303A43" fillOpacity=".88" />
        <rect width="152" height="226" rx="18" fill={paint('glass')} />
        <g clipPath={paint('card-clip')}>
          <ellipse cx="4" cy="61" rx="100" ry="114" fill={paint('blue')} />
          <ellipse cx="143" cy="218" rx="104" ry="91" fill={paint('peach')} />
          <path d="M-12-20H82L164 243H123Z" fill={paint('reflection')} />
        </g>
        <rect x=".5" y=".5" width="151" height="225" rx="17.5" stroke={paint('edge')} />
        <rect x="10" y="10" width="132" height="206" rx="10" stroke="#E9EBE8" strokeOpacity=".29" strokeWidth=".7" />
        <path d="M19 37V25Q19 19 25 19H37M115 19H127Q133 19 133 25V37M133 189V201Q133 207 127 207H115M37 207H25Q19 207 19 201V189" stroke="#F3F1E9" strokeOpacity=".49" strokeWidth=".8" strokeLinecap="round" />

        <circle cx="76" cy="104" r="47" stroke="#DAE1E2" strokeOpacity=".22" strokeWidth=".65" />
        <path d="M76 52V57M76 151V156M24 104H29M123 104H128" stroke="#E3E8E5" strokeOpacity=".46" strokeWidth=".8" strokeLinecap="round" />
        <ellipse cx="76" cy="104" rx="59" ry="19" transform="rotate(-28 76 104)" stroke="#E4E7E3" strokeOpacity=".34" strokeWidth=".7" />
        <circle cx="76" cy="104" r="36" fill={paint('silver')} mask={paint('crescent')} />
        <path d="M51 90C45 111 59 132 79 136" stroke="#F6F5ED" strokeOpacity=".59" strokeWidth=".8" strokeLinecap="round" />
        <circle cx="126" cy="76" r="2.5" fill="#D9E4E9" />
        <circle cx="25" cy="132" r="1.5" fill="#D8C1B0" />
        <path d="M101 75L103 82L110 84L103 86L101 93L99 86L92 84L99 82Z" fill="#EEEDE5" fillOpacity=".84" />
        <path d="M61 41V47M58 44H64M111 135V140M108.5 137.5H113.5" stroke="#DFE7E7" strokeOpacity=".61" strokeWidth=".75" strokeLinecap="round" />
        <circle cx="76" cy="31" r="2.5" stroke="#E1E8E8" strokeOpacity=".66" strokeWidth=".75" />
        <path d="M76 167V178M61 173H68M84 173H91" stroke="#E1E1D8" strokeOpacity=".48" strokeWidth=".75" strokeLinecap="round" />
        <path d="M52 190H100M64 196H88" stroke="#E1E1D8" strokeOpacity=".39" strokeWidth=".75" strokeLinecap="round" />
        <path d="M17 2H72" stroke="white" strokeOpacity=".46" strokeWidth=".8" strokeLinecap="round" />
      </g>
    </svg>
  );
}
