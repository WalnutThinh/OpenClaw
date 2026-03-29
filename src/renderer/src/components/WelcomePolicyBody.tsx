/** Full policy copy for the in-app welcome step (scroll panel). Legal text should be reviewed before release. */
export default function WelcomePolicyBody(): React.JSX.Element {
  const p = 'mb-2.5 text-left text-[11px] leading-snug text-text-muted last:mb-0 sm:text-xs'
  return (
    <div className="text-text-muted">
      <p className={p}>
        <strong className="text-text-muted">OpenClaw — terms &amp; user information</strong>
      </p>
      <p className={p}>
        By using OpenClaw you confirm you use this software lawfully, keep your credentials secure, and accept that
        the software is provided “as is” without warranties beyond applicable law.
      </p>
      <p className={p}>
        <strong className="text-text-muted">Privacy.</strong> The app may contact configured services (e.g. AI
        providers, messaging platforms) using settings you provide. Third-party services have their own policies.
      </p>
      <p className={p}>
        <strong className="text-text-muted">Updates.</strong> New versions may be distributed separately. You may
        remove the app by deleting its files and any shortcuts you created.
      </p>
      <p className={p}>
        <strong className="text-text-muted">Liability.</strong> To the maximum extent permitted by law, Enchante
        Direction and contributors are not liable for indirect damages or data loss from use or inability to use the
        software.
      </p>
      <p className={p}>If you do not agree, do not continue.</p>
    </div>
  )
}
