import { EventEmitter } from 'events';

export const dashboardEvents = new EventEmitter();
dashboardEvents.setMaxListeners(100);

export function notifyNewRequest(entry?: any) {
    try {
        dashboardEvents.emit('new_request', entry || {});
    } catch (err) {
        console.error('[DashboardEvents] Failed to emit new_request:', err);
    }
}
