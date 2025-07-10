import {invert} from '@extra-lang/inspect'
import WebSocket from 'ws'

type LogMessage = {
  type: 'log' | 'info' | 'warn' | 'error' | 'debug'
  timestamp: string
  args: string[]
}

export class SockyListener {
  private ws: WebSocket | null = null
  private connected = false
  private reconnectTimeout: NodeJS.Timeout | null = null
  private reconnectDelay = 250
  private url: string
  private handlers: ((message: LogMessage) => void)[] = []

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

  onMessage(handler: (message: LogMessage) => void): this {
    this.handlers.push(handler)
    return this
  }

  private handleMessage(message: LogMessage): void {
    // Call type-specific handler if registered
    this.handlers.forEach(handler => handler(message))
  }

  private tryReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
    }

    const delay = this.reconnectDelay

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
}

new SockyListener()
  .onMessage(message => {
    console.log(invert(` [${message.timestamp}] `), ...message.args)
  })
  .connect()
