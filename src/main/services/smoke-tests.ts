export async function runSmokeTests(): Promise<
  Array<{ name: string; status: 'ok' | 'warn' | 'fail'; detail?: string }>
> {
  return []
}
