import { Component, type GeaElement } from '@geastack/core'
import { english, finnish, german } from './messages'
import { canMove, closesAt, cost, limit, rows, stationBit } from './game'
import { game } from './store'
import './style.css'

const board = rows.map(row => row.split(''))

function msg(language: string) {
  return language === 'fi' ? finnish : language === 'de' ? german : english
}

function statusMessage(language: string, count: number, finished: boolean, latest: number, elapsed: number) {
  const t = msg(language)
  const latestStation = latest === 1 ? t.a : latest === 2 ? t.b : t.c
  return count === 3 ? t.won + elapsed
    : finished ? t.lost + count
    : latest !== 0 ? t.deliveredTo + latestStation
    : elapsed === 0 ? t.intro : t.moved + elapsed
}

type MapCellProps = { tile: string; nx: number; ny: number }

class MapCell extends Component<GeaElement, MapCellProps> {
  template({ tile, nx, ny }: MapCellProps) {
    const bit = stationBit(tile)
    const gate = closesAt(tile)
    // Keep store reads in JSX so the native compiler tracks cell and language updates.
    return (
      <button class={'cell ' + (tile === '#' ? 'rock' : tile === 's' ? 'deep' : bit !== 0 ? 'station' : (gate !== 0 && game.elapsed >= gate) ? 'closed' : gate !== 0 ? 'gate' : '') + ((game.x === nx && game.y === ny) ? ' player' : '') + ((!game.finished && canMove(game.x, game.y, game.elapsed, nx, ny)) ? ' reachable' : '')}
        aria-label={((game.x === nx && game.y === ny) ? msg(game.language).courier : bit === 1 ? msg(game.language).a : bit === 2 ? msg(game.language).b : bit === 4 ? msg(game.language).c
      : (gate !== 0 && game.elapsed >= gate) ? msg(game.language).blocked : gate !== 0 ? msg(game.language).closes + gate : tile === '#' ? msg(game.language).rock : tile === 's' ? msg(game.language).snow : msg(game.language).trail)} onClick={() => game.move(nx, ny)}>
        <span class={'marker ' + ((game.x === nx && game.y === ny) ? 'courier' : bit !== 0 ? (((game.delivered & bit) !== 0) ? 'delivered' : 'mail')
      : (gate !== 0 && game.elapsed >= gate) ? 'blocked' : tile === '#' ? 'peak' : '')}></span>
        <span class="deadline">{(!(game.x === nx && game.y === ny) && !(gate !== 0 && game.elapsed >= gate) && gate !== 0 ? String(gate) : '')}</span>
        <span class="cost">{(!game.finished && canMove(game.x, game.y, game.elapsed, nx, ny)) ? cost(tile) + msg(game.language).hour : ''}</span>
      </button>
    )
  }
}

export class App extends Component {
  template() {
    // Keep game.language reads directly in JSX so the native compiler subscribes every label.
    return (
      <div class="game-screen">
        <div class="page">
          <div class="header">
            <div class="languages">
              <button class={game.language === 'en' ? 'active' : ''} onClick={() => game.setLanguage('en')}>English</button>
              <button class={game.language === 'fi' ? 'active' : ''} onClick={() => game.setLanguage('fi')}>Suomi</button>
              <button class={game.language === 'de' ? 'active' : ''} onClick={() => game.setLanguage('de')}>Deutsch</button>
            </div>
            <div class="season">{msg(game.language).season}</div>
            <h1 class="title">{msg(game.language).title}</h1>
            <div class="mission">{msg(game.language).mission}</div>
          </div>
          <div class="metrics">
            <div><strong>{(limit - game.elapsed) + ' ' + msg(game.language).hour}</strong><span>{msg(game.language).time}</span></div>
            <div><strong>{game.count + ' / 3'}</strong><span>{msg(game.language).mail}</span></div>
          </div>
          <div class="board" role="group" aria-label={msg(game.language).map}>
            {board.map((row, ny) => (
              <div class="row">
                {row.map((tile, nx) => <MapCell tile={tile} nx={nx} ny={ny} />)}
              </div>
            ))}
          </div>
          <div class="legend">
            <span class="legend-item"><span class="marker courier"></span>{msg(game.language).courier}</span>
            <span class="legend-item"><span class="marker mail"></span>{msg(game.language).station}</span>
            <span class="legend-item"><span class="marker delivered"></span>{msg(game.language).delivered}</span>
            <span class="legend-item"><span class="marker snow"></span>{msg(game.language).snow + ' (2 ' + msg(game.language).hour + ')'}</span>
            <span class="legend-item"><span class="marker blocked"></span>{msg(game.language).blocked}</span>
            <span class="legend-item"><span class="gate-key">4</span>{msg(game.language).closes + '4'}</span>
          </div>
          <p class="status" role="status">{statusMessage(game.language, game.count, game.finished, game.latest, game.elapsed)}</p>
          <button class="reset" onClick={() => game.reset()}>{msg(game.language).reset}</button>
        </div>
      </div>
    )
  }
}
