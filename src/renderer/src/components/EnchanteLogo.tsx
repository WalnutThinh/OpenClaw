import logoSrc from '../assets/openclaw-color.svg'

interface Props {
  state?: 'idle' | 'loading' | 'success' | 'error'
  size?: number
}

export default function EnchanteLogo({ state = 'idle', size = 44 }: Props): React.JSX.Element {
  const ringColor =
    state === 'success'
      ? 'border-success/60'
      : state === 'loading'
        ? 'border-warning/60'
        : state === 'error'
          ? 'border-error/60'
          : 'border-primary/35'
  const animClass = state === 'loading' ? 'animate-spin' : ''

  return (
    <div
      className={`rounded-full border-2 ${ringColor} ${animClass} flex items-center justify-center bg-black/50 backdrop-blur-sm`}
      style={{ width: size, height: size }}
    >
      <img
        src={logoSrc}
        alt="OpenClaw"
        style={{ width: size * 0.6, height: size * 0.6 }}
        className="object-contain"
      />
    </div>
  )
}
