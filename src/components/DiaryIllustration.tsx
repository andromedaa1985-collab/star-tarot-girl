import { useId } from 'react';

/** A quiet glass journal illustration; decorative, so it stays out of the reading order. */
export default function DiaryIllustration() {
  const id = useId();

  return (
    <svg viewBox="0 0 300 230" fill="none" aria-hidden="true" focusable="false" className="h-auto w-full">
      <defs>
        <radialGradient id={`${id}-glow`}>
          <stop stopColor="#AFC3B8" stopOpacity=".3" />
          <stop offset="1" stopColor="#AFC3B8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-glass`} x1="82" y1="42" x2="222" y2="205" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F4F6F1" stopOpacity=".42" />
          <stop offset=".45" stopColor="#DDE4DE" stopOpacity=".12" />
          <stop offset="1" stopColor="#BACBC0" stopOpacity=".24" />
        </linearGradient>
        <linearGradient id={`${id}-edge`} x1="93" y1="37" x2="202" y2="200" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" stopOpacity=".82" />
          <stop offset=".55" stopColor="white" stopOpacity=".12" />
          <stop offset="1" stopColor="white" stopOpacity=".5" />
        </linearGradient>
        <linearGradient id={`${id}-moon`} x1="132" y1="75" x2="172" y2="115" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F2EFE0" />
          <stop offset="1" stopColor="#BAC4BA" />
        </linearGradient>
      </defs>
      <ellipse cx="151" cy="126" rx="147" ry="101" fill={`url(#${id}-glow)`} />
      <ellipse cx="148" cy="126" rx="125" ry="54" transform="rotate(-27 148 126)" stroke="#DAE3DB" strokeOpacity=".19" />
      <ellipse cx="153" cy="185" rx="77" ry="12" fill="#060A09" fillOpacity=".2" />
      <g transform="rotate(10 154 119)">
        <rect x="107" y="39" width="112" height="154" rx="17" fill="#E1E7DE" fillOpacity=".07" stroke="#F0F4ED" strokeOpacity=".18" />
      </g>
      <g transform="rotate(-10 147 121)">
        <rect x="91" y="41" width="112" height="158" rx="17" fill={`url(#${id}-glass)`} stroke={`url(#${id}-edge)`} />
        <path d="M106 44V195" stroke="#EFF3EC" strokeOpacity=".24" />
        <path d="M112 48H185C192 48 196 52 196 59V179" stroke="white" strokeOpacity=".17" strokeLinecap="round" />
        <circle cx="153" cy="95" r="23" stroke="#EEF0E4" strokeOpacity=".22" />
        <path d="M161 76C155 79 151 86 151 93C151 101 156 108 163 111C158 114 151 114 145 111C137 107 133 97 136 89C139 80 150 75 161 76Z" fill={`url(#${id}-moon)`} />
        <path d="M124 139H178M124 149H169M124 159H177" stroke="#EEF3EB" strokeOpacity=".46" strokeLinecap="round" />
        <path d="M124 174H149" stroke="#EEF3EB" strokeOpacity=".22" strokeLinecap="round" />
      </g>
      <circle cx="247" cy="77" r="3" fill="#DDE6DB" />
      <circle cx="39" cy="159" r="2" fill="#DDE6DB" fillOpacity=".6" />
      <path d="M226 142V154M220 148H232" stroke="#EFF2E9" strokeOpacity=".68" strokeLinecap="round" />
    </svg>
  );
}
