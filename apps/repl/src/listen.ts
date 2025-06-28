import WebSocket from 'ws'
import {type Serial} from './socky'

type LogMessage = {
  type: 'log' | 'info' | 'warn' | 'error' | 'debug'
  timestamp: string
  args: Serial[]
}

export class SockyListener {
  private ws: WebSocket | null = null
  private connected = false
  private reconnectTimeout: NodeJS.Timeout | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectDelay = 1000
  private url: string
  private handlers: Map<string, (message: LogMessage) => void> = new Map()

  constructor(host = 'localhost', port = 8080) {
    this.url = `ws://${host}:${port}`
    this.setupCleanup()
  }

  connect(): this {
    if (this.connected) return this

    try {
      this.ws = new WebSocket(this.url)

      this.ws.on('open', () => {
        this.connected = true
        this.reconnectAttempts = 0
        console.log(`Connected to WebSocket server at ${this.url}`)
      })

      this.ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as LogMessage
          this.handleMessage(message)
        } catch (error) {
          console.error('Error parsing WebSocket message:', error)
        }
      })

      this.ws.on('close', () => {
        this.connected = false
        this.tryReconnect()
      })

      this.ws.on('error', error => {
        console.error('WebSocket error:', error)
        if (this.ws) {
          this.ws.terminate()
        }
        this.connected = false
        this.tryReconnect()
      })
    } catch (error) {
      console.error('Error creating WebSocket connection:', error)
      this.tryReconnect()
    }

    return this
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    if (this.ws) {
      this.ws.terminate()
      this.ws = null
    }

    this.connected = false
  }

  onLog(handler: (message: LogMessage) => void): this {
    this.handlers.set('log', handler)
    return this
  }

  onInfo(handler: (message: LogMessage) => void): this {
    this.handlers.set('info', handler)
    return this
  }

  onWarn(handler: (message: LogMessage) => void): this {
    this.handlers.set('warn', handler)
    return this
  }

  onError(handler: (message: LogMessage) => void): this {
    this.handlers.set('error', handler)
    return this
  }

  onDebug(handler: (message: LogMessage) => void): this {
    this.handlers.set('debug', handler)
    return this
  }

  onUnknown(handler: (message: LogMessage) => void): this {
    this.handlers.set('unknown', handler)
    return this
  }

  private handleMessage(message: LogMessage): void {
    // Call type-specific handler if registered
    const handler = this.handlers.get(message.type)
    if (handler) {
      handler(message)
    }

    // Call 'unknown' handler if registered
    const unknownHandler = this.handlers.get('unknown')
    if (unknownHandler) {
      unknownHandler(message)
    }
  }

  private tryReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(
        `Maximum reconnection attempts (${this.maxReconnectAttempts}) reached. Giving up.`,
      )
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1)
    console.log(
      `Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts} of ${this.maxReconnectAttempts})`,
    )

    this.reconnectTimeout = setTimeout(() => {
      this.connect()
    }, delay)
  }

  private setupCleanup(): void {
    // Handle program termination
    const cleanup = () => {
      this.disconnect()
    }

    process.on('SIGINT', cleanup)
    process.on('SIGTERM', cleanup)
    process.on('exit', cleanup)
  }

  // Helper method to deserialize values received from the server
  static deserialize(serial: Serial): any {
    switch (serial.type) {
      case 'undefined':
        return undefined
      case 'null':
        return null
      case 'number':
        return serial.value
      case 'string':
        return serial.value
      case 'boolean':
        return serial.value
      case 'function':
        return new Function(`return ${serial.value}`)()
      case 'symbol':
        return Symbol(serial.value.replace(/^Symbol\((.*)\)$/, '$1'))
      case 'bigint':
        return BigInt(serial.value)
      case 'array':
        return serial.value.map(item => SockyListener.deserialize(item))
      case 'set':
        return new Set(serial.value.map(item => SockyListener.deserialize(item)))
      case 'map':
        const map = new Map()
        for (const [key, value] of Object.entries(serial.value)) {
          map.set(key, SockyListener.deserialize(value))
        }
        return map
      case 'object':
        const obj: Record<string, any> = {}
        for (const [key, value] of Object.entries(serial.value)) {
          obj[key] = SockyListener.deserialize(value)
        }
        return obj
    }
  }
}

// Example usage:
// const listener = new SockyListener()
//   .onLog((message) => {
//     console.log(`Remote log [${message.timestamp}]:`, message.args.map(SockyListener.deserialize))
//   })
//   .connect()
