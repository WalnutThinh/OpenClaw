import colorSrc from '../assets/openclaw-color.svg'
import textSrc from '../assets/openclaw-text.svg'

/**
 * Center hero: OpenClaw mark + wordmark (wordmark uses currentColor → light on dark UI).
 */
export default function OpenClawBrandCenter(): React.JSX.Element {
  return (
    <div className="flex flex-row flex-wrap items-center justify-center gap-4 sm:gap-5">
      <img
        src={colorSrc}
        alt=""
        className="h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem] object-contain shrink-0"
        aria-hidden
      />
      <img
        src={textSrc}
        alt="OpenClaw"
        className="h-7 sm:h-8 w-auto max-w-[min(100%,220px)] object-contain object-left brightness-0 invert opacity-95"
      />
    </div>
  )
}
