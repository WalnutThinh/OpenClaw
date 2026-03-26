/** Gmail / Google SMTP: 2FA accounts need an App Password, not the normal login password */
export function smtpErrorUserHint(raw: string): 'gmail_app_password' | null {
  const s = (raw ?? '').toLowerCase()
  if (
    s.includes('534') ||
    s.includes('application-specific password') ||
    s.includes('app password') ||
    s.includes('invalidsecondfactor') ||
    s.includes('5.7.9')
  ) {
    return 'gmail_app_password'
  }
  return null
}
