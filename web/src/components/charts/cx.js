import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tremor's class helper: compose conditionally, then let later classes win. */
export function cx(...args) {
  return twMerge(clsx(...args));
}
