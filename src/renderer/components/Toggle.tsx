export const Toggle = ({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) => (
   <button aria-pressed={checked} className={`toggleControl${checked ? " toggleControl--on" : ""}`} onClick={() => onChange(!checked)} type="button">
      <span className="toggleControl__track">
         <span />
      </span>
      <span>{label}</span>
   </button>
);
