import inspect from '@extra-lang/inspect'
import WebSocket from 'ws'

type ConsoleMethod = 'log' | 'info' | 'warn' | 'error' | 'debug'

export class Socky {
  private originalConsole: {
    log: typeof console.log
    info: typeof console.info
    warn: typeof console.warn
    error: typeof console.error
    debug: typeof console.debug
  } | null = null
  private server: WebSocket.Server | null = null
  private connections: WebSocket[] = []
  private port: number
  private connectionResolver?: ReturnType<typeof Promise.withResolvers<void>>

  constructor(port = 8080) {
    this.port = port
  }

  async firstConnection() {
    if (this.connectionResolver) {
      // If already connecting, return the existing promise
      return this.connectionResolver.promise
    }

    const {promise, resolve, reject} = Promise.withResolvers<void>()
    this.connectionResolver = {promise, resolve, reject}
    return promise
  }

  start() {
    if (this.originalConsole) {
      this.stop()
    }

    this.originalConsole = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
    }

    this.server = new WebSocket.Server({port: this.port})
    this.server.on('error', err => {
      this.connectionResolver?.reject(err)
    })

    this.server.on('connection', ws => {
      this.connectionResolver?.resolve()
      this.connections.push(ws)

      ws.on('close', () => {
        this.connections = this.connections.filter(conn => conn !== ws)
      })
    })

    console.log = (...args) => {
      this.broadcast('log', args)
    }

    console.info = (...args) => {
      this.broadcast('info', args)
    }

    console.warn = (...args) => {
      this.broadcast('warn', args)
    }

    console.error = (...args) => {
      this.broadcast('error', args)
    }

    console.debug = (...args) => {
      this.broadcast('debug', args)
    }

    return this
  }

  stop() {
    if (!this.originalConsole) {
      return
    }

    // Restore original console methods
    console.log = this.originalConsole.log
    console.info = this.originalConsole.info
    console.warn = this.originalConsole.warn
    console.error = this.originalConsole.error
    console.debug = this.originalConsole.debug

    // Close all connections
    this.connections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close()
      }
    })

    // Close the server
    this.server?.close()
    this.server = null
    this.connections = []
    this.connectionResolver = undefined
    this.originalConsole = null
  }

  private broadcast(type: ConsoleMethod, args: any[]) {
    if (!this.connections.length) {
      this.originalConsole?.[type](...args)
      return
    }

    // Convert arguments to JSON-friendly format
    const serializedArgs = args.map(arg => inspect(arg))

    const message = JSON.stringify({
      type,
      timestamp: new Date().toISOString(),
      args: serializedArgs,
    })

    this.connections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message)
      }
    })
  }
}
