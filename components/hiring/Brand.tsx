// Shared top-left brand mark: the Lightsprint icon + wordmark. Used by the board
// and settings top bars so they stay consistent. Plain (non-client) component —
// just markup — safe to render inside the client shells.

export default function Brand({ subtitle }: { subtitle: string }) {
  return (
    <div className="brand">
      <img
        className="logo"
        src="/lightsprint-icon.svg"
        alt="Lightsprint"
        width={22}
        height={22}
      />
      Hiring <small>{subtitle}</small>
    </div>
  );
}
