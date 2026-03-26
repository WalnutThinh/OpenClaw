import colorSrc from '../assets/openclaw-color.svg'
import textSrc from '../assets/openclaw-text.svg'

/**
 * Compact OpenClaw mark + wordmark for the wizard header (below window chrome, above step dots).
 */
export default function OpenClawHeaderBrand(): React.JSX.Element {
  return (
    <div
      className="flex flex-row flex-wrap items-center justify-center gap-2.5 sm:gap-3"
      aria-label="OpenClaw"
    >
      <img
        src={colorSrc}
        alt=""
        className="h-9 w-9 shrink-0 object-contain sm:h-10 sm:w-10"
        aria-hidden
      />
      <img
        src={textSrc}
        alt="OpenClaw"
        className="h-5 w-auto max-w-[min(100%,200px)] object-contain object-left brightness-0 invert opacity-95 sm:h-6"
      />
    </div>
  )
}
