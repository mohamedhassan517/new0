import localforage from 'localforage';

localforage.config({ name: 'accounting-app', storeName: 'state' });

export async function save<T>(key: string, value: T) {
  await localforage.setItem(key, value);
}

export async function load<T>(key: string, fallback: T): Promise<T> {
  const v = await localforage.getItem<T>(key);
  return (v as T) ?? fallback;
}

export async function clear(key: string) {
  await localforage.removeItem(key);
}
