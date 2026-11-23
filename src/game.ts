export const rows = [
  '##...##',
  '#.C.s.#',
  '#s....#',
  '#.#qB.#',
  '#..s#.#',
  '#.Ap..#',
  '##.K.##'
]
export const limit = 12

export function stationBit(tile: string): number {
  if (tile === 'A') return 1
  if (tile === 'B') return 2
  if (tile === 'C') return 4
  return 0
}

export function closesAt(tile: string): number {
  if (tile === 'p') return 4
  if (tile === 'q') return 7
  return 0
}

export function cost(tile: string): number {
  return tile === 's' ? 2 : 1
}

export function canMove(x: number, y: number, elapsed: number, nx: number, ny: number): boolean {
  if (nx < 0 || nx >= 7 || ny < 0 || ny >= 7 || Math.abs(nx - x) + Math.abs(ny - y) !== 1) return false
  const tile = rows[ny][nx]
  const arrival = elapsed + cost(tile)
  const deadline = closesAt(tile)
  return tile !== '#' && arrival <= limit && (deadline === 0 || arrival < deadline)
}

export function hasMoves(x: number, y: number, elapsed: number): boolean {
  return canMove(x, y, elapsed, x - 1, y) || canMove(x, y, elapsed, x + 1, y)
    || canMove(x, y, elapsed, x, y - 1) || canMove(x, y, elapsed, x, y + 1)
}
