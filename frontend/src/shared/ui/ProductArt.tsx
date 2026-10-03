/** Product Art: Presentational icons and catalogue artwork with explicit inputs.. */
export default function ProductArt({ id }: { id: string }) {
  return (
    <svg viewBox="0 0 300 230" aria-label={id} role="img">
      <ellipse cx="154" cy="198" rx="97" ry="12" fill="#000" opacity=".07" />
      {id === "lamp" ? (
        <g stroke="#393d36" fill="none" strokeWidth="9" strokeLinecap="round">
          <path d="M105 192h95M153 189v-98l52-29" />
          <path d="M206 40l-29 42h69z" fill="#c4a57a" stroke="#c4a57a" />
        </g>
      ) : id === "chair" ? (
        <g fill="#ba9970">
          <rect x="102" y="58" width="96" height="75" rx="18" fill="#d7cfbc" />
          <path d="M91 132h115v19H91zM98 146h9v54h-9zM191 146h9v54h-9z" />
          <path d="M97 70h9v68h-9zM192 70h9v68h-9z" />
        </g>
      ) : id === "desk" ? (
        <g fill="#ac875d">
          <path d="M47 108h215v18H47zM57 126h12v75H57zM237 126h12v75h-12z" />
          <rect x="78" y="128" width="58" height="24" rx="2" fill="#cfb393" />
        </g>
      ) : id === "mug" ? (
        <g fill="#b57858">
          <path d="M101 95h87v82q-43 37-87 0z" />
          <ellipse cx="144" cy="96" rx="43" ry="12" fill="#e3c9ad" />
          <path
            d="M187 111q57-5 44 38q-11 26-43 16"
            fill="none"
            stroke="#b57858"
            strokeWidth="14"
          />
        </g>
      ) : id === "notebook" ? (
        <g transform="rotate(-12 150 130)">
          <rect x="95" y="66" width="112" height="129" rx="4" fill="#65816c" />
          <path d="M109 68v125" stroke="#dae3d0" strokeWidth="2" />
          <text x="129" y="110" fill="#efead8" fontSize="12" letterSpacing="3">
            FIELD
          </text>
          <text x="129" y="129" fill="#efead8" fontSize="12" letterSpacing="3">
            NOTES
          </text>
        </g>
      ) : (
        <g fill="#b4926b">
          <path d="M68 58h13v140H68zM220 58h13v140h-13zM72 87h153v12H72zM72 135h153v12H72zM72 183h153v12H72z" />
          <rect x="92" y="102" width="33" height="32" fill="#9caaa0" />
          <rect x="167" y="62" width="32" height="24" fill="#cfa787" />
        </g>
      )}
    </svg>
  );
}
