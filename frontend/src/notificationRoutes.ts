export type AppRole = 'parent' | 'driver' | 'child' | 'admin';

/**
 * Notification data never supplies an arbitrary screen. Keeping this mapping
 * local and allowlisted prevents untrusted push payloads from becoming open
 * redirects or exposing a screen meant for a different role.
 */
export function destinationForNotification(role: AppRole, type: unknown) {
  const notificationType = typeof type === 'string' ? type : '';
  if (role === 'parent') {
    return notificationType === 'message' ? '/(parent)/chat' : '/(parent)/map';
  }
  if (role === 'driver') {
    return notificationType === 'message' ? '/(driver)/chat' : '/(driver)';
  }
  if (role === 'admin') {
    return ['emergency', 'no_show', 'delay', 'child_pending_assignment', 'compliance'].includes(notificationType)
      ? '/(admin)/operations'
      : '/(admin)';
  }
  return '/(child)';
}
