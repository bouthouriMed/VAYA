import { z } from 'zod';

export const notificationIdParamSchema = z.object({
  notificationId: z.string().uuid(),
});
export type NotificationIdParam = z.infer<typeof notificationIdParamSchema>;

export const devicePlatformSchema = z.enum(['ios', 'android']);
export type DevicePlatform = z.infer<typeof devicePlatformSchema>;

export const registerPushTokenSchema = z.object({
  // Expo push tokens only (`ExponentPushToken[...]` / `ExpoPushToken[...]`):
  // the value is later sent verbatim as the `to` of Expo's push API, so an
  // arbitrary string here was an arbitrary-recipient lever, not just data.
  token: z
    .string()
    .min(10)
    .max(255)
    .regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/, 'Not a valid Expo push token'),
  platform: devicePlatformSchema,
});
export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>;

export const unregisterPushTokenSchema = registerPushTokenSchema.pick({ token: true });
export type UnregisterPushTokenInput = z.infer<typeof unregisterPushTokenSchema>;
