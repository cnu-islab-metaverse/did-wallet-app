// Scheduler polyfill for Chrome Extension
// React 19의 scheduler 모듈이 external로 처리될 때 사용

export const unstable_scheduleCallback = (
  priorityLevel: number,
  callback: () => void,
  options?: { delay?: number }
) => {
  const delay = options?.delay || 0;
  return setTimeout(callback, delay);
};

export const unstable_cancelCallback = (id: number) => {
  clearTimeout(id);
};

export const unstable_shouldYield = () => false;

export const unstable_requestPaint = () => {};

export const unstable_now = () => performance.now();

export const unstable_getCurrentPriorityLevel = () => 3; // NormalPriority

export const unstable_ImmediatePriority = 1;
export const unstable_UserBlockingPriority = 2;
export const unstable_NormalPriority = 3;
export const unstable_LowPriority = 4;
export const unstable_IdlePriority = 5;

export default {
  unstable_scheduleCallback,
  unstable_cancelCallback,
  unstable_shouldYield,
  unstable_requestPaint,
  unstable_now,
  unstable_getCurrentPriorityLevel,
  unstable_ImmediatePriority,
  unstable_UserBlockingPriority,
  unstable_NormalPriority,
  unstable_LowPriority,
  unstable_IdlePriority,
};
