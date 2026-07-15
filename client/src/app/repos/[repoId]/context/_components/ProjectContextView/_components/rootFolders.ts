/** Root folders offered by the create/upload forms' root-folder picker.
    Mirrors the server's DEFAULT_ROOT_FOLDERS
    (`server/src/modules/project-context/constants.ts`). There is no client-
    fetchable endpoint for a workspace's configured override (no Settings UI
    is in scope for this feature), so the default list is what's offered. */
export const ROOT_FOLDERS = ["specs", "docs", "insights"] as const;
