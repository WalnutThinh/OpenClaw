import markSrc from '../assets/eclaw-mark.png'

/**
 * Compact logo + wordmark for the wizard header (below window chrome, above step dots).
 */
export default function OpenClawHeaderBrand(): React.JSX.Element {
  return (
    <div
      className="flex flex-row flex-wrap items-center justify-center gap-2.5 sm:gap-3"
      aria-label="EClaw"
    >
      <img
        src={markSrc}
        alt=""
        className="h-9 w-9 shrink-0 object-contain sm:h-10 sm:w-10"
        aria-hidden
      />
      <span className="select-none text-lg font-semibold tracking-tight text-white/95 sm:text-xl">
        EClaw
      </span>
    </div>
  )
}
