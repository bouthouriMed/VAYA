export type UUID = string;

export interface Timestamped {
  createdAt: Date;
  updatedAt: Date;
}

export interface Identifiable {
  id: UUID;
}

export type TimestampedEntity = Identifiable & Timestamped;

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
