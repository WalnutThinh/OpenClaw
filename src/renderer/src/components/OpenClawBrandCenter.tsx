import markSrc from '../assets/eclaw-mark.png'

/**
 * Center hero: logo + EClaw wordmark for dark UI.
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
      <span className="select-none text-2xl font-semibold tracking-tight text-white/95 sm:text-3xl">
        EClaw
      </span>
    </div>
  )
}
