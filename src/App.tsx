import { Component } from '@geastack/core'
import { english, finnish, german } from './messages'
import { canMove, closesAt, cost, limit, rows, stationBit } from './game'
import { game } from './store'
import './style.css'

const board = rows.map(row => row.split(''))

export class App extends Component {
  template() {
    const t = game.language === 'fi' ? finnish : game.language === 'de' ? german : english
    const latestStation = game.latest === 1 ? t.a : game.latest === 2 ? t.b : t.c
    const message = game.count === 3 ? t.won + game.elapsed
      : game.finished ? t.lost + game.count
      : game.latest !== 0 ? t.deliveredTo + latestStation
      : game.elapsed === 0 ? t.intro : t.moved + game.elapsed

    return (
      <div class="game-screen">
        <div class="page">
          <div class="header">
            <div class="languages">
              <button class={game.language === 'en' ? 'active' : ''} onClick={() => game.setLanguage('en')}>English</button>
              <button class={game.language === 'fi' ? 'active' : ''} onClick={() => game.setLanguage('fi')}>Suomi</button>
              <button class={game.language === 'de' ? 'active' : ''} onClick={() => game.setLanguage('de')}>Deutsch</button>
            </div>
            <div class="season">{t.season}</div>
            <h1 class="title">{t.title}</h1>
            <div class="mission">{t.mission}</div>
          </div>
          <div class="metrics">
            <div><strong>{limit - game.elapsed} {t.hour}</strong><span>{t.time}</span></div>
            <div><strong>{game.count} / 3</strong><span>{t.mail}</span></div>
          </div>
          <div class="board" role="group" aria-label={t.map}>
            {board.map((row, ny) => (
              <div class="row">
                {row.map((tile, nx) => {
                  const bit = stationBit(tile)
                  const gate = closesAt(tile)
                  const closed = gate !== 0 && game.elapsed >= gate
                  const here = game.x === nx && game.y === ny
                  const reachable = !game.finished && canMove(game.x, game.y, game.elapsed, nx, ny)
                  const complete = (game.delivered & bit) !== 0
                  const terrain = tile === '#' ? 'rock' : tile === 's' ? 'deep' : bit !== 0 ? 'station' : closed ? 'closed' : gate !== 0 ? 'gate' : ''
                  const name = here ? t.courier : bit === 1 ? t.a : bit === 2 ? t.b : bit === 4 ? t.c
                    : closed ? t.blocked : gate !== 0 ? t.closes + gate : tile === '#' ? t.rock : tile === 's' ? t.snow : t.trail
                  const marker = here ? 'courier' : bit !== 0 ? (complete ? 'delivered' : 'mail')
                    : closed ? 'blocked' : tile === '#' ? 'peak' : ''
                  const deadline = !here && !closed && gate !== 0 ? String(gate) : ''
                  return (
                    <button class={'cell ' + terrain + (here ? ' player' : '') + (reachable ? ' reachable' : '')}
                      aria-label={name} onClick={() => game.move(nx, ny)}>
                      <span class={'marker ' + marker}></span>
                      <span class="deadline">{deadline}</span>
                      <span class="cost">{reachable ? cost(tile) + t.hour : ''}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
          <div class="legend">
            <span class="legend-item"><span class="marker courier"></span> {t.courier}</span>
            <span class="legend-item"><span class="marker mail"></span> {t.station}</span>
            <span class="legend-item"><span class="marker delivered"></span> {t.delivered}</span>
            <span class="legend-item"><span class="marker snow"></span> {t.snow} (2 {t.hour})</span>
            <span class="legend-item"><span class="marker blocked"></span> {t.blocked}</span>
            <span class="legend-item"><span class="gate-key">4</span> {t.closes}4</span>
          </div>
          <p class="status" role="status">{message}</p>
          <button class="reset" onClick={() => game.reset()}>{t.reset}</button>
        </div>
        </div>
    )
  }
}
