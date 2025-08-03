const ids = ['1a0f', '2b1g', '3c2h', '4d3i', '5e4j', '6f5k', '7g6l', '8h7m', '9i8n']

export function uid(name: string = '') {
  const saved = ids.shift()
  const uid = saved ?? Math.floor(0x1000 + Math.random() * (0x10000 - 0x1000)).toString(16)
  return name ? `${name}-${uid}` : uid
}
