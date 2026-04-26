export interface MCPTransport {
  connect(): Promise<void>
  send(message: unknown): Promise<void>
  onMessage(handler: (message: unknown) => void): void
  close(): Promise<void>
  isConnected(): boolean
}
