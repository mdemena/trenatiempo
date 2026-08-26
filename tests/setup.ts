if (typeof localStorage === 'undefined' || localStorage === null) {
  const store = new Map<string, string>()

  const localStorageShim: Storage = {
    getItem(key: string) {
      return store.get(key) ?? null
    },
    setItem(key: string, value: string) {
      store.set(key, String(value))
    },
    removeItem(key: string) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
    get length() {
      return store.size
    },
    key(index: number) {
      return [...store.keys()][index] ?? null
    },
  }

  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageShim,
    writable: true,
    configurable: true,
  })
}
