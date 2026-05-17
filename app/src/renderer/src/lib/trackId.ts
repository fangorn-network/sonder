export async function computeTrackId(artist: string, title: string): Promise<string> {
  const input = new TextEncoder().encode(`${artist}:${title}`)
  const hashBuffer = await crypto.subtle.digest('SHA-256', input)
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return hashHex.slice(0, 24)
}