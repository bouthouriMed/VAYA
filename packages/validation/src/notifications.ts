import { z } from 'zod';

export const notificationIdParamSchema = z.object({
  notificationId: z.string().uuid(),
});
export type NotificationIdParam = z.infer<typeof notificationIdParamSchema>;

export const devicePlatformSchema = z.enum(['ios', 'android']);
export type DevicePlatform = z.infer<typeof devicePlatformSchema>;

export const registerPushTokenSchema = z.object({
  token: z.string().min(10).max(255),
  platform: devicePlatformSchema,
});
export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>;
