export interface TypedEventEmitter<Events extends Record<string, unknown[]>> {
  on<E extends keyof Events & string>(event: E, listener: (...args: Events[E]) => void): this
  off<E extends keyof Events & string>(event: E, listener: (...args: Events[E]) => void): this
  emit<E extends keyof Events & string>(event: E, ...args: Events[E]): boolean
  removeAllListeners(event?: keyof Events & string): this
}
