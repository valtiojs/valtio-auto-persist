![NPM Version](https://img.shields.io/npm/v/valtio-auto-persist?style=flat-square)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/valtiojs/valtio-auto-persist/test.yml?style=flat-square)
![npm bundle size](https://img.shields.io/bundlephobia/minzip/valtio-auto-persist?style=flat-square)
![NPM License](https://img.shields.io/npm/l/valtio-auto-persist?style=flat-square)

# valtio-auto-persist

A persistence layer for [valtio](https://github.com/pmndrs/valtio) that allows you to save and restore state to various storage backends - without the need for keys!

## Features

See the `valtio-persist` library for all available features. 

## Installation
```bash
npm install valtio-auto-persist
# or
yarn add valtio-auto-persist
# or
pnpm add valtio-auto-persist
```

## Basic Usage

```typescript
import { persist } from 'valtio-auto-persist'

// Define your state
interface State {
  count: number
  text: string
}

const initialState: State = {
  count: 1,
  text: 'hello'
}

// Create a persisted store - no key provided
const { store } = await persist<State>(initialState)

// Use the store like a regular valtio store
store.count++
store.text = 'Updated'
// The changes will be automatically persisted to localStorage
```

## You can still assign a key if you wish
This will essentially work exactly like `valtio-persist`
```ts
// Create a persisted store with a provided key
const { store } = await persist<State>(initialState, {
  key: 'custom-key' // note this is on the options object and not it's own parameter
})
```

## Gotchas
This library uses `structure-id` to auto-generate a unique ID based on an object's *structure* and *types*. For example:

```ts
import { generateStructureId } from 'structure-id'

const object1 = {
  prop1: 'text',
  prop2: 3,
  prop3: {
    someBoolean: false
  }
}
const id1 = generateStructureId(object1) // L0:18437-L1:8841-L2:8

const object2 = {
  prop1: 'other text',
  prop2: 123,
  prop3: {
    someBoolean: true
  }
}
//                                                 ↓
const id2 = generateStructureId(object2) // L0:18437-L1:8841-L2:8 same id as first

const object3 = {
  prop1: 2,
  prop2: 'foobar',
  prop3: {
    someBoolean: false
  }
}
//                                                 ↓
const id3 = generateStructureId(object3) // L0:18438-L1:8841-L2:8 different - arrow points where
```

 If the structure of your state object changes at any point, the id that stores the object will also change. You can opt out of this behavior so that the persisted state will match only the initialState that is passed in by passing false to the option: `updateStorageKeyOnStructureChange`

 ```ts
import { generateStructureId } from 'structure-id'

const initialState = {
  foo: 'bar'
}

const { store } = await persist(initialStte, {
  updateStorageKeyOnStructureChange: false
})
 ```