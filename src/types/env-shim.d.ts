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

declare module "react" {
  export function useState<T>(initialState: T | (() => T)): [T, (newState: T | ((prevState: T) => T)) => void];
  export function useState<T = any>(): [T | undefined, (newState: T | undefined | ((prevState: T | undefined) => T | undefined)) => void];
  export function useEffect(effect: () => void | (() => void), deps?: any[]): void;
  export function useContext<T>(context: any): T;
  export function useMemo<T>(factory: () => T, deps: any[] | undefined): T;
  export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: any[]): T;
  export function useRef<T>(initialValue: T): { current: T };
  export function useRef<T = any>(): { current: T | undefined };
  export function useTransition(): [boolean, (callback: () => void) => void];
  export function useId(): string;
  export function useDeferredValue<T>(value: T): T;
  export function startTransition(scope: () => void): void;
  export function createContext<T>(defaultValue: T): any;
  export function createRef<T>(): { current: T | null };
  export function forwardRef<T, P = {}>(render: (props: P, ref: any) => any): any;
  export function memo<T extends ComponentType<any>>(Component: T, propsAreEqual?: (prevProps: any, nextProps: any) => boolean): T;
  export const Fragment: any;
  export const StrictMode: any;
  export const Suspense: any;
  export type ReactNode = any;
  export type JSX = any;
  export type CSSProperties = any;
  export type Key = any;
  export type Ref<T> = any;
  export type ComponentType<T = any> = any;
  export type MouseEvent = any;
  const React: any;
  export default React;
}

declare module "react/jsx-runtime" {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}

declare module "motion/react" {
  export const motion: any;
  export const AnimatePresence: any;
  export const useScroll: any;
  export const useTransform: any;
  export const useSpring: any;
  export const LayoutGroup: any;
  export const Reorder: any;
}

declare module "lucide-react" {
  export const TrendingUp: any;
  export const TrendingDown: any;
  export const GripVertical: any;
  export const CheckCircle2: any;
  export const Plus: any;
  export const Phone: any;
  export const Bot: any;
  export const Save: any;
  export const Loader2: any;
  export const Trash2: any;
  export const Mail: any;
  export const Pencil: any;
  export const Sparkles: any;
  export const ChevronRight: any;
  export const ChevronLeft: any;
  export const Zap: any;
  export const Target: any;
  export const Radio: any;
  export const Settings2: any;
  export const Shield: any;
  export const Briefcase: any;
  export const RefreshCw: any;
  export const LayoutGrid: any;
  export const Clock: any;
  export const Send: any;
  export const Users: any;
  export const Database: any;
  export const PlayCircle: any;
  export const MessageSquare: any;
  export const Activity: any;
  export const Terminal: any;
  export const ChevronDown: any;
  export const Workflow: any;
  export const Beaker: any;
  export const Brain: any;
  export const ListFilter: any;
  export const Settings: any;
  export const Blocks: any;
  export const Calendar: any;
  export const DollarSign: any;
  export const BarChart3: any;
  export const Filter: any;
  export const Headphones: any;
  export const Building2: any;
  export const Search: any;
  export const MessageCircle: any;
  export const Check: any;
  export const User: any;
  export const PhoneIncoming: any;
  export const ClipboardList: any;
  export const Receipt: any;
  export const Link: any;
  export const HelpCircle: any;
  export const AlertCircle: any;
  export const Info: any;
  export const ArrowRight: any;
  export const ArrowLeft: any;
  export const CheckCircle: any;
  export const Play: any;
  export const Pause: any;
  export const Volume2: any;
  export const VolumeX: any;
  export const Copy: any;
  export const ExternalLink: any;
  export const LogOut: any;
  export const Menu: any;
  export const X: any;
  export const Sparkle: any;
  export const Edit2: any;
  export const Download: any;
  export const Upload: any;
  export const Eye: any;
  export const EyeOff: any;
  export const PhoneCall: any;
  export const AlertTriangle: any;
  export const Moon: any;
  export const Sun: any;
  export const Globe: any;
  export const Lock: any;
  export const Unlock: any;
  export const FileText: any;
  export const CreditCard: any;
  export const BookOpen: any;
}

declare module "react-router-dom" {
  export const Link: any;
  export const NavLink: any;
  export const useNavigate: any;
  export const useParams: any;
  export const useLocation: any;
  export const Outlet: any;
  export const BrowserRouter: any;
  export const Routes: any;
  export const Route: any;
  export const Navigate: any;
}
