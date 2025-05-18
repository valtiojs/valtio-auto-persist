import { proxy, type Snapshot, snapshot, subscribe } from "valtio"
import type {
	PersistResult,
	StorageStrategy,
	SerializationStrategy,
	MergeStrategy,
} from "./types"
import { LocalStorageStrategy } from "./storage/localStorage"
import { DefaultMergeStrategy } from "./merge/default"
import { JSONSerializationStrategy } from "./serialization/json"
import { debounce, updateStore } from "./utils"
import type { HistoryOptions } from "./history"
import { generateStructureId } from 'structure-id'

export type * from "./types"

// Export all storage strategies
export * from "./storage"

// Define your options type (without the key)
interface PersistOptions<T extends object> {
	key?: string
	// How to store state - accepting a constructor
	storageStrategy?: {
		new (): StorageStrategy
	} | StorageStrategy
	// Controls how objects are serialized
	serializationStrategy?: {
		new (): SerializationStrategy<T>
	} | SerializationStrategy<T>
	// How to merge stored state with initial state
	mergeStrategy?: {
		new (): MergeStrategy<T>
	} | MergeStrategy<T>
	// Should the state be persisted at a moment in time
	shouldPersist?: (prevState: Snapshot<T>, nextState: Snapshot<T>) => boolean
	// Time in milliseconds to debounce persistence operations
	debounceTime?: number
	// history enabled
	history?: HistoryOptions<T>
	// update id on structure change
	updateStorageKeyOnStructureChange?: boolean
}

const isSyncStorage = (
	storage: StorageStrategy<boolean>,
): storage is StorageStrategy<false> => {
	return !storage.isAsync
}

const isSyncSerializer = <T>(
	serializer: SerializationStrategy<T, boolean>,
): serializer is SerializationStrategy<T, false> => {
	return !serializer.isAsync
}

const isSyncMerger = <T>(
	merger: MergeStrategy<T, boolean>,
): merger is MergeStrategy<T, false> => {
	return !merger.isAsync
}

let userProvidedKey = true

export async function persist<T extends object>(
	initialState: T,
	options?: PersistOptions<T>,
): Promise<PersistResult<T>> {
	const defaultOptions = {
		key: '',
		storageStrategy: LocalStorageStrategy,
		serializationStrategy: JSONSerializationStrategy,
		mergeStrategy: DefaultMergeStrategy,
		shouldPersist: () => true,
		debounceTime: 100,
		updateStorageKeyOnStructureChange: true
	}

	const o = { ...defaultOptions, ...options }

	const key = o.key === '' ? generateStructureId(initialState) : o.key

	if (o.key === '') userProvidedKey = false

	const storageInstance = 
		typeof o.storageStrategy === 'function'
		? new o.storageStrategy()
		: o.storageStrategy;

	const serializer =
		typeof o.serializationStrategy === 'function'
		? new o.serializationStrategy()
		: o.serializationStrategy;

	const merger =
		typeof o.mergeStrategy === 'function'
		? new o.mergeStrategy()
		: o.mergeStrategy;

	// Create storage proxy to support legacy API with deprecation warnings
	const storage = new Proxy(storageInstance, {
		get(target, prop, receiver) {
			// Map legacy methods to new methods with warnings
			if (prop === "getItem") {
				console.warn("Deprecated: use .get() instead of .getItem()")
				return target.get.bind(target)
			}
			if (prop === "setItem") {
				console.warn("Deprecated: use .set() instead of .setItem()")
				return target.set.bind(target)
			}
			if (prop === "removeItem") {
				console.warn("Deprecated: use .remove() instead of .removeItem()")
				return target.remove.bind(target)
			}
			return Reflect.get(target, prop, receiver)
		},
	})

	const { shouldPersist, debounceTime } = o

	const data = isSyncStorage(storage)
		? storage.get(key) || null
		: (await storage.get(key)) || null

	const storedState = data
		? isSyncSerializer(serializer)
			? serializer.deserialize(data) || null
			: (await serializer.deserialize(data)) || null
		: null

	const mergedState = storedState
		? isSyncMerger(merger)
			? merger.merge(initialState, storedState) || null
			: (await merger.merge(initialState, storedState)) || null
		: undefined

	const store = proxy<T>(mergedState)

	let previousState = snapshot(store)

	// Create the persist function - modified to respect shouldPersist even for manual calls
	const persistData = async () => {
		const currentState = snapshot(store)

		// Add this check to respect shouldPersist for manual calls
		if (!shouldPersist(previousState, currentState)) {
			return Promise.resolve() // Don't persist if shouldPersist returns false
		}

		const serialized = isSyncSerializer(serializer)
			? serializer.serialize(currentState)
			: await serializer.serialize(currentState)

		if (isSyncStorage(storage)) {
			// Now we have a definite string type for serialized
			const syncStorage = storage as StorageStrategy<false>
			syncStorage.set(key, serialized)
			return Promise.resolve()
		}

		const asyncStorage = storage as StorageStrategy<true>
		return asyncStorage.set(key, serialized)
	}

	// Set up persistence
	const debouncedPersist = debounce(persistData, debounceTime)

	// Subscribe to changes
	subscribe(store, async () => {
		const currentState = snapshot(store)

		const generatedId = generateStructureId(currentState)

		// if the structure of the data has changed, change the key
		if (key !== generatedId && !userProvidedKey && o.updateStorageKeyOnStructureChange) {
			const data = isSyncSerializer(serializer)
				? serializer.serialize(currentState)
				: await serializer.serialize(currentState)

			if (isSyncStorage(storage)) {
				storage.remove(key)
				storage.set(generatedId, data)
			} else {
				await storage.remove(key)
				await storage.set(generatedId, data)
			}
		}

		if (shouldPersist(previousState, currentState)) {
			debouncedPersist()
		}

		// Update previous state for next comparison
		previousState = currentState
	})

	// Return the result
	return {
		store,
		persist: persistData,
		clear: async () => {
			if (isSyncStorage(storage)) {
				storage.remove(key)
				return Promise.resolve()
			}
			return storage.remove(key)
		},
		restore: async () => {
			const data = isSyncStorage(storage)
				? storage.get(key) || null
				: (await storage.get(key)) || null

			const storedState = data
				? isSyncSerializer(serializer)
					? serializer.deserialize(data) || null
					: (await serializer.deserialize(data)) || null
				: null

			const mergedState = storedState
				? isSyncMerger(merger)
					? merger.merge(initialState, storedState) || null
					: (await merger.merge(initialState, storedState)) || null
				: undefined

			if (mergedState) {
				updateStore(store, mergedState)
				return true
			}

			return false
		},
	}
}
