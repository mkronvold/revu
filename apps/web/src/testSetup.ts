function createMemoryStorage(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key) {
      store.delete(key);
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
  };
}

const localStorage = createMemoryStorage();
const sessionStorage = createMemoryStorage();

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: localStorage,
  writable: true,
});

Object.defineProperty(window, 'sessionStorage', {
  configurable: true,
  value: sessionStorage,
  writable: true,
});

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: localStorage,
  writable: true,
});

Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  value: sessionStorage,
  writable: true,
});

export {};
