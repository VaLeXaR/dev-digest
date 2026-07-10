import {
  MAX_FILE_SIZE as REPO_INTEL_MAX_FILE_SIZE,
  EXCLUDED_DIRS as REPO_INTEL_EXCLUDED_DIRS,
} from '../repo-intel/constants.js';

/** Extension a discovered/attachable Project Context document must have. */
export const MD_EXT = '.md';

/** [T1] Same cap repo-intel's walk uses (400 KB) — reused, not redefined. */
export const MAX_FILE_SIZE = REPO_INTEL_MAX_FILE_SIZE;

/** Directories never walked when discovering docs — same list repo-intel's walk uses. */
export const EXCLUDED_DIRS = REPO_INTEL_EXCLUDED_DIRS;

/** Workspace-setting fallback when `context_root_folders` is unset/invalid. */
export const DEFAULT_ROOT_FOLDERS: string[] = ['specs', 'docs', 'insights'];
