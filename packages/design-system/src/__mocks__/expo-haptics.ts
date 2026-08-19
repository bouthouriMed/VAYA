export enum NotificationFeedbackType {
  Success = 'success',
  Warning = 'warning',
  Error = 'error',
}

export enum ImpactFeedbackStyle {
  Light = 'light',
  Medium = 'medium',
  Heavy = 'heavy',
}

export async function notificationAsync(_type?: NotificationFeedbackType): Promise<void> {
  return Promise.resolve();
}

export async function selectionAsync(): Promise<void> {
  return Promise.resolve();
}

export async function impactAsync(_style?: ImpactFeedbackStyle): Promise<void> {
  return Promise.resolve();
}
