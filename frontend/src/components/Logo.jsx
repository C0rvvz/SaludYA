export default function Logo({ size = "md" }) {
  const dims = size === "sm" ? 30 : 36;

  return (
    <span className={`logo logo--${size}`}>
      <span className="logo__mark" style={{ width: dims, height: dims }}>
        <svg viewBox="0 0 24 24" width="60%" height="60%" fill="none">
          <path
            d="M2 12h4l2-7 4 14 2-7h8"
            stroke="white"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="logo__text">
        Salud<span className="logo__accent">YA</span>
      </span>
    </span>
  );
}
