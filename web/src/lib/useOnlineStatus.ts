import { useEffect, useState } from 'react';
import { getQueue, getRejected, flushQueue } from './offlineQueue';

export function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [queueLength, setQueueLength] = useState(getQueue().length);
  const [rejectedLength, setRejectedLength] = useState(getRejected().length);

  useEffect(() => {
    function updateQueue() {
      setQueueLength(getQueue().length);
      setRejectedLength(getRejected().length);
    }
    function handleOnline() {
      setOnline(true);
      flushQueue().then(updateQueue);
    }
    function handleOffline() {
      setOnline(false);
    }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('cyv-queue-changed', updateQueue);
    const interval = setInterval(() => {
      flushQueue().then(updateQueue);
    }, 30000);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('cyv-queue-changed', updateQueue);
      clearInterval(interval);
    };
  }, []);

  return { online, queueLength, rejectedLength };
}
