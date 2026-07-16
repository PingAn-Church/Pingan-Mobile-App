const listeners = new Set();

export const emitModerationEvent = (event) => {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch (error) {
      console.error("Failed to handle moderation event:", error);
    }
  });
};

export const subscribeModerationEvents = (listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
