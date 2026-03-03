---
name: typescript-strict-mode
description: >-
  TypeScript 严格模式开发最佳实践。当需要配置 TypeScript 严格模式、设计类型安全的 API、使用泛型与高级类型、实现类型守卫与断言、优化类型推断、或集成第三方库类型时使用此 skill。
license: MIT
metadata:
  category: development
  tags:
    - typescript
    - type-safety
    - strict-mode
    - best-practices
---

# TypeScript 严格模式开发

此 skill 提供 TypeScript 严格模式开发的最佳实践指南,涵盖严格模式配置、类型安全 API 设计、泛型与高级类型、类型守卫、类型推断优化等核心主题。

## 何时使用此 Skill

在以下场景中使用此 skill:

- 配置 TypeScript 严格模式(禁止 `any`)
- 设计类型安全的 API 接口
- 使用泛型与高级类型
- 实现类型守卫与类型断言
- 优化类型推断
- 集成第三方库的类型定义
- 重构 JavaScript 代码为 TypeScript

## 核心概念

### 1. 严格模式配置

在 [`tsconfig.json`](https://www.typescriptlang.org/tsconfig) 中启用严格模式:

```json
{
  "compilerOptions": {
    // 启用所有严格类型检查选项
    "strict": true,
    
    // 或者单独启用每个选项
    "noImplicitAny": true,              // 禁止隐式 any
    "strictNullChecks": true,           // 严格的 null 和 undefined 检查
    "strictFunctionTypes": true,        // 严格的函数类型检查
    "strictBindCallApply": true,        // 严格的 bind/call/apply 检查
    "strictPropertyInitialization": true, // 严格的类属性初始化检查
    "noImplicitThis": true,             // 禁止隐式 this
    "alwaysStrict": true,               // 始终以严格模式解析
    
    // 额外的严格检查
    "noUnusedLocals": true,             // 检查未使用的局部变量
    "noUnusedParameters": true,         // 检查未使用的参数
    "noImplicitReturns": true,          // 检查函数的所有代码路径是否都有返回值
    "noFallthroughCasesInSwitch": true, // 检查 switch 语句的 fallthrough
    "noUncheckedIndexedAccess": true,   // 索引访问时包含 undefined
    "noImplicitOverride": true,         // 要求显式使用 override 关键字
    "noPropertyAccessFromIndexSignature": true, // 索引签名属性必须使用索引访问
    
    // 模块解析
    "moduleResolution": "node",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    
    // 其他
    "skipLibCheck": true,               // 跳过声明文件的类型检查(提升性能)
    "forceConsistentCasingInFileNames": true, // 强制文件名大小写一致
  }
}
```

**最佳实践**:
- 新项目直接启用 `"strict": true`
- 旧项目逐步启用各个严格选项
- 使用 `skipLibCheck: true` 提升编译性能
- 启用 `noUncheckedIndexedAccess` 避免索引访问的运行时错误

### 2. 禁止 any 的替代方案

避免使用 `any`,使用更精确的类型:

```typescript
// ❌ 错误: 使用 any
function processData(data: any) {
  return data.value;
}

// ✅ 正确: 使用 unknown
function processData(data: unknown) {
  // 需要类型守卫
  if (typeof data === 'object' && data !== null && 'value' in data) {
    return (data as { value: unknown }).value;
  }
  throw new Error('Invalid data');
}

// ✅ 更好: 使用泛型
function processData<T extends { value: unknown }>(data: T) {
  return data.value;
}

// ✅ 最佳: 定义明确的类型
interface DataWithValue {
  value: string | number;
}

function processData(data: DataWithValue) {
  return data.value;
}
```

**替代方案**:
- `unknown` - 类型安全的 any,需要类型检查后才能使用
- `never` - 表示永远不会发生的类型
- 泛型 `<T>` - 保留类型信息的通用类型
- 联合类型 `string | number` - 明确的多类型选择
- 类型断言 `as Type` - 明确告诉编译器类型(谨慎使用)

### 3. 类型安全的 API 设计

设计类型安全的函数和接口:

```typescript
// 文件操作 API
export interface FileReadOptions {
  encoding?: 'utf-8' | 'base64';
  maxSize?: number;
}

export interface FileReadResult {
  content: string;
  size: number;
  encoding: string;
}

export async function readFile(
  path: string,
  options?: FileReadOptions
): Promise<FileReadResult> {
  const encoding = options?.encoding ?? 'utf-8';
  const maxSize = options?.maxSize ?? Infinity;
  
  // 实现...
  return {
    content: '',
    size: 0,
    encoding,
  };
}

// Git 操作 API
export interface GitStatus {
  readonly modified: readonly string[];
  readonly added: readonly string[];
  readonly deleted: readonly string[];
  readonly untracked: readonly string[];
}

export interface GitSyncOptions {
  remote?: string;
  branch?: string;
  force?: boolean;
}

export interface GitSyncResult {
  readonly success: boolean;
  readonly commits: number;
  readonly conflicts: readonly string[];
}

export async function syncGit(
  options?: GitSyncOptions
): Promise<GitSyncResult> {
  // 实现...
  return {
    success: true,
    commits: 0,
    conflicts: [],
  };
}

// IPC 通道类型安全
export const IPC_CHANNELS = {
  FILE_READ: 'file:read',
  FILE_WRITE: 'file:write',
  GIT_STATUS: 'git:status',
  GIT_SYNC: 'git:sync',
} as const;

// 提取通道名称的类型
export type IPCChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];

// 定义每个通道的请求和响应类型
export interface IPCHandlers {
  [IPC_CHANNELS.FILE_READ]: (path: string, options?: FileReadOptions) => Promise<FileReadResult>;
  [IPC_CHANNELS.FILE_WRITE]: (path: string, content: string) => Promise<void>;
  [IPC_CHANNELS.GIT_STATUS]: () => Promise<GitStatus>;
  [IPC_CHANNELS.GIT_SYNC]: (options?: GitSyncOptions) => Promise<GitSyncResult>;
}

// 类型安全的 IPC 调用
export async function invokeIPC<K extends keyof IPCHandlers>(
  channel: K,
  ...args: Parameters<IPCHandlers[K]>
): Promise<ReturnType<IPCHandlers[K]>> {
  // 实现...
  return null as any; // 实际实现中会调用 ipcRenderer.invoke
}

// 使用示例
const result = await invokeIPC(IPC_CHANNELS.FILE_READ, '/path/to/file', { encoding: 'utf-8' });
// result 的类型自动推断为 Promise<FileReadResult>
```

**最佳实践**:
- 使用 `readonly` 防止意外修改
- 使用 `as const` 创建字面量类型
- 使用泛型保留类型信息
- 使用 `Parameters<T>` 和 `ReturnType<T>` 提取函数类型
- 为可选参数提供默认值

### 4. 泛型与高级类型

使用泛型和高级类型提升代码复用性:

```typescript
// 泛型函数
export function identity<T>(value: T): T {
  return value;
}

// 泛型约束
export function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

// 使用示例
const user = { name: 'Alice', age: 30 };
const name = getProperty(user, 'name'); // 类型: string
const age = getProperty(user, 'age');   // 类型: number

// 泛型类
export class Store<T> {
  private items: T[] = [];
  
  add(item: T): void {
    this.items.push(item);
  }
  
  get(index: number): T | undefined {
    return this.items[index];
  }
  
  filter(predicate: (item: T) => boolean): T[] {
    return this.items.filter(predicate);
  }
}

// 使用示例
const fileStore = new Store<{ path: string; content: string }>();
fileStore.add({ path: '/test.md', content: 'Hello' });

// 条件类型
export type IsString<T> = T extends string ? true : false;

type A = IsString<string>;  // true
type B = IsString<number>;  // false

// 映射类型
export type Readonly<T> = {
  readonly [P in keyof T]: T[P];
};

export type Partial<T> = {
  [P in keyof T]?: T[P];
};

export type Required<T> = {
  [P in keyof T]-?: T[P];
};

// 实用工具类型
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type Maybe<T> = T | null | undefined;

// 提取 Promise 的返回类型
export type Awaited<T> = T extends Promise<infer U> ? U : T;

// 使用示例
type FileResult = Awaited<ReturnType<typeof readFile>>; // FileReadResult

// 递归类型
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

// 联合类型转交叉类型
export type UnionToIntersection<U> = 
  (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never;

// 排除类型
export type Exclude<T, U> = T extends U ? never : T;
export type Extract<T, U> = T extends U ? T : never;

// 非空类型
export type NonNullable<T> = T extends null | undefined ? never : T;
```

**最佳实践**:
- 使用泛型约束 `<T extends Type>` 限制类型范围
- 使用 `keyof` 和索引访问类型保证类型安全
- 使用条件类型实现类型级别的逻辑
- 使用映射类型批量转换属性
- 使用 TypeScript 内置的工具类型(`Partial`, `Required`, `Pick`, `Omit` 等)

### 5. 类型守卫与类型断言

实现类型守卫确保运行时类型安全:

```typescript
// 类型谓词(Type Predicate)
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// 使用示例
function processValue(value: unknown) {
  if (isString(value)) {
    // value 的类型被收窄为 string
    console.log(value.toUpperCase());
  } else if (isNumber(value)) {
    // value 的类型被收窄为 number
    console.log(value.toFixed(2));
  }
}

// 自定义类型守卫
export interface FileRecord {
  type: 'file';
  path: string;
  content: string;
}

export interface DirectoryRecord {
  type: 'directory';
  path: string;
  children: string[];
}

export type FSRecord = FileRecord | DirectoryRecord;

export function isFileRecord(record: FSRecord): record is FileRecord {
  return record.type === 'file';
}

export function isDirectoryRecord(record: FSRecord): record is DirectoryRecord {
  return record.type === 'directory';
}

// 使用示例
function processRecord(record: FSRecord) {
  if (isFileRecord(record)) {
    // record 的类型被收窄为 FileRecord
    console.log(record.content);
  } else {
    // record 的类型被收窄为 DirectoryRecord
    console.log(record.children);
  }
}

// 判别联合类型(Discriminated Union)
export type Result<T, E = Error> =
  | { success: true; value: T }
  | { success: false; error: E };

function handleResult<T>(result: Result<T>) {
  if (result.success) {
    // result 的类型被收窄为 { success: true; value: T }
    console.log(result.value);
  } else {
    // result 的类型被收窄为 { success: false; error: Error }
    console.error(result.error);
  }
}

// 断言函数(Assertion Function)
export function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) {
    throw new Error(message ?? 'Assertion failed');
  }
}

export function assertIsString(value: unknown): asserts value is string {
  if (typeof value !== 'string') {
    throw new Error('Value is not a string');
  }
}

// 使用示例
function processUnknown(value: unknown) {
  assertIsString(value);
  // 此后 value 的类型被断言为 string
  console.log(value.toUpperCase());
}

// 非空断言(谨慎使用)
function getElement(id: string): HTMLElement | null {
  return document.getElementById(id);
}

const element = getElement('app')!; // 使用 ! 断言非空
element.innerHTML = 'Hello'; // 不会报错,但运行时可能出错

// 更安全的方式
const element2 = getElement('app');
if (element2) {
  element2.innerHTML = 'Hello';
}
```

**最佳实践**:
- 优先使用类型守卫而非类型断言
- 使用判别联合类型简化类型收窄
- 使用断言函数在运行时验证类型
- 避免使用非空断言 `!`,除非确定不会为 null
- 使用 `unknown` 而非 `any` 作为未知类型

### 6. 类型推断优化

利用 TypeScript 的类型推断减少显式类型注解:

```typescript
// 函数返回类型推断
export function createUser(name: string, age: number) {
  return {
    name,
    age,
    createdAt: Date.now(),
  };
}

// 返回类型自动推断为:
// { name: string; age: number; createdAt: number }

// 使用 ReturnType 提取返回类型
export type User = ReturnType<typeof createUser>;

// 数组类型推断
const numbers = [1, 2, 3]; // 推断为 number[]
const mixed = [1, 'two', true]; // 推断为 (number | string | boolean)[]

// 使用 as const 创建字面量类型
const config = {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
} as const;

// config 的类型为:
// {
//   readonly apiUrl: "https://api.example.com";
//   readonly timeout: 5000;
// }

// 泛型参数推断
function map<T, U>(array: T[], fn: (item: T) => U): U[] {
  return array.map(fn);
}

// 使用时不需要显式指定泛型参数
const lengths = map(['a', 'bb', 'ccc'], s => s.length);
// lengths 的类型自动推断为 number[]

// 上下文类型推断
const handler: (event: MouseEvent) => void = (e) => {
  // e 的类型自动推断为 MouseEvent
  console.log(e.clientX, e.clientY);
};

// 解构赋值类型推断
const user = { name: 'Alice', age: 30 };
const { name, age } = user;
// name: string, age: number

// 剩余参数类型推断
function sum(...numbers: number[]) {
  return numbers.reduce((a, b) => a + b, 0);
}

// 使用 infer 推断类型
export type ElementType<T> = T extends (infer U)[] ? U : never;

type A = ElementType<string[]>; // string
type B = ElementType<number[]>; // number

// 推断函数参数类型
export type FirstParameter<T> = T extends (first: infer P, ...args: any[]) => any ? P : never;

type C = FirstParameter<typeof map>; // T[]
```

**最佳实践**:
- 让 TypeScript 自动推断简单类型
- 为公共 API 显式声明类型
- 使用 `as const` 创建不可变的字面量类型
- 使用 `ReturnType` 和 `Parameters` 提取函数类型
- 使用 `infer` 在条件类型中推断类型

### 7. 第三方库类型集成

集成第三方库的类型定义:

```typescript
// 安装类型定义
// npm install --save-dev @types/node
// npm install --save-dev @types/react

// 使用类型定义
import { EventEmitter } from 'events';
import React from 'react';

// 为没有类型定义的库创建声明文件
// types/custom-lib.d.ts
declare module 'custom-lib' {
  export function doSomething(value: string): number;
  export class CustomClass {
    constructor(options: { name: string });
    getName(): string;
  }
}

// 扩展第三方库的类型
// types/express.d.ts
import 'express';

declare module 'express' {
  interface Request {
    user?: {
      id: string;
      name: string;
    };
  }
}

// 使用扩展后的类型
import { Request, Response } from 'express';

function handler(req: Request, res: Response) {
  // req.user 现在有类型定义
  if (req.user) {
    console.log(req.user.name);
  }
}

// 为全局变量添加类型
// types/global.d.ts
declare global {
  interface Window {
    electronAPI: {
      readFile: (path: string) => Promise<string>;
      writeFile: (path: string, content: string) => Promise<void>;
    };
  }
}

export {};

// 使用全局类型
const content = await window.electronAPI.readFile('/test.md');

// 为 JSON 文件添加类型
// types/json.d.ts
declare module '*.json' {
  const value: any;
  export default value;
}

// 使用 JSON 导入
import config from './config.json';
```

**最佳实践**:
- 优先使用 `@types/*` 包提供的类型定义
- 为没有类型的库创建 `.d.ts` 声明文件
- 使用模块扩展(Module Augmentation)扩展第三方库类型
- 将自定义类型声明放在 `types/` 目录
- 在 `tsconfig.json` 中配置 `typeRoots` 和 `types`

### 8. 常见模式与技巧

实用的 TypeScript 模式:

```typescript
// 1. 构建器模式(Builder Pattern)
export class QueryBuilder<T> {
  private filters: Array<(item: T) => boolean> = [];
  
  where(predicate: (item: T) => boolean): this {
    this.filters.push(predicate);
    return this;
  }
  
  execute(items: T[]): T[] {
    return items.filter(item => 
      this.filters.every(filter => filter(item))
    );
  }
}

// 使用示例
const results = new QueryBuilder<{ name: string; age: number }>()
  .where(u => u.age > 18)
  .where(u => u.name.startsWith('A'))
  .execute(users);

// 2. 单例模式(Singleton Pattern)
export class DatabaseManager {
  private static instance: DatabaseManager;
  
  private constructor() {
    // 私有构造函数
  }
  
  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }
}

// 3. 工厂模式(Factory Pattern)
export interface Logger {
  log(message: string): void;
}

export class ConsoleLogger implements Logger {
  log(message: string): void {
    console.log(message);
  }
}

export class FileLogger implements Logger {
  log(message: string): void {
    // 写入文件
  }
}

export class LoggerFactory {
  static create(type: 'console' | 'file'): Logger {
    switch (type) {
      case 'console':
        return new ConsoleLogger();
      case 'file':
        return new FileLogger();
    }
  }
}

// 4. 观察者模式(Observer Pattern)
export type Listener<T> = (data: T) => void;

export class EventBus<T> {
  private listeners: Listener<T>[] = [];
  
  subscribe(listener: Listener<T>): () => void {
    this.listeners.push(listener);
    
    // 返回取消订阅函数
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }
  
  emit(data: T): void {
    this.listeners.forEach(listener => listener(data));
  }
}

// 5. 类型安全的事件系统
export interface EventMap {
  'file:changed': { path: string; content: string };
  'git:synced': { commits: number };
  'error': { message: string; code: number };
}

export class TypedEventEmitter {
  private listeners = new Map<keyof EventMap, Set<Function>>();
  
  on<K extends keyof EventMap>(
    event: K,
    listener: (data: EventMap[K]) => void
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }
  
  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach(listener => listener(data));
    }
  }
}

// 使用示例
const emitter = new TypedEventEmitter();

emitter.on('file:changed', (data) => {
  // data 的类型自动推断为 { path: string; content: string }
  console.log(data.path, data.content);
});

emitter.emit('file:changed', { path: '/test.md', content: 'Hello' });
```

**最佳实践**:
- 使用设计模式提升代码可维护性
- 利用 TypeScript 的类型系统确保模式的类型安全
- 使用泛型使模式更加通用
- 为事件系统使用类型映射确保类型安全

## 与现有 Skills 的关系

- 与 [`electron-desktop-app`](.kilocode/skills/electron-desktop-app/SKILL.md) 互补: 为 Electron 应用提供类型安全基础
- 与 [`electron-ipc-patterns`](.kilocode/skills/electron-ipc-patterns/SKILL.md) 互补: 设计类型安全的 IPC 接口
- 与 [`isomorphic-git-integration`](.kilocode/skills/isomorphic-git-integration/SKILL.md) 互补: 为 Git 抽象层提供严格类型定义
- 与 [`vite-electron-build`](.kilocode/skills/vite-electron-build/SKILL.md) 互补: 配置 TypeScript 编译选项

## 参考资源

- [TypeScript 官方文档](https://www.typescriptlang.org/docs/)
- [TypeScript Deep Dive](https://basarat.gitbook.io/typescript/)
- [TypeScript 类型体操](https://github.com/type-challenges/type-challenges)
- [Effective TypeScript](https://effectivetypescript.com/)
