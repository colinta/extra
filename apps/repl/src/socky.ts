import WebSocket from 'ws'

export type Serial =
  | {type: 'undefined'}
  | {type: 'null'; value: null}
  | {type: 'number'; value: number}
  | {type: 'string'; value: string}
  | {type: 'boolean'; value: boolean}
  | {type: 'array'; value: Array<Serial>}
  | {type: 'set'; value: Array<Serial>}
  | {type: 'object'; value: Record<string, Serial>}
  | {type: 'map'; value: Record<string, Serial>}
  | {type: 'function'; value: string}
  | {type: 'symbol'; value: string}
  | {type: 'bigint'; value: string}

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

  constructor(port = 8080) {
    this.port = port
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
    this.server.on('connection', ws => {
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
    this.originalConsole = null
  }

  private serialize(arg: any): Serial {
    if (arg === undefined) return {type: 'undefined'}
    if (arg === null) return {type: 'null', value: null}

    const type = typeof arg

    if (type === 'number') return {type: 'number', value: arg}
    if (type === 'string') return {type: 'string', value: arg}
    if (type === 'boolean') return {type: 'boolean', value: arg}
    if (type === 'function') return {type: 'function', value: arg.toString()}
    if (type === 'symbol') return {type: 'symbol', value: arg.toString()}
    if (type === 'bigint') return {type: 'bigint', value: arg.toString()}

    if (arg instanceof Error) {
      return {
        type: 'object',
        value: {
          name: this.serialize(arg.name),
          message: this.serialize(arg.message),
          stack: this.serialize(arg.stack),
        },
      }
    }

    if (Array.isArray(arg)) {
      return {type: 'array', value: arg.map(value => this.serialize(value))}
    }

    if (arg instanceof Set) {
      return {type: 'set', value: Array.from(arg).map(value => this.serialize(value))}
    }

    if (arg instanceof Map) {
      const serializedMap: Record<string, Serial> = {}
      arg.forEach((value, key) => {
        serializedMap[String(key)] = this.serialize(value)
      })
      return {type: 'map', value: serializedMap}
    }

    if (type === 'object') {
      const serializedObj: Record<string, Serial> = {}
      for (const key in arg) {
        if (Object.prototype.hasOwnProperty.call(arg, key)) {
          serializedObj[key] = this.serialize(arg[key])
        }
      }

      return {type: 'object', value: serializedObj}
    }

    // Fallback for any other types
    return {type: 'string', value: String(arg)}
  }

  private broadcast(type: string, args: any[]) {
    if (!this.connections.length) return

    // Convert arguments to JSON-friendly format
    const serializedArgs = args.map(arg => this.serialize(arg))

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
