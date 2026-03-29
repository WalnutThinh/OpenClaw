import markSrc from '../assets/openclaw-dark.svg'
import textSrc from '../assets/openclaw-text.svg'

/**
 * Center hero: OpenClaw mark + wordmark (wordmark inverted for dark UI).
 */
export default function OpenClawBrandCenter(): React.JSX.Element {
  return (
    <div className="flex flex-row flex-wrap items-center justify-center gap-4 sm:gap-5">
      <img
        src={markSrc}
        alt=""
        className="h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem] shrink-0 object-contain"
        aria-hidden
      />
      <img
        src={textSrc}
        alt="OpenClaw"
        className="h-7 max-w-[min(100%,220px)] object-contain object-left opacity-95 invert brightness-0 sm:h-8"
      />
    </div>
  )
}
