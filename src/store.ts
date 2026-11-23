import { Store } from '@geajs/core'
import { canMove, cost, hasMoves, rows, stationBit } from './game'

class GameStore extends Store {
  language = 'en'
  x = 3
  y = 6
  elapsed = 0
  delivered = 0
  count = 0
  latest = 0
  finished = false

  setLanguage(code: string) {
    this.language = code
  }

  reset() {
    this.x = 3
    this.y = 6
    this.elapsed = 0
    this.delivered = 0
    this.count = 0
    this.latest = 0
    this.finished = false
  }

  move(nx: number, ny: number) {
    if (this.finished || !canMove(this.x, this.y, this.elapsed, nx, ny)) return
    const tile = rows[ny][nx]
    const bit = stationBit(tile)
    this.elapsed += cost(tile)
    this.x = nx
    this.y = ny
    this.latest = 0
    if (bit !== 0 && (this.delivered & bit) === 0) {
      this.delivered |= bit
      this.count += 1
      this.latest = bit
    }
    this.finished = this.count === 3 || !hasMoves(nx, ny, this.elapsed)
  }

}

export const game = new GameStore()

