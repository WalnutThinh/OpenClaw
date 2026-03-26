/** Subtle blinking dots on pure black — replaces floating orange bubbles */
export default function TwinkleDots(): React.JSX.Element {
  const dots = Array.from({ length: 48 }, (_, i) => ({
    id: i,
    left: `${(i * 7.3) % 100}%`,
    top: `${(i * 11.7) % 100}%`,
    delay: `${(i * 0.17) % 4}s`,
    duration: `${1.8 + (i % 5) * 0.35}s`,
    size: 2 + (i % 3)
  }))

  return (
    <div className="twinkle-layer" aria-hidden>
      {dots.map((d) => (
        <span
          key={d.id}
          className="twinkle-dot"
          style={{
            left: d.left,
            top: d.top,
            animationDelay: d.delay,
            animationDuration: d.duration,
            width: d.size,
            height: d.size
          }}
        />
      ))}
    </div>
  )
}
