export type ActivityColor = 'sage' | 'amber' | 'rose' | 'blue' | 'lavender';

export interface Card {
  id: string;
  name: string;
  icon: string;
  color: ActivityColor;
  duration: number | null;
}

export interface CardInput {
  id: string;
  name: string;
  icon?: string;
  color?: ActivityColor;
  duration?: number | null;
}

export interface Entry extends Omit<Card, 'id'> {
  id: string;
  cardId: string;
  start: number | null;
  end: number;
  note: string;
  estimated: true;
  createdAt: number;
}

export interface EntryOptions {
  now?: number;
  end?: number;
  duration?: number | null;
  note?: string;
}

export interface State {
  cards: Card[];
  entries: Entry[];
}

export interface CollectionChanges<T> {
  upsert: T[];
  remove: string[];
}

export interface Changes {
  cards: CollectionChanges<Card>;
  entries: CollectionChanges<Entry>;
}

export interface ActivityChange {
  entries: Entry[];
  entry: Entry;
  before: Entry[];
  merged: boolean;
}

export interface DayTotal {
  day: string;
  count: number;
  totalMinutes: number;
}

export interface ActivityTotal extends Pick<Card, 'name' | 'icon' | 'color'> {
  count: number;
  minutes: number;
}

export interface DaySummary {
  count: number;
  totalMinutes: number;
  byActivity: ActivityTotal[];
}

export interface SlotActivity {
  entry: Entry;
  minutes: number;
}

export interface TimeSlot {
  startMinute: number;
  availableMinutes: number;
  activity: SlotActivity | null;
  activities: SlotActivity[];
  points: Entry[];
}

export interface WeekColumn {
  day: string;
  slots: TimeSlot[];
}

export interface WeekSummary extends Omit<DaySummary, 'byActivity'> {
  days: DayTotal[];
  byActivity: (ActivityTotal & { days: { count: number; minutes: number; unknownCount: number }[] })[];
  blocks: WeekColumn[];
}

export interface WeekLayout {
  startSlot: number;
  endSlot: number;
  columns: {
    day: string;
    runs: { startSlot: number; endSlot: number; activity: Entry | null; slots: TimeSlot[] }[];
  }[];
}

export interface AccountUser {
  uid: string;
  displayName?: string | null;
  email?: string | null;
}

export interface SyncStatus {
  kind: string;
  message: string;
}

export interface CloudCallbacks {
  onAuth?: (user: AccountUser | null) => void;
  onData?: (data: State) => void;
  onStatus?: (status: SyncStatus) => void;
}

export interface CloudAdapter {
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  writeChanges(changes: Changes): Promise<void>;
  stop(): void;
}

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface AccountOptions {
  guest: State;
  storage?: StorageAdapter;
  connect: (callbacks: CloudCallbacks) => Promise<CloudAdapter>;
  onChange?: (event: { accountChanged: boolean }) => void;
  onStatus?: (status: SyncStatus) => void;
}

export interface AccountStore {
  readonly user: AccountUser | null;
  readonly data: State;
  readonly status: SyncStatus;
  readonly ready: boolean;
  readonly connected: boolean;
  readonly pending: boolean;
  readonly warning: string;
  setWritesPaused(paused: boolean): void;
  start(): Promise<void>;
  persist(): void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  retry(): Promise<void>;
  importGuest(): void;
  stop(): void;
}

// The SDK boundary accepts the modular Firebase functions without a runtime dependency.
export interface FirebaseDependencies {
  auth: { currentUser: AccountUser | null };
  db: unknown;
  authApi: {
    onAuthStateChanged: (...args: any[]) => () => void;
    GoogleAuthProvider: new () => unknown;
    signInWithPopup: (...args: any[]) => Promise<unknown>;
    signOut: (...args: any[]) => Promise<unknown>;
  };
  dbApi: {
    collection: (...args: any[]) => unknown;
    doc: (...args: any[]) => unknown;
    onSnapshot: (...args: any[]) => () => void;
    writeBatch: (...args: any[]) => {
      set: (...args: any[]) => unknown;
      delete: (...args: any[]) => unknown;
      commit: () => Promise<unknown>;
    };
  };
}

export type WriteOperation = { collection: 'cards' | 'entries'; id: string } & (
  { type: 'set'; data: Record<string, unknown> } | { type: 'delete' }
);
