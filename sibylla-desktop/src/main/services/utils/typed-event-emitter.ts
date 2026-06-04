type EventArgs<Events, E extends keyof Events> = Events[E] extends unknown[] ? Events[E] : never

export interface TypedEventEmitter<Events> {
  on<E extends keyof Events & string>(event: E, listener: (...args: EventArgs<Events, E>) => void): this
  off<E extends keyof Events & string>(event: E, listener: (...args: EventArgs<Events, E>) => void): this
  emit<E extends keyof Events & string>(event: E, ...args: EventArgs<Events, E>): boolean
  removeAllListeners(event?: keyof Events & string): this
}
