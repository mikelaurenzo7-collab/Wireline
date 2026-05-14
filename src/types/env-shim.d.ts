declare module "express" {
  interface Express {
    (): any;
    json: (options?: any) => any;
    raw: (options?: any) => any;
    static: (path: string, options?: any) => any;
    Router: () => any;
  }

  export interface Request {
    [key: string]: any;
    user?: any;
    role: any;
    cookies: Record<string, string>;
  }
  export interface Response {
    [key: string]: any;
    status(code: number): Response;
    json(data: any): Response;
    send(data: any): Response;
    setHeader(name: string, value: string): void;
  }
  export interface Router {
    [key: string]: any;
    get: any;
    post: any;
    put: any;
    delete: any;
    use: any;
  }
  export type NextFunction = any;

  const express: Express;
  export const Router: () => Router;
  export const json: (options?: any) => any;
  export const raw: (options?: any) => any;
  export const static: (path: string, options?: any) => any;
  export default express;
}

declare namespace express {
  export type Request = any;
  export type Response = any;
  export type NextFunction = any;
  export type RequestHandler = any;
}

declare module "http" {
  export interface IncomingHttpHeaders {
    [key: string]: string | string[] | undefined;
  }
}

declare module "drizzle-orm" {
  export const eq: any;
  export const and: any;
  export const or: any;
  export const sql: any;
  export const desc: any;
  export const asc: any;
  export const ilike: any;
  export const relations: any;
  export const gte: any;
  export const lte: any;
  export const lt: any;
  export const not: any;
  export const inArray: any;
  export const notInArray: any;
  export const isNull: any;
  export const isNotNull: any;
  export const count: any;
  export const like: any;
  export const ne: any;
}

declare module "drizzle-orm/pg-core" {
  export const pgTable: any;
  export const text: any;
  export const timestamp: any;
  export const integer: any;
  export const decimal: any;
  export const boolean: any;
  export const uuid: any;
  export const bigint: any;
  export const jsonb: any;
  export const unique: any;
}

declare module "drizzle-orm/vercel-postgres" {
  export const drizzle: any;
  export type VercelPgDatabase<T = any> = any;
}

declare module "cors" {
  export default function cors(options?: any): any;
}

declare module "dotenv" {
  export function config(options?: any): any;
}

declare module "path" {
  export function join(...paths: string[]): string;
  export function resolve(...paths: string[]): string;
}

declare module "node:crypto" {
  export const randomUUID: () => string;
  export const createHmac: (algorithm: string, key: string) => any;
  export const timingSafeEqual: (a: any, b: any) => boolean;
}

declare module "child_process" {
  export function exec(command: string, callback?: any): any;
  export function spawn(command: string, args?: string[], options?: any): any;
}

declare module "util" {
  export function promisify(fn: any): any;
}

declare module "fs/promises" {
  export function readFile(path: string, options?: any): Promise<string | any>;
  export function stat(path: string): Promise<any>;
  export function writeFile(path: string, data: any, options?: any): Promise<void>;
}

declare module "node:fs" {
  export const readFileSync: any;
  export const writeFileSync: any;
}

declare module "vite" {
  export const createServer: any;
}

declare module "@sentry/node" {
  export const init: any;
  export const captureException: any;
  export const captureMessage: any;
  export const Handlers: any;
  export const setTag: any;
  export const setUser: any;
  export type CaptureContext = any;
}

declare module "@google/generative-ai" {
  export class GoogleGenerativeAI {
    constructor(apiKey: string);
    getGenerativeModel(config: any): any;
  }
}

declare module "googleapis" {
  export const google: any;
}

declare module "clsx" {
  export type ClassValue = any;
  export function clsx(...args: any[]): string;
}

declare module "recharts" {
  export const ResponsiveContainer: any;
  export const AreaChart: any;
  export const Area: any;
  export const XAxis: any;
  export const YAxis: any;
  export const Tooltip: any;
  export const PieChart: any;
  export const Pie: any;
  export const CartesianGrid: any;
  export const RadarChart: any;
  export const Radar: any;
  export const PolarGrid: any;
  export const PolarAngleAxis: any;
  export const PolarRadiusAxis: any;
  export const Cell: any;
}

declare module "stripe" {
  class Stripe {
    constructor(key: string, config?: any);
    [key: string]: any;
  }
  namespace Stripe {
    export type Checkout = any;
    export type Event = any;
    export type Customer = any;
    export type Subscription = any;
    export type LatestApiVersion = string;
  }
  export default Stripe;
}

declare interface ProcessEnv {
  [key: string]: string | undefined;
}

declare var process: {
  env: ProcessEnv;
  exit(code?: number): never;
  on(event: string, listener: any): any;
  cwd(): string;
};

declare function fetch(url: string, init?: any): Promise<any>;

declare class URLSearchParams {
  constructor(init?: any);
  append(name: string, value: string): void;
  delete(name: string): void;
  get(name: string): string | null;
  getAll(name: string): string[];
  has(name: string): boolean;
  set(name: string, value: string): void;
  sort(): void;
  toString(): string;
  keys(): IterableIterator<string>;
  values(): IterableIterator<string>;
  entries(): IterableIterator<[string, string]>;
  [Symbol.iterator](): IterableIterator<[string, string]>;
}
