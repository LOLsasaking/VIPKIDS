import { destinationForNotification } from '@/src/notificationRoutes';

describe('notification navigation', () => {
  test('routes family and driver messages only to their own chat', () => {
    expect(destinationForNotification('parent', 'message')).toBe('/(parent)/chat');
    expect(destinationForNotification('driver', 'message')).toBe('/(driver)/chat');
  });

  test('routes safety alerts to the admin operations screen', () => {
    for (const type of ['emergency', 'no_show', 'delay', 'child_pending_assignment', 'compliance']) {
      expect(destinationForNotification('admin', type)).toBe('/(admin)/operations');
    }
  });

  test('never accepts a screen supplied by an untrusted payload', () => {
    expect(destinationForNotification('parent', '/(admin)')).toBe('/(parent)/map');
    expect(destinationForNotification('child', 'message')).toBe('/(child)');
  });
});
